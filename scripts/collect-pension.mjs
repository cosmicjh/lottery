import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fetchPensionRound,mergePension} from './pension-collector.mjs';
import {validatePensionRows} from './pension-research.mjs';
const file=fileURLToPath(new URL('../data/pension720-results.json',import.meta.url));
const prior=JSON.parse(await readFile(file,'utf8'));
validatePensionRows(prior.draws);let draws=prior.draws;
try{
 const last=await fetchPensionRound();draws=mergePension(draws,[last]);
 const priorRounds=new Set(draws.map(d=>d.round)),missing=[];for(let r=1;r<=last.round;r++)if(!priorRounds.has(r))missing.push(r);
 // Gradual history backfill: 20 verified requests per run; no phantom dates, no overwrite.
 for(const r of missing.slice(-20).reverse()){const draw=await fetchPensionRound(r);draws=mergePension(draws,[draw]);}
 const next={schema:1,product:'pension720',checkedAt:new Date().toISOString(),lastVerifiedRound:last.round,draws:validatePensionRows(draws).reverse(),status:missing.length>20?'공식 확인 이력 보충 진행 중':'공식 조회 완료'};
 await writeFile(file+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(file+'.tmp',file);
 console.log('연금복권 공식 확인 '+next.draws.length+'회 / 최신 '+last.round+'회');
}catch(e){console.error('연금복권 수집 중단, 기존 기록 변경 없음:',e.message);process.exitCode=1;}
