import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {estimatePopularity,poissonFit} from '../scripts/popularity.mjs';
import {WEEKLY_VERSION,DISJOINT_WEEKLY_VERSION,weeklyFive,validateWeeklyRecords,usablePopularity} from '../scripts/weekly.mjs';
const require=createRequire(import.meta.url),p=require('../scripts/portfolio.js');
const root=new URL('../',import.meta.url),run=promisify(execFile);
const TOTAL=8145060,COMBOS=[1,6,228,13545,182780];

// Deterministic synthetic history: buyers over-pick numbers by exp(scale x truth). Ranks share fewer numbers
// with the drawn set the lower they are, so their counts react less (scale shrinks from rank 1 to rank 5).
function synthetic(rounds,{truth,scales=[2,2,1.3,1,.6],seed=1}){
 let state=seed>>>0;const uniform=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296;};
 const poisson=l=>{if(l>500)return Math.max(0,Math.round(l+Math.sqrt(l)*Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform())));let k=0,t=Math.exp(-l),s=t;const u=uniform();while(u>s){k++;t*=l/k;s+=t;}return k;};
 return Array.from({length:rounds},(_,i)=>{
  const pool=Array.from({length:45},(_,j)=>j+1);for(let j=0;j<6;j++){const k=j+Math.floor(uniform()*(45-j));[pool[j],pool[k]]=[pool[k],pool[j]];}
  const nums=pool.slice(0,6).sort((a,b)=>a-b),bonus=pool[6],sales=120_000_000_000,s=nums.reduce((a,n)=>a+truth[n-1],0);
  return {round:i+1,nums,bonus,stats:{sales,winners:COMBOS.map((c,r)=>poisson(sales/1000*c/TOTAL*Math.exp(scales[r]*s)))}};
 });
}
const truth=Array.from({length:45},(_,i)=>i<12?.04:i>=39?-.04:((i*7)%11-5)/250);
const corr=(a,b)=>{const m=x=>x.reduce((s,v)=>s+v,0)/x.length,ma=m(a),mb=m(b);let num=0,da=0,db=0;for(let i=0;i<a.length;i++){num+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}return num/Math.sqrt(da*db);};

test('Poisson fit recovers a known log-linear rate',()=>{
 const rows=Array.from({length:400},(_,i)=>({x:(i%20)/10,off:Math.log(50+i%7)}));
 for(const r of rows)r.y=Math.round(Math.exp(.3+.8*r.x+r.off));
 const fit=poissonFit(rows,{size:2,ridge:0,columns:r=>[[0,1],[1,r.x]],count:r=>r.y,offset:r=>r.off});
 assert.ok(Math.abs(fit.beta[0]-.3)<.01&&Math.abs(fit.beta[1]-.8)<.01);
});
test('estimator recovers planted buyer preferences and passes its own out-of-sample check',()=>{
 const profile=estimatePopularity(synthetic(800,{truth}),{source:'synthetic-test'});
 assert.equal(profile.rounds.count,650);assert.equal(profile.rounds.last,800);
 assert.ok(corr(profile.gamma,truth)>.95,'number effects follow the planted preference');
 assert.ok(Math.abs(profile.gamma.reduce((a,b)=>a+b,0))<1e-4,'effects are centred');
 // The 15 most over-picked planted numbers are 1-12 plus the largest of the rest.
 for(const n of [1,2,3,4,5,6,7,8,9,10,11,12])assert.ok(profile.excluded.includes(n),'excluded '+n);
 assert.deepEqual([...profile.numbers,...profile.excluded].sort((a,b)=>a-b),Array.from({length:45},(_,i)=>i+1));
 assert.ok(profile.numbers.every((n,i)=>!i||n>profile.numbers[i-1]));
 assert.deepEqual(profile.validation.trainRounds,[151,550]);assert.deepEqual(profile.validation.testRounds,[551,800]);
 assert.ok(profile.validation.tiers.every(t=>t.slope>0&&t.z>2));assert.equal(profile.usable,true);
});
test('without any buyer preference the profile is not marked usable',()=>{
 let usable=0;
 for(const seed of [3,4,5,6,7])usable+=estimatePopularity(synthetic(700,{truth:Array(45).fill(0),seed}),{source:'synthetic-test'}).usable?1:0;
 assert.ok(usable<=1,'pure noise rarely passes the out-of-sample check: '+usable+'/5');
});
test('insufficient statistics are reported, not guessed',()=>{
 const rows=synthetic(500,{truth});
 assert.throws(()=>estimatePopularity(rows),/부족/);
 assert.throws(()=>estimatePopularity(rows.map(({stats,...d})=>d)),/부족/);
 assert.throws(()=>estimatePopularity(rows,{window:300,holdout:250}),/구간/);
});

