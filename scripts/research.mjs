import {validateRows} from "./model.mjs";
// Pre-specified hypotheses. No choice uses the result being predicted.
function researchForecast(history,method){
 const base=6/45,counts=Array(45).fill(0);
 const sample=method==='long'?history:history.slice(-100);
 for(const d of sample)for(const n of d.nums)counts[n-1]++;
 const probs=counts.map(n=>(n+100*base)/(sample.length+100));
 if(method==='cold'){
  // Convex reflection toward rarely seen numbers, still summing to six.
  const deviations=probs.map(p=>p-base);
  const max=Math.max(...deviations),scale=max>0?Math.min(1,base/max):1;
  return deviations.map(d=>base-scale*d);
 }
 return probs;
}
function walkForwardResearch(input){
 const draws=validateRows(input).sort((a,b)=>a.round-b.round);
 if(draws.length<400)throw Error('연속된 최소 400회가 필요합니다.');
 if(draws.some((d,i)=>i&&d.round!==draws[i-1].round+1))throw Error('회차가 누락되어 있습니다. 먼저 전체 이력을 보충하세요.');
 const holdout=100,split=draws.length-holdout,base=6/45;
 const methods=[['long','누적 빈도 + 균등 확률 보정'],['hot','최근 100회 고빈도 + 보정'],['cold','최근 100회 저빈도 가설']];
 const results=methods.map(([id,label])=>{
  const sections=[{name:'개발 구간',n:0,hits:0,brier:0},{name:'최근 100회 평가',n:0,hits:0,brier:0}];
  for(let i=100;i<draws.length;i++){
   const p=researchForecast(draws.slice(0,i),id),actual=new Set(draws[i].nums);
   // Ties are averaged analytically to avoid fixed-number or random-seed bias.
   const threshold=[...p].sort((a,b)=>b-a)[5],above=p.map((v,j)=>v>threshold?j+1:0).filter(Boolean),ties=p.map((v,j)=>v===threshold?j+1:0).filter(Boolean);
   const hits=above.filter(n=>actual.has(n)).length+(6-above.length)*ties.filter(n=>actual.has(n)).length/ties.length;
   const brier=p.reduce((s,v,j)=>s+(v-(actual.has(j+1)?1:0))**2,0)/45;
   const s=sections[i<split?0:1];s.n++;s.hits+=hits;s.brier+=brier;
  }
  return {id,label,sections:sections.map(s=>({...s,hits:s.hits/s.n,brier:s.brier/s.n}))};
 });
 return {start:draws[0].round,end:draws.at(-1).round,splitRound:draws[split].round,baselineHits:36/45,baselineBrier:base*(1-base),results};
}
export {researchForecast,walkForwardResearch};
