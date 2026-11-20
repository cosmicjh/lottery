/** How other buyers choose Lotto 6/45 numbers, estimated from official winner counts.
 *
 * Every combination has the same chance to be drawn, but ranks 1-3 are shared among their winners. When a
 * drawn combination contains numbers many people pick, more tickets match it. For each past draw the
 * number of 4th- and 5th-rank winning games is compared with the count expected if every ticket were a
 * uniform random choice (games x rank probability). A quasi-Poisson regression on indicators of the six
 * drawn numbers gives each number a popularity effect.
 *
 * Validation: effects are estimated on the earlier part of the window only and must explain the 1st-,
 * 2nd- and 3rd-rank winner counts of the later rounds. A profile is marked usable only when they do.
 * This describes buyers, not the draw: it never changes any probability of winning.
 */
import {validateRows} from './model.mjs';

export const POPULARITY_VERSION='popularity-v1';
const TOTAL=8145060;
// Winning games per ticket for ranks 1-5 (2nd/3rd split by the bonus drawn from the remaining 39 numbers).
const RANK_COMBOS=[1,6,228,13545,182780];

function prepare(draws){
 const rows=validateRows(draws).sort((a,b)=>a.round-b.round),byRound=new Map(rows.map(d=>[d.round,d]));
 return rows.filter(d=>d.stats&&byRound.has(d.round-1)&&d.stats.winners[3]>0&&d.stats.winners[4]>0).map(d=>{
  const previous=new Set(byRound.get(d.round-1).nums);
  return {round:d.round,nums:d.nums,games:d.stats.sales/1000,winners:d.stats.winners,repeat:d.nums.filter(n=>previous.has(n)).length};
 });
}

function solve(A,b){ // Cholesky for the symmetric positive definite normal equations
 const n=b.length,L=A.map(r=>r.slice());
 for(let j=0;j<n;j++){
  let s=L[j][j];for(let k=0;k<j;k++)s-=L[j][k]*L[j][k];
  if(!(s>0))throw Error('인기도 추정 행렬이 특이합니다.');
  L[j][j]=Math.sqrt(s);
  for(let i=j+1;i<n;i++){let t=L[i][j];for(let k=0;k<j;k++)t-=L[i][k]*L[j][k];L[i][j]=t/L[j][j];}
 }
 const y=new Array(n),x=new Array(n);
 for(let i=0;i<n;i++){let t=b[i];for(let k=0;k<i;k++)t-=L[i][k]*y[k];y[i]=t/L[i][i];}
 for(let i=n-1;i>=0;i--){let t=y[i];for(let k=i+1;k<n;k++)t-=L[k][i]*x[k];x[i]=t/L[i][i];}
 return x;
}
function inverseDiagonal(A){return A.map((_,i)=>solve(A,A.map((__,j)=>i===j?1:0))[i]);}

/** Quasi-Poisson GLM with log link by iteratively reweighted least squares.
 * `columns(row)` lists [index,value] pairs; column 0 is the intercept. */
export function poissonFit(rows,{size,columns,count,offset,ridge=1e-6}){
 let beta=new Array(size).fill(0);
 beta[0]=Math.log(rows.reduce((s,r)=>s+count(r),0)/rows.reduce((s,r)=>s+Math.exp(offset(r)),0));
 const normal=weightOf=>{
  const A=Array.from({length:size},()=>new Array(size).fill(0)),b=new Array(size).fill(0);
  for(const r of rows){
   const x=columns(r),eta=x.reduce((s,[j,v])=>s+beta[j]*v,0)+offset(r),mu=Math.exp(eta),{w,z}=weightOf(r,mu,eta);
   for(const [i,vi] of x){b[i]+=w*vi*z;for(const [j,vj] of x)A[i][j]+=w*vi*vj;}
  }
  for(let i=1;i<size;i++)A[i][i]+=ridge;
  return {A,b};
 };
 let converged=false;
 for(let iteration=0;iteration<100&&!converged;iteration++){
  const {A,b}=normal((r,mu,eta)=>({w:mu,z:eta-offset(r)+(count(r)-mu)/mu}));
  const next=solve(A,b);converged=next.every((v,i)=>Math.abs(v-beta[i])<1e-10);beta=next;
 }
 if(!converged||beta.some(v=>!Number.isFinite(v)))throw Error('인기도 추정이 수렴하지 않았습니다.');
 let pearson=0;
 const {A}=normal((r,mu)=>{pearson+=(count(r)-mu)**2/mu;return {w:mu,z:0};});
 const dispersion=pearson/Math.max(1,rows.length-size);
 return {beta,dispersion,se:inverseDiagonal(A).map(v=>Math.sqrt(Math.max(0,v)*dispersion))};
}