const profile=JSON.parse(await readFile(new URL('data/lotto-popularity.json',root),'utf8'));
const snapshot=usablePopularity(profile);
test('shipped profile is validated, covers 1-45 once, and excludes the most over-picked numbers',()=>{
 assert.ok(snapshot,'profile usable');assert.equal(snapshot.numbers.length,30);
 assert.deepEqual([...profile.numbers,...profile.excluded].sort((a,b)=>a-b),Array.from({length:45},(_,i)=>i+1));
 const rank=[...profile.gamma.keys()].sort((a,b)=>profile.gamma[a]-profile.gamma[b]||a-b).map(i=>i+1);
 assert.deepEqual([...rank.slice(0,30)].sort((a,b)=>a-b),profile.numbers);
 assert.ok(profile.validation.tiers[2].z>=2&&profile.validation.tiers[0].slope>0);
 assert.equal(usablePopularity({...profile,usable:false}),null);assert.equal(usablePopularity({...profile,numbers:[...profile.numbers.slice(1),45]}),null);
});
test('v3 games use only the 30 low-popularity numbers, stay disjoint, avoid patterns and keep exact odds',async()=>{
 const allowed=new Set(snapshot.numbers);
 for(let round=1;round<=400;round++){
  const games=await weeklyFive(round,WEEKLY_VERSION,snapshot);
  assert.deepEqual(games.flat().sort((a,b)=>a-b),snapshot.numbers);
  assert.ok(games.flat().every(n=>allowed.has(n)));assert.ok(!games.some(p.isPatternGame));
  assert.equal(p.disjointExact(games).counts.threePlus,966650);
 }
 assert.deepEqual(await weeklyFive(1251,WEEKLY_VERSION,snapshot),await weeklyFive(1251,WEEKLY_VERSION,snapshot));
 assert.notDeepEqual(await weeklyFive(1251,WEEKLY_VERSION,snapshot),await weeklyFive(1252,WEEKLY_VERSION,snapshot));
 await assert.rejects(()=>weeklyFive(1251,WEEKLY_VERSION,null),/인기도/);
 await assert.rejects(()=>weeklyFive(1251,WEEKLY_VERSION,{...snapshot,numbers:[...snapshot.numbers].reverse()}),/인기도/);
});
test('pattern rule flags runs of three and constant steps only',()=>{
 for(const g of [[1,2,3,20,30,40],[5,10,15,20,25,30],[2,9,16,23,30,37],[40,41,42,1,8,20]])assert.equal(p.isPatternGame(g),true,g.join());
 for(const g of [[1,2,4,5,7,8],[1,3,5,7,9,12],[14,15,20,29,43,44]])assert.equal(p.isPatternGame(g),false,g.join());
});
test('v3 records carry their snapshot; tampering with games or snapshot is rejected; v2 records still validate',async()=>{
 const games=await weeklyFive(1251,WEEKLY_VERSION,snapshot);
 const r={round:1251,version:WEEKLY_VERSION,games,popularity:snapshot,createdAt:'2026-11-15T01:00:00Z',timing:'before-cutoff'};
 const v2={round:1251,version:DISJOINT_WEEKLY_VERSION,games:await weeklyFive(1251,DISJOINT_WEEKLY_VERSION),createdAt:'2026-11-15T01:00:00Z',timing:'unverified'};
 const clean=await validateWeeklyRecords([r,v2]);assert.equal(clean.length,2);assert.deepEqual(clean.find(x=>x.version===WEEKLY_VERSION).popularity,snapshot);
 await assert.rejects(()=>validateWeeklyRecords([{...r,popularity:undefined}]));
 const swapped=[...snapshot.numbers];swapped[0]=profile.excluded[0];swapped.sort((a,b)=>a-b);
 await assert.rejects(()=>validateWeeklyRecords([{...r,popularity:{...snapshot,numbers:swapped}}]));
 await assert.rejects(()=>validateWeeklyRecords([{...r,games:[...games.slice(1),games[0]]}]));
});
test('personal mode with the profile is reproducible, seed-specific and limited to the same 30 numbers',async()=>{
 const a=await p.personalFive(1251,'my-seed',webcrypto,snapshot);
 assert.deepEqual(a,await p.personalFive(1251,'my-seed',webcrypto,snapshot));
 assert.notDeepEqual(a,await p.personalFive(1251,'other-seed',webcrypto,snapshot));
 assert.notDeepEqual(a,await p.personalFive(1251,'my-seed',webcrypto));
 assert.deepEqual(a.flat().sort((x,y)=>x-y),snapshot.numbers);assert.equal(p.checkGames(a,true).distinctNumbers,30);
});
test('profile builder keeps the existing profile while official statistics are insufficient',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'popularity-'));
 await mkdir(join(dir,'scripts'));await mkdir(join(dir,'data'));
 for(const f of ['popularity.mjs','model.mjs','build-popularity.mjs'])await copyFile(new URL('scripts/'+f,root),join(dir,'scripts',f));
 const before=JSON.stringify({schema:1,keep:true});await writeFile(join(dir,'data/lotto-popularity.json'),before);
 await writeFile(join(dir,'data/lotto.json'),JSON.stringify({schema:1,draws:synthetic(300,{truth})}));
 const out=await run(process.execPath,[join(dir,'scripts/build-popularity.mjs')]);
 assert.match(out.stdout,/보류/);assert.equal(await readFile(join(dir,'data/lotto-popularity.json'),'utf8'),before);
 await writeFile(join(dir,'data/lotto.json'),JSON.stringify({schema:1,draws:synthetic(700,{truth})}));
 await run(process.execPath,[join(dir,'scripts/build-popularity.mjs')]);
 const built=JSON.parse(await readFile(join(dir,'data/lotto-popularity.json'),'utf8'));
 assert.equal(built.source,'official');assert.equal(built.rounds.last,700);assert.equal(built.usable,true);
});
test('Actions estimates popularity after collection and before recording, then commits and publishes it',async()=>{
 const wf=await readFile(new URL('.github/workflows/lotto-pages.yml',root),'utf8');
 const collect=wf.indexOf('node scripts/collect-lotto.mjs'),build=wf.indexOf('node scripts/build-popularity.mjs'),record=wf.indexOf('node scripts/record-weekly.mjs');
 assert.ok(collect>0&&collect<build&&build<record);
 assert.equal(wf.split('data/lotto-popularity.json').length-1,2,'committed and copied to Pages');
});
