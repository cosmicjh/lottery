/** Recoverable, fail-closed historical backfill with atomic checkpoints. */
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fetchPensionHistory,fetchPensionRound,mergePension} from './pension-collector.mjs';
import {validatePensionRows} from './pension-research.mjs';

export function missingPensionRounds(rows,latestRound){
 if(!Number.isSafeInteger(latestRound)||latestRound<0||latestRound>10000)throw Error('최종 회차 범위 오류');
 const known=new Set(validatePensionRows(rows).map(d=>d.round));
 const out=[];for(let r=1;r<=latestRound;r++)if(!known.has(r))out.push(r);
 return out;
}
export function pensionDataSnapshot(prior,draws,now=new Date().toISOString()){
 if(prior?.product!=='pension720'||prior?.schema!==1||!Array.isArray(prior.draws))throw Error('기존 JSON 스키마 또는 상품 식별자 오류');
 const valid=validatePensionRows(draws),last=valid.at(-1)?.round??0,missing=missingPensionRounds(valid,last);
 const completeThroughRound=missing.length?missing[0]-1:last;
 const dateSequenceWarnings=[];
 for(let i=1;i<valid.length;i++){
  const prev=valid[i-1],curr=valid[i];
  if(curr.round!==prev.round+1)continue;
  const days=(Date.parse(curr.date+'T00:00:00Z')-Date.parse(prev.date+'T00:00:00Z'))/86400000;
  if(days!==7)dateSequenceWarnings.push({round:curr.round,previousRound:prev.round,intervalDays:days});
 }
 const status=missing.length?`공식 회차 부분 수집: ${valid.length}건 저장, 누락 ${missing.length}건`:
  dateSequenceWarnings.length?`공식 회차 저장 완료, 추첨일 간격 ${dateSequenceWarnings.length}건 확인 필요`:
  `공식 확인 ${last}회까지 연속 수집 완료`;
 return {
  schema:1,product:'pension720',checkedAt:now,lastVerifiedRound:last,
  completeThroughRound,missingCount:missing.length,missingRounds:missing,dateSequenceWarnings,
  status,draws:valid
 };
}
export async function atomicSave(file,data){
 const tmp=`${file}.${process.pid}.${randomUUID()}.tmp`;
 try{
  await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  await rename(tmp,file);
 }catch(e){await unlink(tmp).catch(()=>{});throw e;}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Injected fetch functions permit complete offline tests with faithful API-shaped fixtures. */
export async function collectPensionHistory({
 file,history=fetchPensionHistory,round=fetchPensionRound,
 maxRequests=20,retries=2,intervalMs=250,wait=sleep,log=console
}={}){
 if(typeof file!=='string'||!file||!Number.isInteger(maxRequests)||maxRequests<0||maxRequests>1000||
    !Number.isInteger(retries)||retries<0||retries>5||!Number.isInteger(intervalMs)||intervalMs<0||intervalMs>60000)
  throw Error('수집 설정 범위 오류');
 const prior=JSON.parse(await readFile(file,'utf8'));
 if(prior?.schema!==1||prior?.product!=='pension720')throw Error('연금복권 JSON 스키마 오류');
 let draws=validatePensionRows(prior.draws);let saved=0,apiVerified=false,bulkOk=false,latestRound=draws.at(-1)?.round??0;
 const issues=[];
 async function retry(fn){
  let last;for(let attempt=0;attempt<=retries;attempt++){
   try{return await fn();}catch(e){
    last=e;
    // Avoid retrying permanent 403/404 or malformed official payloads.
    const transient=/HTTP (?:429|5\d\d)|timed out|timeout|ETIMEDOUT|EAI_AGAIN|ECONNRESET|fetch failed|network/i.test(e.message);
    if(!transient)throw e;
    if(attempt<retries)await wait(Math.min(5000,500*(2**attempt)));
   }
  }throw last;
 }
 async function checkpoint(fresh){
  const merged=mergePension(draws,fresh);
  // Never change the existing file when a newly fetched record conflicts.
  const snap=pensionDataSnapshot(prior,merged);
  await atomicSave(file,snap);
  saved+=merged.length-draws.length;
  draws=merged;
  latestRound=Math.max(latestRound,draws.at(-1)?.round??0);
 }
 try{
  const bulk=await retry(()=>history());
  // Validate every row before committing any: malformed / contradictory responses are rejected.
  validatePensionRows(bulk);
  if(!bulk.length)throw Error('전체 회차 목록이 비었습니다');
  await checkpoint(bulk);
  bulkOk=true;apiVerified=true;
  log.log(`공식 전체 회차 응답 검증: ${bulk.length}개, 기존 포함 ${draws.length}개 보존`);
 }catch(e){
  issues.push('일괄 조회 실패: '+e.message);
  log.warn?.(issues.at(-1));
  if(/기존 공식 결과와 충돌/.test(e.message)||/EEXIST|EACCES|EPERM|ENOSPC/.test(e.message))throw e;
 }
 // If full history is unreachable, obtain the latest draw from the per-round endpoint.
 // Even when full history succeeds, this optional probe detects a newly issued round.
 try{
  const latest=await retry(()=>round(null));
  await checkpoint([latest]);
  latestRound=Math.max(latestRound,latest.round);
  apiVerified=true;
 }catch(e){
  if(!bulkOk||/기존 공식 결과와 충돌/.test(e.message))issues.push('최신 회차 조회 실패: '+e.message);
  if(/기존 공식 결과와 충돌/.test(e.message))throw e;
 }
 if(!apiVerified)return {ok:false,stored:draws.length,added:0,missing:missingPensionRounds(draws,latestRound),issues};
 const pending=missingPensionRounds(draws,latestRound).slice(0,maxRequests);
 // Newest draw was saved before this loop; backfill oldest gaps first for contiguous coverage.
 let consecutiveFailures=0;
 for(const r of pending){
  try{
   const d=await retry(()=>round(r));
   if(d.round!==r)throw Error(`${r}회 요청에 ${d.round}회 결과가 수신됨`);
   await checkpoint([d]);
   consecutiveFailures=0;
   log.log(`연금복권 ${r}회 검증 저장 (${draws.length}개 누적)`);
  }catch(e){
   issues.push(`${r}회 보충 실패: ${e.message}`);
   log.warn?.(issues.at(-1));
   if(/기존 공식 결과와 충돌|EEXIST|EACCES|EPERM|ENOSPC/.test(e.message))throw e;
   consecutiveFailures++;
   // Respect access blocks/outages. Earlier successful checkpoints remain durable.
   if(consecutiveFailures>=3){log.warn?.('연속 3회 실패: 추가 조회 중단, 다음 실행에서 재시도');break;}
  }
  if(intervalMs)await wait(intervalMs);
 }
 const missing=missingPensionRounds(draws,latestRound);
 // No verified source at all implies complete failure. A bulk failure followed by valid per-round
 // records does not claim the bulk was successful; metadata records only actual saved rounds.
 return {ok:apiVerified&&issues.every(x=>!x.includes('보충 실패')),stored:draws.length,added:saved,
  bulkOk,latestRound,missing,issues};
}
