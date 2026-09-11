import {validateRows} from './model.mjs';
import {researchForecast} from './research.mjs';
import {gradeWeekly} from './weekly.mjs';
const STUDY_VERSION='cold100-prospective-v1',STUDY_START=1241;
async function coldRecord(draws,round,now=Date.now()){
 if(!Number.isInteger(round)||round<STUDY_START||round>10000)throw Error('연구 대상은 1241회 이후입니다.');
 const clean=validateRows(draws),train=clean.filter(d=>d.round<round&&d.round>=round-100).sort((a,b)=>a.round-b.round);
 if(train.length!==100||train.some((d,i)=>d.round!==round-100+i))throw Error('직전 100회 학습 자료 누락');
 if(clean.some(d=>d.round>=round))throw Error('이미 결과가 있는 회차는 사전 기록하지 않습니다.');
 const last=train.at(-1);if(!last.date)throw Error('추첨일 확인 필요');
 const cutoff=Date.parse(last.date+'T00:00:00Z')+7*86400000+11*3600000;
 if(!Number.isFinite(now)||!Number.isFinite(cutoff)||now>=cutoff)throw Error('기록 마감 경과 또는 시각 오류');
 const probabilities=researchForecast(train,'cold');
 const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const tie=await Promise.all(Array.from({length:45},(_,i)=>digest(`${STUDY_VERSION}:${round}:${i+1}`)));
 const nums=Array.from({length:45},(_,i)=>i+1).sort((a,b)=>probabilities[b-1]-probabilities[a-1]||(tie[a-1]<tie[b-1]?-1:1)).slice(0,6).sort((a,b)=>a-b);
 return {version:STUDY_VERSION,round,createdAt:new Date(now).toISOString(),cutoff:new Date(cutoff).toISOString(),trainingStart:round-100,trainingEnd:round-1,trainingHash:await digest(JSON.stringify(train.map(d=>({round:d.round,nums:d.nums})))),probabilities,nums};
}
function validateStudy(records){
 if(!Array.isArray(records)||records.length>10000)throw Error('연구 기록 형식 오류');
 const seen=new Set();for(const r of records){
  if(r?.version!==STUDY_VERSION||!Number.isInteger(r.round)||r.round<STUDY_START||r.round>10000||seen.has(r.round)||r.trainingStart!==r.round-100||r.trainingEnd!==r.round-1||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.cutoff))||Date.parse(r.createdAt)>=Date.parse(r.cutoff)||!/^[a-f0-9]{64}$/.test(r.trainingHash))throw Error('연구 기록 메타데이터 오류');
  if(!Array.isArray(r.nums)||r.nums.length!==6||new Set(r.nums).size!==6||r.nums.some(n=>!Number.isInteger(n)||n<1||n>45)||!Array.isArray(r.probabilities)||r.probabilities.length!==45||r.probabilities.some(x=>!Number.isFinite(x)||x<0||x>1)||Math.abs(r.probabilities.reduce((a,b)=>a+b,0)-6)>1e-8)throw Error('연구 번호·확률 오류');seen.add(r.round);
 }return records;
}
function evaluateStudy(records,draws){
 validateStudy(records);const clean=validateRows(draws),byRound=new Map(clean.map(d=>[d.round,d]));
 let n=0,hits=0,brier=0,wins=0;const rows=[];
 for(const r of [...records].sort((a,b)=>a.round-b.round)){const d=byRound.get(r.round);if(!d){rows.push({round:r.round,status:'결과 대기'});continue;}
 // Use the actual result date to exclude late records even if the forecast schedule was wrong.
 const limit=d.date?Date.parse(d.date+'T11:00:00Z'):NaN;
 if(!Number.isFinite(limit)||Date.parse(r.createdAt)>=limit){rows.push({round:r.round,status:'시점 확인 불가 · 평가 제외'});continue;}
 const g=gradeWeekly([r.nums],d)[0],actual=new Set(d.nums),score=r.probabilities.reduce((s,p,i)=>s+(p-(actual.has(i+1)?1:0))**2,0)/45;
 n++;hits+=g.hits;brier+=score;if(g.rank)wins++;rows.push({round:r.round,status:g.rank?g.rank+'등':'낙첨',hits:g.hits,brier:score});
 }
 return {n,meanHits:n?hits/n:null,brier:n?brier/n:null,wins,baselineHits:.8,baselineBrier:(6/45)*(39/45),rows};
}
export {STUDY_VERSION,STUDY_START,coldRecord,validateStudy,evaluateStudy};
