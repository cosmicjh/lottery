import {readFile,writeFile,rename} from 'node:fs/promises';
import {WEEKLY_VERSION,weeklyFive,nextWeeklyTarget,validateWeeklyRecords} from './weekly.mjs';
import {validateRows} from './model.mjs';
import {coldRecord,validateStudy} from './prospective.mjs';
const file=name=>new URL('../data/'+name,import.meta.url);
async function readRecords(name){try{return JSON.parse(await readFile(file(name),'utf8'));}catch(e){if(e.code==='ENOENT')return {schema:1,records:[]};throw e;}}
async function save(name,obj){await writeFile(file(name+'.tmp'),JSON.stringify(obj,null,2)+'\n');await rename(file(name+'.tmp'),file(name));}
const data=JSON.parse(await readFile(file('lotto.json'),'utf8')),draws=validateRows(data.draws);
const records=await validateWeeklyRecords((await readRecords('weekly.json')).records);
const study=validateStudy((await readRecords('study.json')).records),target=nextWeeklyTarget(draws);
if(target&&!records.some(r=>r.round===target.round&&r.version===WEEKLY_VERSION)){
 const games=await weeklyFive(target.round),now=Date.now();
 if(now<Date.parse(target.cutoff))records.push({round:target.round,version:WEEKLY_VERSION,games,createdAt:new Date(now).toISOString(),timing:'before-cutoff'});
}
let problem=null;
if(target&&target.round>=1241&&!study.some(r=>r.round===target.round)){
 try{study.push(await coldRecord(draws,target.round));}catch(e){problem=e.message;}
}
await save('weekly.json',{schema:1,records});
await save('study.json',{schema:1,protocol:{version:'cold100-prospective-v1',startRound:1241,trainingWindow:100,primaryMetric:'Brier',reviewEvery:100},records:study,status:problem||'사전 기록만 저장; 이미 발표된 회차는 소급 생성하지 않음'});
console.log(target?target.round+'회 기록 확인':'최신 회차·날짜 확인 필요');
if(problem){console.error('연구 기록 보류: '+problem);process.exitCode=1;}
