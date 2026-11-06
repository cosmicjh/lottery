import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {weeklyFive,LEGACY_WEEKLY_VERSION} from '../scripts/weekly.mjs';
import {researchForecast} from '../scripts/research.mjs';
const require=createRequire(import.meta.url),p=require('../scripts/portfolio.js');
const simple=Array.from({length:5},(_,i)=>Array.from({length:6},(_,j)=>6*i+j+1));

test('binomial coefficients, exact disjoint union counts and bonus prize tiers',()=>{
 assert.equal(p.choose(45,6),8145060);
 const e=p.disjointExact(simple);
 assert.equal(e.counts.threePlus,966650);assert.equal(e.counts.fourPlus,56750);
 assert.equal(e.counts.fivePlus,1175);assert.equal(e.counts.six,5);
 assert.deepEqual(e.perGame,{first:1,second:6,third:228,fourth:11115,fifth:182780});
 assert.equal(e.atLeastTwoFifth,4000/8145060);
 assert.equal(e.atLeastOneRank.fifth,(5*182780-4000)/8145060);
 assert.equal(e.expectedGames.fifth,5*182780/8145060);
 assert.equal(e.overlap.distinctNumbers,30);
});
test('overlap and invalid tickets are rejected by the exact disjoint method',()=>{
 assert.throws(()=>p.disjointExact([simple[0],simple[0],...simple.slice(2)]));
 assert.throws(()=>p.disjointExact([...simple.slice(0,4),[1,31,32,33,34,35]]),/중복/);
 assert.throws(()=>p.disjointExact([...simple.slice(0,4),[40,41,42,43,44,46]]));
});
test('v1/v2 recommendation bytes unchanged; personal recommendations reproducible and distinct',async()=>{
 const v1=await weeklyFive(1234,LEGACY_WEEKLY_VERSION);
 assert.deepEqual(v1,[[4,10,12,15,31,35],[2,6,12,23,25,26],[16,17,31,38,39,44],[9,10,16,23,27,37],[3,7,17,23,39,45]]);
 const v2=await weeklyFive(1234);
 assert.deepEqual(v2,[[13,25,31,33,36,41],[1,9,15,17,21,32],[7,20,23,26,43,44],[8,10,18,19,40,45],[6,11,24,30,38,42]]);
 const one=await p.personalFive(1249,'secret-A-32length',webcrypto);
 assert.deepEqual(one,await p.personalFive(1249,'secret-A-32length',webcrypto));
 assert.notDeepEqual(one,await p.personalFive(1249,'different-seed',webcrypto));
 assert.notDeepEqual(one,await p.personalFive(1250,'secret-A-32length',webcrypto));
 assert.notDeepEqual(one,await weeklyFive(1249));
 assert.equal(p.checkGames(one,true).distinctNumbers,30);
 assert.throws(()=>p.checkGames([...simple.slice(0,4),[1,2,3,4,5,6]],true));
 await assert.rejects(()=>p.personalFive(1249,'',webcrypto));
 assert.equal(p.makeRandomSecret(webcrypto).length,32);
});
test('birthday model normalized over all tickets; uniform model returns equal likelihood',()=>{
 const x=p.splitScenario(simple,{birthdayFactor:1,otherTickets:10000000});
 for(const s of x.shares){assert.ok(Math.abs(s.selectionProbability-1/p.TOTAL)<1e-20);assert.ok(Math.abs(s.conditionalShare-x.uniformShare)<1e-10);}
 assert.ok(Math.abs(x.ratioToUniform-1)<1e-10);
 const y=p.splitScenario(simple,{birthdayFactor:1.5,otherTickets:10000000});
 const norm=Array.from({length:7},(_,k)=>p.choose(31,k)*p.choose(14,6-k)*1.5**k).reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(Array.from({length:7},(_,k)=>p.choose(31,k)*p.choose(14,6-k)*1.5**k/norm).reduce((a,b)=>a+b,0)-1)<1e-12);
 assert.ok(y.shares.every(s=>s.conditionalShare>0&&s.conditionalShare<=1));
 assert.throws(()=>p.splitScenario(simple,{birthdayFactor:0}));
});
test('audit uses ONLY past rows in each forecast and baseline metrics are correct',()=>{
 const rows=Array.from({length:410},(_,i)=>({round:i+1,nums:[1,2,3,4,5,6]}));
 let calls=0;
 const forecast=(hist,id)=>{calls++;assert.equal(hist.at(-1).round,hist.length);return Array(45).fill(6/45);};
 const result=p.auditWalkForward(rows,forecast,{holdout:30});
 assert.equal(calls,90);assert.equal(result.n,30);assert.ok(Math.abs(result.baseline.meanHits-.8)<1e-14);
 assert.ok(Math.abs(result.baseline.brier-.11555555555555556)<1e-12);
 assert.ok(Math.abs(result.baseline.threePlus-194130/8145060)<1e-14);
 for(const row of result.results){assert.ok(Math.abs(row.brier-result.baseline.brier)<1e-12);assert.equal(row.adjustedPValue,1);assert.ok(row.calibrationECE<1e-12);}
});
test('forecast audit is unchanged if ONLY the future draw is edited; no unknown target reaches predictor',()=>{
 const rows=Array.from({length:410},(_,i)=>({round:i+1,nums:i%2===0?[1,2,3,4,5,6]:[8,9,10,11,12,13]}));
 const f=(hist,id)=>researchForecast(hist,id);
 const a=p.auditWalkForward(rows.slice(0,-1),f,{holdout:30});
 const changed=rows.map((r,i)=>i===rows.length-1?{...r,nums:[20,21,22,23,24,25]}:r);
 assert.deepEqual(a,p.auditWalkForward(changed.slice(0,-1),f,{holdout:30}));
 assert.throws(()=>p.auditWalkForward(rows.filter(x=>x.round!==90),f,{holdout:30}));
});
test('static GitHub Pages workflow publishes the new dependency and still tests original app',async()=>{
 const wf=await readFile(new URL('../.github/workflows/lotto-pages.yml',import.meta.url),'utf8');
 assert.match(wf,/node --test tests\/\*\.test\.mjs/);
 assert.match(wf,/cp scripts\/portfolio\.js public\/scripts\//);
 assert.match(wf,/cp index\.html \.nojekyll public\//);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/src="\.\/scripts\/portfolio\.js"/);
});
