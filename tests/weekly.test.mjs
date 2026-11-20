import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {WEEKLY_VERSION,DISJOINT_WEEKLY_VERSION,weeklyFive,nextWeeklyTarget,gradeWeekly,validateWeeklyRecords} from '../scripts/weekly.mjs';
const V2=DISJOINT_WEEKLY_VERSION;
test('five unique games stable across repeated calls and rounds',async()=>{
 const a=await weeklyFive(1234,V2);assert.deepEqual(a,await weeklyFive(1234,V2));assert.notDeepEqual(a,await weeklyFive(1235,V2));assert.equal(a.length,5);assert.equal(new Set(a.map(x=>x.join(','))).size,5);for(const x of a){assert.equal(new Set(x).size,6);assert.ok(x.every(n=>n>=1&&n<=45));}
 await assert.rejects(()=>weeklyFive(0,V2));await assert.rejects(()=>weeklyFive(1.1,V2));
});
test('all lottery ranks including bonus',()=>{const d={nums:[1,2,3,4,5,6],bonus:7};assert.deepEqual(gradeWeekly([[1,2,3,4,5,6],[1,2,3,4,5,7],[1,2,3,4,5,8],[1,2,3,4,8,9],[1,2,3,8,9,10],[1,2,8,9,10,11]],d).map(x=>x.rank),[1,2,3,4,5,0]);});
test('stale source and cutoff cannot be recorded as next round',()=>{const d=[{round:100,date:'2026-09-05'}];assert.equal(nextWeeklyTarget(d,Date.parse('2026-09-12T10:59:59Z')).round,101);assert.equal(nextWeeklyTarget(d,Date.parse('2026-09-12T11:00:00Z')),null);assert.equal(nextWeeklyTarget([]),null);assert.equal(nextWeeklyTarget([{round:100,date:'bad'}]),null);});
test('record tampering and duplicate records rejected',async()=>{const r={round:1234,version:V2,games:await weeklyFive(1234,V2),createdAt:'2026-09-11T01:00:00Z',timing:'unverified'};assert.equal((await validateWeeklyRecords([r])).length,1);await assert.rejects(()=>validateWeeklyRecords([r,r]));await assert.rejects(async()=>validateWeeklyRecords([{...r,games:await weeklyFive(1235,V2)}]));});
async function bootPage(profile){
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element()]));
 function element(){return {value:'',textContent:'',hidden:false,disabled:false,children:[],classList:{toggle(){}},append(...x){this.children.push(...x);},replaceChildren(){this.children=[];},click(){},select(){}};}
 const respond=url=>{const u=String(url);if(u.includes('popularity'))return profile?{ok:true,json:async()=>profile}:{ok:false,status:404,json:async()=>({})};return {ok:true,json:async()=>u.includes('weekly')?{records:[]}:{draws:[]}};};
 const stored=new Map(),context={document:{getElementById:id=>ids.get(id),createElement:element,head:element()},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},crypto:webcrypto,TextEncoder,DataView,Uint32Array,URL,Blob,console,setTimeout,clearTimeout,navigator:{clipboard:{writeText:async()=>{}}},fetch:async url=>respond(url)};
 context.window=context;vm.createContext(context);vm.runInContext(await readFile(new URL('../scripts/portfolio.js',import.meta.url),'utf8'),context);ids.get('birthdayfactor').value='1.5';ids.get('othertickets').value='10000000';vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 await new Promise(r=>setTimeout(r,30));
 return {ids,stored};
}
test('browser startup, deterministic output, and record persistence',async()=>{
 const profile=JSON.parse(await readFile(new URL('../data/lotto-popularity.json',import.meta.url),'utf8'));
 const snapshot={id:profile.id,numbers:profile.numbers};
 const {ids,stored}=await bootPage(profile);
 ids.get('target').value='1234';await ids.get('generate').onclick();
 const a=JSON.parse(stored.get('lotto-weekly-records-v1'));assert.equal(a.length,1);
 assert.equal(a[0].version,WEEKLY_VERSION);assert.deepEqual(a[0].popularity,snapshot);
 assert.deepEqual(a[0].games,await weeklyFive(1234,WEEKLY_VERSION,snapshot));const first=a[0].createdAt;
 await ids.get('generate').onclick();assert.equal(JSON.parse(stored.get('lotto-weekly-records-v1'))[0].createdAt,first);assert.equal(ids.get('generated').children.length,5);
 assert.equal((await validateWeeklyRecords(a)).length,1);
});
test('browser falls back to uniform disjoint v2 without a usable popularity profile',async()=>{
 const profile=JSON.parse(await readFile(new URL('../data/lotto-popularity.json',import.meta.url),'utf8'));
 for(const bad of [null,{...profile,usable:false},{...profile,numbers:profile.numbers.slice(1)}]){
  const {ids,stored}=await bootPage(bad);
  ids.get('target').value='1234';await ids.get('generate').onclick();
  const a=JSON.parse(stored.get('lotto-weekly-records-v1'));
  assert.equal(a[0].version,V2);assert.equal(a[0].popularity,undefined);assert.deepEqual(a[0].games,await weeklyFive(1234,V2));
 }
});

import {LEGACY_WEEKLY_VERSION} from '../scripts/weekly.mjs';
import {coldRecord,evaluateStudy} from '../scripts/prospective.mjs';
test('v2 spans 30 distinct numbers across five games',async()=>{for(const r of [1,1241,1242,9999])assert.equal(new Set((await weeklyFive(r,V2)).flat()).size,30);});
test('legacy records retain exact historical output and coexist with v2',async()=>{
 const old=await weeklyFive(1234,LEGACY_WEEKLY_VERSION);assert.deepEqual(old,[[4,10,12,15,31,35],[2,6,12,23,25,26],[16,17,31,38,39,44],[9,10,16,23,27,37],[3,7,17,23,39,45]]);
 const r={round:1234,version:LEGACY_WEEKLY_VERSION,games:old,createdAt:'2026-09-11T01:00:00Z',timing:'unverified'};
 assert.equal((await validateWeeklyRecords([r,{...r,version:V2,games:await weeklyFive(1234,V2)}])).length,2);
});
const history=Array.from({length:100},(_,i)=>({round:1141+i,nums:[1,2,3,4,5,6],bonus:7,date:'2026-09-05'}));
test('study requires prior 100 rounds and cannot use known or late targets',async()=>{
 const now=Date.parse('2026-09-11T01:00:00Z'),r=await coldRecord(history,1241,now);
 assert.equal(r.trainingEnd,1240);assert.equal(r.nums.length,6);
 assert.deepEqual(r,await coldRecord(history,1241,now));
 await assert.rejects(()=>coldRecord(history.slice(1),1241,now));
 await assert.rejects(()=>coldRecord([...history,{...history[0],round:1241}],1241,now));
 await assert.rejects(()=>coldRecord(history,1241,Date.parse('2026-09-12T11:00:00Z')));
});
test('only recorded 1241+ results enter study metrics; missing and late excluded',async()=>{
 const r=await coldRecord(history,1241,Date.parse('2026-09-11T01:00:00Z'));
 const result={round:1241,nums:r.nums,bonus:Array.from({length:45},(_,i)=>i+1).find(n=>!r.nums.includes(n)),date:'2026-09-12'};
 const e=evaluateStudy([r],[...history,result,{...result,round:1242}]);assert.equal(e.n,1);assert.equal(e.meanHits,6);assert.equal(e.wins,1);
 assert.equal(evaluateStudy([r],history).n,0);
 assert.equal(evaluateStudy([r],[{...result,date:'2026-09-10'}]).n,0);
});
