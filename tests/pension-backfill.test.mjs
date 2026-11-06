import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parsePensionHistory,fetchPensionHistory,PENSION_HISTORY_API,mergePension} from '../scripts/pension-collector.mjs';
import {collectPensionHistory,pensionDataSnapshot,missingPensionRounds} from '../scripts/pension-backfill.mjs';
const silent={log:()=>{},warn:()=>{}};
function entry(r){
 const day=new Date(Date.UTC(2020,3,30)+7*86400000*(r-1)).toISOString().slice(0,10);
 return {round:r,date:day,group:(r%5)+1,number:String(100000+r).padStart(6,'0'),bonus:String(200000+r).padStart(6,'0'),source:'official',sourceUrl:PENSION_HISTORY_API};
}
function bulkRow(d){return {psltEpsd:String(d.round),psltRflYmd:d.date.replaceAll('-',''),wnBndNo:String(d.group),wnRnkVl:d.number,bnsRnkVl:d.bonus};}
function fakeHttp(payload){return {ok:true,text:async()=>JSON.stringify(payload)};}
const original={schema:1,product:'pension720',status:'미수집',draws:[]};
async function tempFixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'pension-history-test-')),file=join(dir,'data.json');
 try{await writeFile(file,JSON.stringify(original));return await fn(file,dir);}finally{await rm(dir,{recursive:true,force:true});}
}
test('bulk official endpoint accepts documented data.result with zero-padding and sorted rounds',()=>{
 const x=parsePensionHistory({data:{result:[bulkRow({...entry(2),number:'000012',bonus:'000009'}),bulkRow(entry(1))]}});
 assert.equal(x.length,2);assert.deepEqual(x.map(r=>r.round),[1,2]);assert.equal(x[1].number,'000012');assert.equal(x[1].bonus,'000009');
});
test('bulk endpoint rejects incomplete, malformed and contradictory duplicates',()=>{
 assert.throws(()=>parsePensionHistory({data:{result:[]}}));
 assert.throws(()=>parsePensionHistory({data:{result:[{...bulkRow(entry(1)),bnsRnkVl:null}]}}));
 assert.throws(()=>parsePensionHistory({data:{result:[bulkRow(entry(1)),{...bulkRow(entry(1)),wnRnkVl:'888888'}]}}));
 assert.throws(()=>parsePensionHistory({data:{result:[{...bulkRow(entry(1)),psltRflYmd:'20200429'}]}}));
});
test('bulk endpoint reads official host and sets anti-bot request headers',async()=>{
 const x=await fetchPensionHistory(async(url,init)=>{assert.equal(url,PENSION_HISTORY_API);assert.equal(init.headers['X-Requested-With'],'XMLHttpRequest');assert.match(init.headers.Referer,/\/pt720\/result/);return fakeHttp({data:{result:[bulkRow(entry(1))]}});});
 assert.equal(x.length,1);
});
test('single round or history conflict never overwrites existing official result',()=>{
 assert.throws(()=>mergePension([entry(1)],[{...entry(1),number:'999999'}]),/충돌/);
});
test('snapshot derives exact missing list and contiguous-completion marker',()=>{
 const a=pensionDataSnapshot(original,[entry(1),entry(3)]);
 assert.equal(a.completeThroughRound,1);assert.equal(a.lastVerifiedRound,3);assert.equal(a.missingCount,1);assert.deepEqual(a.missingRounds,[2]);
 const b=pensionDataSnapshot(original,[entry(1),entry(2),entry(3)]);
 assert.equal(b.completeThroughRound,3);assert.equal(b.missingCount,0);
});
test('gap reporting checks all rounds rather than assuming all saved rounds are consecutive',()=>{
 assert.deepEqual(missingPensionRounds([entry(1),entry(3),entry(5)],5),[2,4]);
 assert.throws(()=>missingPensionRounds([],10001));
});
test('full bulk history imports in one request and emits complete state',async()=>tempFixture(async(file,dir)=>{
 let h=0;const list=[entry(3),entry(1),entry(2),entry(4)];
 const res=await collectPensionHistory({file,history:async()=>{h++;return list;},round:async()=>entry(4),intervalMs:0,wait:async()=>{},log:silent});
 assert.equal(h,1);assert.equal(res.added,4);assert.equal(res.missing.length,0);
 const db=JSON.parse(await readFile(file,'utf8'));
 assert.deepEqual(db.draws.map(d=>d.round),[1,2,3,4]);assert.equal(db.completeThroughRound,4);
 assert.deepEqual((await readdir(dir)).filter(x=>x.includes('.tmp')),[]);
}));
test('partial response is checkpointed and failed round does not roll back successful neighbors',async()=>tempFixture(async file=>{
 const collected=[];
 const res=await collectPensionHistory({file,history:async()=>[entry(1),entry(3),entry(5)],
 round:async r=>{collected.push(r);if(r===null)return entry(5);if(r===4)throw Error('HTTP 503');return entry(r);},
 maxRequests:10,retries:0,intervalMs:0,wait:async()=>{},log:silent});
 assert.deepEqual(collected,[null,2,4]);assert.equal(res.ok,false);assert.equal(res.stored,4);assert.deepEqual(res.missing,[4]);
 const db=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(db.draws.map(d=>d.round),[1,2,3,5]);
 assert.equal(db.completeThroughRound,3);
 // Next run recovers only gap 4; older draws and timestamps are untouched.
 const next=await collectPensionHistory({file,history:async()=>{throw Error('Bulk blocked');},
 round:async r=>entry(r??5),maxRequests:10,retries:0,intervalMs:0,wait:async()=>{},log:silent});
 assert.equal(next.added,1);assert.deepEqual(next.missing,[]);
 const after=JSON.parse(await readFile(file,'utf8'));assert.equal(after.draws.length,5);
 assert.equal(after.completeThroughRound,5);
}));
test('when network is unavailable, original file is byte-for-byte unchanged',async()=>tempFixture(async file=>{
 const before=await readFile(file,'utf8');
 const result=await collectPensionHistory({file,history:async()=>{throw Error('EAI_AGAIN');},round:async()=>{throw Error('403');},retries:0,intervalMs:0,wait:async()=>{},log:silent});
 assert.equal(result.ok,false);assert.equal(await readFile(file,'utf8'),before);
}));
test('conflicting bulk record prevents any checkpoint from being saved',async()=>tempFixture(async file=>{
 const stored=pensionDataSnapshot(original,[entry(1)]);await writeFile(file,JSON.stringify(stored));
 const before=await readFile(file,'utf8');
 await assert.rejects(collectPensionHistory({file,history:async()=>[{...entry(1),number:'999999'}],round:async()=>entry(1),retries:0,intervalMs:0,wait:async()=>{},log:silent}),/충돌/);
 assert.equal(await readFile(file,'utf8'),before);
}));
test('requested round mismatch is rejected without inserting the wrong record',async()=>tempFixture(async file=>{
 const res=await collectPensionHistory({file,history:async()=>[entry(1),entry(3)],round:async r=>r===null?entry(3):entry(3),retries:0,intervalMs:0,wait:async()=>{},log:silent});
 assert.equal(res.ok,false);assert.deepEqual(res.missing,[2]);
 const db=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(db.draws.map(d=>d.round),[1,3]);
}));
test('resume is idempotent: repeated successful runs do not duplicate draws',async()=>tempFixture(async file=>{
 for(let i=0;i<3;i++)await collectPensionHistory({file,history:async()=>[entry(1),entry(2)],round:async()=>entry(2),intervalMs:0,wait:async()=>{},log:silent});
 const db=JSON.parse(await readFile(file,'utf8'));assert.equal(db.draws.length,2);
}));
test('per-run limit allows gradual catch-up when bulk is unreachable',async()=>tempFixture(async file=>{
 const res=await collectPensionHistory({file,history:async()=>{throw Error('403');},round:async r=>entry(r??5),retries:0,intervalMs:0,maxRequests:2,wait:async()=>{},log:silent});
 assert.equal(res.added,3);assert.deepEqual(res.missing,[3,4]);
 assert.equal(JSON.parse(await readFile(file,'utf8')).completeThroughRound,2);
}));

test('date spacing anomalies are reported, never silently corrected',()=>{
 const odd={...entry(2),date:'2020-05-14'};
 const snap=pensionDataSnapshot(original,[entry(1),odd]);
 assert.equal(snap.dateSequenceWarnings.length,1);
 assert.equal(snap.dateSequenceWarnings[0].intervalDays,14);
 assert.match(snap.status,/확인 필요/);
});
test('persistent failures trigger circuit breaker after three rounds',async()=>tempFixture(async file=>{
 let attempts=0;
 const res=await collectPensionHistory({file,history:async()=>{throw Error('403');},round:async r=>{
  if(r===null)return entry(10);attempts++;throw Error('HTTP 403');
 },retries:3,intervalMs:0,maxRequests:100,wait:async()=>{},log:silent});
 assert.equal(attempts,3);assert.equal(res.stored,1);assert.ok(res.missing.length>0);
}));
