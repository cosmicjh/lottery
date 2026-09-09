import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {collectHistory} from './collector.mjs';
import {validateRows} from './model.mjs';
const path=fileURLToPath(new URL('../data/lotto.json',import.meta.url));
const prior=JSON.parse(await readFile(path,'utf8'));
validateRows(prior.draws);
const next={...prior,attemptedAt:new Date().toISOString(),ok:false};
async function save(){await writeFile(path+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(path+'.tmp',path);}
try {
 const result=await collectHistory(prior.draws,fetch,{onProgress:async p=>{
  next.draws=p.draws;next.coverage=p.coverage;
  next.status=`전체 이력 수집 중: ${p.coverage.collected}/${p.coverage.latest}회, 누락 ${p.coverage.missing.length}회. 다음 실행에서 이어서 수집합니다.`;
  await save();
 }});
 next.checkedAt=new Date().toISOString();next.ok=result.coverage.complete;
 if(next.ok){next.completeAt=next.checkedAt;next.status=`1~${result.coverage.latest}회 전체 ${result.coverage.collected}회 수집 완료. 누락 없음.`;}
 else{next.status=`이번 실행의 요청 상한 도달. ${result.coverage.collected}/${result.coverage.latest}회 저장, 누락 ${result.coverage.missing.length}회. 다시 실행하면 누락 회차부터 재개합니다.`;process.exitCode=1;}
} catch(e) {next.ok=false;next.status='공식 수집 중단: '+e.message+'. 이미 검증·저장한 회차는 유지하며 다음 실행에서 재시도합니다.';process.exitCode=1;}
await save();console.log(next.status);