/** Number effects from the 4th and 5th ranks (index 3 and 4), averaged; mean zero over 1-45. */
function numberEffects(rows){
 const effects=[3,4].map(rank=>{
  // Columns: 0 intercept, 1-44 numbers 1-44 (45 is the reference), 45 numbers repeated from the previous draw.
  const fit=poissonFit(rows,{size:46,columns:r=>[[0,1],...r.nums.filter(n=>n<45).map(n=>[n,1]),[45,r.repeat]],
   count:r=>r.winners[rank],offset:r=>Math.log(r.games*RANK_COMBOS[rank]/TOTAL)});
  const g=Array.from({length:45},(_,i)=>i<44?fit.beta[i+1]:0),mean=g.reduce((a,b)=>a+b,0)/45;
  return g.map(v=>v-mean);
 });
 return effects[0].map((v,i)=>(v+effects[1][i])/2);
}
const score=(gamma,nums)=>nums.reduce((s,n)=>s+gamma[n-1],0);

export function estimatePopularity(draws,{window=650,holdout=250,source='official'}={}){
 if(!Number.isInteger(window)||!Number.isInteger(holdout)||holdout<100||window-holdout<300)throw Error('인기도 추정 구간 설정 오류');
 const all=prepare(draws);
 if(all.length<window)throw Error(`당첨 통계가 있는 회차가 부족합니다: ${all.length}/${window}회`);
 const rows=all.slice(-window),train=rows.slice(0,window-holdout),test=rows.slice(window-holdout);
 const trainGamma=numberEffects(train);
 const tiers=[0,1,2].map(rank=>{
  const fit=poissonFit(test,{size:2,ridge:0,columns:r=>[[0,1],[1,score(trainGamma,r.nums)]],count:r=>r.winners[rank],offset:r=>Math.log(r.games*RANK_COMBOS[rank]/TOTAL)});
  return {rank:rank+1,slope:fit.beta[1],se:fit.se[1],z:fit.beta[1]/fit.se[1],dispersion:fit.dispersion};
 });
 const gamma=numberEffects(rows).map(v=>Math.round(v*1e6)/1e6);
 const order=Array.from({length:45},(_,i)=>i+1).sort((a,b)=>gamma[a-1]-gamma[b-1]||a-b);
 const first=rows[0].round,last=rows.at(-1).round;
 return {schema:1,version:POPULARITY_VERSION,id:`${POPULARITY_VERSION}:${source}:${first}-${last}`,source,
  rounds:{first,last,count:rows.length},
  method:'quasi-Poisson regression of 4th/5th-rank winning games on the six drawn numbers (offset: games x rank probability), averaged over both ranks',
  gamma,numbers:order.slice(0,30).sort((a,b)=>a-b),excluded:order.slice(30).sort((a,b)=>a-b),
  validation:{trainRounds:[train[0].round,train.at(-1).round],testRounds:[test[0].round,test.at(-1).round],tiers},
  // Usable only when the out-of-sample check holds: 3rd rank (most data) clearly, 1st rank in the same direction.
  usable:tiers[2].z>=2&&tiers[0].slope>0};
}
