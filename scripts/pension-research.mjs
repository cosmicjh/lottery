/** Exploratory tests / strict out-of-time validation. No predictions enter purchase generators. */
import {validDraw} from './pension720.mjs';
export function validatePensionRows(rows){
 if(!Array.isArray(rows))throw new Error('당첨번호 배열이 아닙니다.');const rounds=new Set();
 for(const d of rows){validDraw(d);if(!Number.isInteger(d.round)||d.round<1||rounds.has(d.round))throw new Error('중복 또는 무효 회차');rounds.add(d.round);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||new Date(d.date+'T00:00:00Z').toISOString().slice(0,10)!==d.date||new Date(d.date+'T00:00:00Z').getUTCDay()!==4)throw new Error('목요일 추첨일 형식 오류');
 if(d.source!=='official')throw new Error('공식 출처 확인되지 않은 자료');}
 return [...rows].sort((a,b)=>a.round-b.round);
}
export const LABELS=['조','십만','만','천','백','십','일','보너스십만','보너스만','보너스천','보너스백','보너스십','보너스일'];
export function features(draw){validDraw(draw);return [draw.group-1,...draw.number.split('').map(Number),...draw.bonus.split('').map(Number)];}
function numClasses(i){return i===0?5:10;}
export function frequency(rows){const sorted=validatePensionRows(rows);return LABELS.map((label,i)=>{const buckets=Array(numClasses(i)).fill(0);for(const d of sorted)buckets[features(d)[i]]++;return {label,counts:buckets,n:sorted.length};});}
export function entropy(counts){const n=counts.reduce((a,b)=>a+b,0);if(!n)return null;return -counts.reduce((s,c)=>c?s+(c/n)*Math.log2(c/n):s,0);}
export function chiSquareStatistic(counts){const n=counts.reduce((a,b)=>a+b,0);if(!n)return null;const e=n/counts.length;return counts.reduce((s,x)=>s+(x-e)**2/e,0);}
// Marsaglia's accurate chi-square upper-tail implementation (Lanczos + continued fraction).
function logGamma(z){const p=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.505632735149312e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z-=1;let x=p[0];for(let i=1;i<p.length;i++)x+=p[i]/(z+i);const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);}
function gammaQ(s,x){if(x<=0)return 1;if(x<s+1){let term=1/s,sum=term;for(let j=1;j<500;j++){term*=x/(s+j);sum+=term;if(Math.abs(term)<Math.abs(sum)*1e-14)break;}return Math.max(0,1-sum*Math.exp(s*Math.log(x)-x-logGamma(s)));}let b=x+1-s,c=1e300,d=1/b,h=d;for(let j=1;j<500;j++){const an=-j*(j-s);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<1e-14)break;}return Math.max(0,Math.min(1,h*Math.exp(s*Math.log(x)-x-logGamma(s))));}
function normalCDF(x){const z=Math.abs(x)/Math.sqrt(2),t=1/(1+.3275911*z),erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z);return (x>=0?1+erf:1-erf)/2;}
export function randomnessSummary(rows){const sorted=validatePensionRows(rows),cols=frequency(sorted);return cols.map((f,i)=>{
 const x=f.counts,n=f.n,chi=chiSquareStatistic(x),expected=n/x.length,values=sorted.map(d=>features(d)[i]);
 const bits=values.map(v=>v>=x.length/2?1:0);const n1=bits.filter(v=>v===1).length,n0=n-n1;let runs=0;for(let j=0;j<bits.length;j++)if(j===0||bits[j]!==bits[j-1])runs++;
 const mu=1+2*n0*n1/(n||1),variance=(2*n0*n1*(2*n0*n1-n))/(n*n*(n-1)||1);
 const runsZ=variance>0?(runs-mu)/Math.sqrt(variance):null;
 const m=values.reduce((a,b)=>a+b,0)/(n||1),ss=values.reduce((a,b)=>a+(b-m)**2,0),ac=n>2&&ss?values.slice(1).reduce((a,b,j)=>a+(b-m)*(values[j]-m),0)/ss:null;
 return {...f,entropy:entropy(x),normalizedEntropy:n?entropy(x)/Math.log2(x.length):null,chiSquare:chi,chiPValue:expected>=5?gammaQ((x.length-1)/2,chi/2):null,runs,runsZ,runsPValue:n>=30&&runsZ!==null?2*(1-normalCDF(Math.abs(runsZ))):null,lag1:ac,lag1ApproxP:n>=50&&ac!==null?2*(1-normalCDF(Math.abs(ac)*Math.sqrt(n))):null,adjustedChiP:expected>=5?Math.min(1,13*gammaQ((x.length-1)/2,chi/2)):null,assumptions:'exploratory iid-null; Bonferroni 13; no predictive inference'};
 });}
export function categoricalModel(history,featureIndex,{mode='bayes',alpha=1,window=100}={}){
 if(!['uniform','frequency','recent','bayes'].includes(mode)||!Number.isFinite(alpha)||alpha<=0)throw new Error('통계 모델 설정 오류');
 const k=numClasses(featureIndex),counts=Array(k).fill(0);const eligible=mode==='recent'?history.slice(-window):history;
 for(const d of eligible)counts[features(d)[featureIndex]]++;
 if(mode==='uniform')return Array(k).fill(1/k);
 const pseudo=mode==='bayes'?alpha:0,den=eligible.length+k*pseudo;
 return den?counts.map(x=>(x+pseudo)/den):Array(k).fill(1/k);
}
export function categoricalMetrics(probs,actual){const k=probs.length;if(!Number.isInteger(actual)||actual<0||actual>=k||probs.some(p=>!Number.isFinite(p)||p<0)||Math.abs(probs.reduce((a,b)=>a+b)-1)>1e-8)throw new Error('확률 벡터 오류');return {logLoss:-Math.log(Math.max(probs[actual],1e-15)),brier:probs.reduce((s,p,i)=>s+(p-(i===actual?1:0))**2,0)/k,accuracy:probs.indexOf(Math.max(...probs))===actual?1:0};}
/** Chronological walk-forward, with a fixed final 20% holdout. Results exploratory unless predictions were timestamped prior to each sales deadline. */
export function backtest(rows,{minTrain=100,alpha=20,window=100}={}){
 const ds=validatePensionRows(rows);if(ds.length<minTrain+10)return {status:'insufficient-data',n:ds.length,minRequired:minTrain+10,models:[]};
 const begin=Math.max(minTrain,Math.floor(ds.length*.8));const modes=['uniform','frequency','recent','bayes'];const results=[];
 for(const mode of modes){let logLoss=0,brier=0,accuracy=0,count=0;for(let j=begin;j<ds.length;j++)for(let i=0;i<13;i++){
 const probs=categoricalModel(ds.slice(0,j),i,{mode,alpha,window});const m=categoricalMetrics(probs,features(ds[j])[i]);logLoss+=m.logLoss;brier+=m.brier;accuracy+=m.accuracy;count++;}
 results.push({mode,logLoss:logLoss/count,brier:brier/count,accuracy:accuracy/count,count});}
 return {status:'exploratory-backtest',minTrain,holdoutStartRound:ds[begin].round,holdoutEndRound:ds.at(-1).round,holdoutRounds:ds.length-begin,models:results,disclaimer:'학습 구간을 사후 검토한 결과입니다. 사전 등록된 미래 예측 우위가 입증된 것은 아닙니다.'};
}
