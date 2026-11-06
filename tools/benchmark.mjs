// Experimental offline benchmark; DOES NOT modify data/ or recommended tickets.
// node tools/benchmark.mjs [target round, default 1249]
// Requires g++ (or CXX environment variable). All exact enumeration is on main six balls.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {weeklyFive,WEEKLY_VERSION,LEGACY_WEEKLY_VERSION} from '../scripts/weekly.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const round=process.argv[2]===undefined?1249:Number(process.argv[2]);
if(!Number.isInteger(round)||round<1||round>10000)throw Error('회차는 1–10000');
let state=20261106;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function overlap(g){return 30-new Set(g.flat()).size;}
function greedy(){const pool=shuffle(Array.from({length:45},(_,i)=>i+1));return Array.from({length:5},(_,i)=>pool.slice(6*i,6*i+6).sort((a,b)=>a-b));}
function localRepair(orig){
 const g=orig.map(x=>[...x]);
 for(let steps=0;steps<50&&overlap(g);steps++){
  const occupied=new Set();let done=false;
  for(let i=0;i<5&&!done;i++)for(let j=0;j<6;j++){
   if(occupied.has(g[i][j])){
    const unused=Array.from({length:45},(_,k)=>k+1).filter(n=>!g.some(t=>t.includes(n)));
    if(!unused.length)throw Error('사용 가능한 미배정 번호 없음');g[i][j]=unused[0];done=true;break;
   }occupied.add(g[i][j]);
  }
 }
 if(overlap(g))throw Error('Local repair 미완료');return g.map(t=>t.sort((a,b)=>a-b));
}
function anneal(orig){
 const g=orig.map(t=>[...t]);let best=g.map(t=>[...t]),score=overlap(g);
 for(let step=0;step<10000&&score>0;step++){
  const i=Math.floor(rand()*5),j=Math.floor(rand()*6),v=1+Math.floor(rand()*45);
  if(g[i].includes(v))continue;
  const before=g[i][j];g[i][j]=v;
  const next=overlap(g),temperature=0.01+1.7*(1-step/10000);
  if(next<=score||rand()<Math.exp((score-next)/temperature))score=next;else g[i][j]=before;
  if(score<overlap(best))best=g.map(t=>[...t]);
 }
 if(overlap(best)!==0)throw Error('이번 SA 시행에서는 비중복 조합을 확보하지 못했습니다.');
 return best.map(t=>t.sort((a,b)=>a-b));
}
const v1=await weeklyFive(round,LEGACY_WEEKLY_VERSION),v2=await weeklyFive(round,WEEKLY_VERSION);
const partial=[[1,2,3,4,5,6],[6,7,8,9,10,11],[12,13,14,15,16,17],[18,19,20,21,22,23],[24,25,26,27,28,29]];
const candidates=[['v1',v1],['v2',v2],['one-overlap-case',partial],['greedy-disjoint',greedy()],['local-repair',localRepair(v1)],['simulated-annealing',anneal(v1)]];
const temp=mkdtempSync(join(tmpdir(),'lotto-verify-'));
try {
 const exe=join(temp,'exact');
 execFileSync(process.env.CXX||'g++',['-O3','-std=c++17',join(root,'tools/exact-enumeration.cpp'),'-o',exe],{stdio:'pipe'});
 const rows=candidates.map(([method,games])=>{
  const exact=JSON.parse(execFileSync(exe,games.flat().map(String),{encoding:'utf8'}));
  if(exact.total!==8145060)throw Error('열거 조합 수 오류');
  return {method,games,uniqueNumbers:30-overlap(games),duplicateSlots:overlap(games),
    exact,percent3Plus:100*exact.atLeast3/exact.total,percent4Plus:100*exact.atLeast4/exact.total,
    percent5Plus:100*exact.atLeast5/exact.total,percent6:100*exact.atLeast6/exact.total};
 });
 const out={round,verifiedTotal:8145060,objective:'5게임 중 적어도 1개 3번호 이상 적중 확률',
  interpretation:'지역 탐색·SA는 중복 숫자 수를 줄이는 대리목적함수 사용. 정확한 당첨확률은 최종 조합에 대해 전체 열거. 신규 성능 우위는 관찰되지 않았음.',
  methods:rows};
 const output=join(root,'research',`benchmark-${round}.json`);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(out,null,2)+'\n');
 console.log(`Saved ${output}`);for(const m of rows)console.log(m.method,'dup',m.duplicateSlots,'5+',m.percent3Plus.toFixed(8),'4+',m.percent4Plus.toFixed(8));
} finally {rmSync(temp,{recursive:true,force:true});}
