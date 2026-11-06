/** Append-only purchase records, and separately tagged exploratory forecasts. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generatePortfolio,PENSION_VERSION} from './pension720.mjs';
import {validatePensionRows,categoricalModel} from './pension-research.mjs';
const getFile=x=>fileURLToPath(new URL('../data/'+x,import.meta.url));
async function save(file,payload){await writeFile(file+'.tmp',JSON.stringify(payload,null,2)+'\n');await rename(file+'.tmp',file);}
const ds=JSON.parse(await readFile(getFile('pension720-results.json'),'utf8'));
const history=validatePensionRows(ds.draws);
if(!history.length){console.log('연금복권 공식 이력 없음: 사전 기록 생성 보류');process.exit(0);}
const newest=history.at(-1);
// Official drawing on Thursday, next verified draw scheduled 7 days later.
const nextDate=new Date(Date.parse(newest.date+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
const cutoff=new Date(nextDate+'T08:00:00.000Z'),now=new Date();
if(now>=cutoff||now<Date.parse(newest.date+'T10:05:00Z')){console.log('공식 추첨 이후 및 다음 회차 판매마감 이전이 아님: 생성 보류');process.exit(0);}
const round=newest.round+1, createdAt=now.toISOString();
const weeklyFile=getFile('pension720-weekly.json'),weekly=JSON.parse(await readFile(weeklyFile,'utf8'));
if(!Array.isArray(weekly.records))throw Error('기존 추천기록 형식 오류');
for(const r of weekly.records){if(!Number.isInteger(r.round)||!r.version||!Array.isArray(r.tickets)||!Number.isFinite(Date.parse(r.createdAt)))throw Error('기존 추천기록 무결성 오류');}
if(!weekly.records.some(r=>r.round===round&&r.version===PENSION_VERSION)){
 weekly.records.push({round,version:PENSION_VERSION,tickets:generatePortfolio({count:5,strategy:'dispersed',round,seed:'public-weekly-v1'}),strategy:'dispersed',seedHash:createHash('sha256').update('public-weekly-v1').digest('hex'),createdAt,cutoff:cutoff.toISOString(),trainingEndRound:null,source:'algorithm-no-data'});
 await save(weeklyFile,weekly);console.log(round+'회 구매용 번호 최초 기록');
}
const studyFile=getFile('pension720-study.json'),study=JSON.parse(await readFile(studyFile,'utf8'));
if(!Array.isArray(study.records))throw Error('기존 연구기록 형식 오류');
if(history.length>=100&&!study.records.some(r=>r.round===round&&r.version==='pension720-dirichlet-v1')){
 const training=history.slice(-100);
 if(training.length===100&&training.every((d,i)=>i===0||d.round===training[i-1].round+1)){
  const hash=createHash('sha256').update(JSON.stringify(training)).digest('hex');
  study.records.push({round,version:'pension720-dirichlet-v1',model:'dirichlet-categorical-alpha20',predictions:Array.from({length:13},(_,i)=>categoricalModel(training,i,{mode:'bayes',alpha:20})),createdAt,cutoff:cutoff.toISOString(),trainingStartRound:training[0].round,trainingEndRound:newest.round,trainingHash:hash,classification:'연구전용, 구매번호 미반영'});
  await save(studyFile,study);console.log(round+'회 연구용 확률 최초 기록');
 }
}
