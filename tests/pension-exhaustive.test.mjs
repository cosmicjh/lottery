/** Brute-force regression for exactDistribution and tests for the statistical refinements.
 * The enumeration below visits all 1,000,000 six-digit main numbers x 5 groups explicitly and shares no
 * code with the suffix-cell traversal in pension720.mjs. It only reuses prizeValues() for the amounts.
 * Official rules applied: one ticket is paid its highest GRADE only (bonus ranks above 3rd-7th whatever the
 * discounted value), and "winning" means holding a prize even when its valued amount is zero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {exactDistribution,generatePortfolio,prizeValues,assertPortfolio} from '../scripts/pension720.mjs';
import {twoSidedNormalP,randomnessSummary,categoricalMetrics,backtest} from '../scripts/pension-research.mjs';

const POW=[1,10,100,1000,10000,100000,1000000];
function bruteForce(tickets,opts={}){
 const pay=prizeValues(opts),cash=[0,pay[7],pay[6],pay[5],pay[4],pay[3]],cost=1000*tickets.length;
 const nums=tickets.map(t=>Number(t.number)),uniq=[...new Set(nums)],owners=uniq.map(n=>nums.map((x,i)=>x===n?i:-1).filter(i=>i>=0));
 const amount=new Float64Array(tickets.length);
 let mean=0,second=0,zero=0,recover=0,mass=0;
 // Probabilities are counted as exact integers in units of 1/(5,000,000 x 9,000,000); 4.5e13 < 2^53.
 const UNIT=5_000_000*9_000_000;
 const add=(value,units,won)=>{const weight=units/UNIT;mean+=value*weight;second+=value*value*weight;if(!won)zero+=units;if(value>=cost)recover+=units;mass+=units;};
 for(let m=0;m<1_000_000;m++){
  // Group matters only when the main number equals a ticket number, so other draws are weighted by five groups.
  const full=nums.includes(m);
  for(let group=full?1:5;group<=5;group++){
   let base=0,won=false;
   for(let i=0;i<nums.length;i++){
    let k=0;while(k<6&&nums[i]%POW[k+1]===m%POW[k+1])k++;
    amount[i]=k===6?(tickets[i].group===group?pay[1]:pay[2]):cash[k];base+=amount[i];if(k>0)won=true;
   }
   const weight=full?1:5;let bonusUnits=0;
   for(let u=0;u<uniq.length;u++){
    const n=uniq[u];if(n===m)continue;
    // Raw bonus is uniform; when it equals the main number the ones digit is redrawn among the nine others.
    const p=Math.floor(n/10)===Math.floor(m/10)?10:9;
    let value=base;for(const i of owners[u])value+=pay.bonus-amount[i];
    add(value,weight*p,true);bonusUnits+=p;
   }
   add(base,weight*(9_000_000-bonusUnits),won);
  }
 }
 return {massUnits:mass,unit:UNIT,expectation:mean,variance:second-mean*mean,probabilityAny:(UNIT-zero)/UNIT,probabilityRecover:recover/UNIT};
}
const close=(a,b,rel=1e-9)=>assert.ok(Math.abs(a-b)<=rel*Math.max(1,Math.abs(b)),`${a} vs ${b}`);

test('exact distribution equals full enumeration of 5,000,000 main outcomes with the bonus redraw law',()=>{
 const adversarial=[{group:1,number:'123456'},{group:2,number:'123456'},{group:1,number:'123457'},{group:5,number:'023456'},{group:4,number:'999956'},{group:4,number:'123450'},{group:3,number:'000000'}];
 const cases=[
  [[{group:3,number:'012345'}],{}],
  [adversarial,{}],
  [adversarial,{annualDiscount:0,taxRate:0}],
  [generatePortfolio({count:5,strategy:'mixed',round:341,seed:'enumeration'}),{annualDiscount:.05,taxRate:.22,delayMonths:3}],
  [generatePortfolio({count:20,strategy:'dispersed',round:341,seed:'enumeration'}),{}],
  [generatePortfolio({count:20,strategy:'concentrated',round:341,seed:'audit-75195'}),{}],
  [generatePortfolio({count:20,strategy:'recovery',round:341,seed:'enumeration'}),{}],
  // Valuation extremes: annuities worth nothing, and a bonus worth less than the 3rd prize.
  [adversarial,{taxRate:1}],
  [adversarial,{annualDiscount:1,taxRate:.22,delayMonths:60}]
 ];
 for(const [tickets,opts] of cases){
  const fast=exactDistribution(tickets,opts),slow=bruteForce(tickets,opts);
  assert.equal(slow.massUnits,slow.unit);
  close(fast.expectation,slow.expectation);close(fast.variance,slow.variance,1e-8);
  assert.ok(Math.abs(fast.probabilityAny-slow.probabilityAny)<1e-13);
  assert.ok(Math.abs(fast.probabilityRecover-slow.probabilityRecover)<1e-13);
 }
});
test('nominal expected value per ticket is 750 minus the bonus/lower-grade overlap, for every strategy',()=>{
 // 750 = payout rate of 75%; a ticket cannot collect both the bonus and a 3rd-7th grade prize.
 const overlap=(45*1e6+450*1e5+4500*5e4+45000*5e3+450000*1e3)/5e6/1e6;
 for(const strategy of ['random','dispersed','concentrated','mixed','recovery'])for(const count of [1,7,20]){
  const d=exactDistribution(generatePortfolio({count,strategy,round:9,seed:'ev'}),{annualDiscount:0,taxRate:0});
  close(d.expectation,count*(750-overlap),1e-11);
 }
});
test('two-sided normal tail matches reference values, including far tails',()=>{
 const reference=[[0,1],[1,0.31731050786291415],[1.959963984540054,0.05],[3,0.0026997960632601866],[6,1.973175290075396e-9],[10,1.5239706048320995e-23]];
 for(const [z,p] of reference){close(twoSidedNormalP(z)/p,1,1e-9);close(twoSidedNormalP(-z)/p,1,1e-9);}
 assert.throws(()=>twoSidedNormalP(NaN));
});
const draw=(round,group,number,bonus)=>({round,group,number,bonus,source:'official',date:new Date(Date.UTC(2020,4,7)+(round-1)*7*86400000).toISOString().slice(0,10)});
test('runs p-value is withheld when one class is too small and Bonferroni adjustment is reported',()=>{
 // 60 draws whose ones digit is below five in only 4 draws: the normal approximation is not used.
 const lopsided=Array.from({length:60},(_,i)=>draw(i+1,1+i%5,String(100000+i*10+(i<4?1:7)),String(500000+i)));
 const ones=randomnessSummary(lopsided)[6];
 assert.equal(ones.runsPValue,null);assert.equal(ones.adjustedRunsP,null);
 const mixed=Array.from({length:60},(_,i)=>draw(i+1,1+i%5,String(100000+i*10+(i*7)%10),String(500000+i*3)));
 for(const row of randomnessSummary(mixed)){if(row.runsPValue!==null){assert.ok(row.runsPValue>=0&&row.runsPValue<=1);close(row.adjustedRunsP,Math.min(1,13*row.runsPValue),1e-12);}}
});
test('tied forecasts share accuracy so a uniform model scores exactly 1/k',()=>{
 for(const k of [5,10])for(let actual=0;actual<k;actual++)close(categoricalMetrics(Array(k).fill(1/k),actual).accuracy,1/k,1e-12);
 assert.equal(categoricalMetrics([.5,.3,.2],0).accuracy,1);assert.equal(categoricalMetrics([.5,.3,.2],1).accuracy,0);
 assert.equal(categoricalMetrics([.4,.4,.2],1).accuracy,.5);
});
test('backtest reports a paired comparison with the uniform baseline and never flags noise as an edge',()=>{
 let state=12345;const next=n=>{state=(Math.imul(state,1103515245)+12345)>>>0;return Math.floor(state/4294967296*n);};
 const rows=Array.from({length:300},(_,i)=>{const number=String(next(1_000_000)).padStart(6,'0');let bonus=number;while(bonus===number)bonus=String(next(1_000_000)).padStart(6,'0');return draw(i+1,1+next(5),number,bonus);});
 const result=backtest(rows);
 close(result.expectedUniformAccuracy,(1/5+12/10)/13,1e-12);
 const uniform=result.models.find(m=>m.mode==='uniform');
 assert.equal(uniform.vsUniform,null);close(uniform.accuracy,result.expectedUniformAccuracy,1e-12);
 for(const m of result.models.filter(x=>x.mode!=='uniform')){
  const v=m.vsUniform;assert.equal(v.n,result.holdoutRounds);
  close(v.meanLogLossImprovement,uniform.logLoss-m.logLoss,1e-9);
  assert.ok(v.confidence95[0]<=v.meanLogLossImprovement&&v.meanLogLossImprovement<=v.confidence95[1]);
  assert.ok(v.pValue>=0&&v.pValue<=1&&v.adjustedPValue>=v.pValue-1e-15);
  assert.equal(v.exploratorySignificantEdge,false);
 }
});
test('every strategy yields a valid portfolio for 1-20 tickets across many seeds',()=>{
 for(const strategy of ['random','dispersed','concentrated','mixed','recovery'])for(let count=1;count<=20;count++)for(let s=0;s<60;s++){
  const tickets=generatePortfolio({count,strategy,round:341+s%3,seed:'fuzz-'+s});
  assert.equal(tickets.length,count);assertPortfolio(tickets);
  const last=new Set(tickets.map(t=>t.number[5])).size;
  if(strategy==='dispersed')assert.equal(last,Math.min(count,10));
  if(strategy==='recovery')assert.equal(last,1);
 }
});
test('dispersed maximises the chance of at least one prize and recovery the chance of covering the cost',()=>{
 for(const count of [3,5,10,20]){
  const rows=['random','dispersed','concentrated','mixed','recovery'].map(strategy=>[strategy,exactDistribution(generatePortfolio({count,strategy,round:341,seed:'order'}))]);
  const get=name=>rows.find(r=>r[0]===name)[1];
  // d distinct endings and u distinct numbers give d/10 + u(10-d)(1e-7 + 1/9e12); d = min(count,10), u = count is the maximum.
  const best=Math.min(count,10)/10+count*(10-Math.min(count,10))*(1e-7+1/9e12);
  close(get('dispersed').probabilityAny,best,1e-12);
  for(const [,d] of rows){assert.ok(d.probabilityAny<=best+1e-12);assert.ok(d.probabilityRecover<=get('recovery').probabilityRecover+1e-12);}
 }
});
