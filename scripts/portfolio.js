/* Lotto 6/45 portfolio research. This browser/Node module has NO dependency on past draw outcomes.
 * Exact fractions for identical, disjoint, five-ticket portfolios; optional hypothetical
 * number-choice model; deterministic personal mode; exploratory walk-forward audit.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LotteryPortfolio = api;
})(globalThis, function () {
  'use strict';
  const TOTAL = 8145060, BASE = 6 / 45;
  const VERSION = 'personal-five-v1-disjoint';
  function choose(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }
  function checkGames(games, disjoint = false) {
    if (!Array.isArray(games) || games.length !== 5) throw Error('5게임 목록이 필요합니다.');
    const seen = new Set(), tickets = new Set();
    for (const game of games) {
      if (!Array.isArray(game) || game.length !== 6 || new Set(game).size !== 6 || game.some(n => !Number.isInteger(n) || n < 1 || n > 45)) throw Error('한 게임은 중복 없는 1–45 번호 6개여야 합니다.');
      const key = [...game].sort((a,b)=>a-b).join(',');
      if (tickets.has(key)) throw Error('동일 게임이 중복되었습니다.');
      tickets.add(key);
      if (disjoint) for (const n of game) {
        if (seen.has(n)) throw Error('게임 간 중복이 있습니다.');
        seen.add(n);
      }
    }
    return { distinctNumbers: new Set(games.flat()).size, repeatedSlots: 30 - new Set(games.flat()).size };
  }
  function disjointExact(games) {
    const overlap = checkGames(games, true);
    // P(at least one ticket has >=3 matches): subtract the ten mutually exclusive
    // (3,3) double-winner intersections. >=4 ticket events cannot intersect.
    const singleAtLeast = k => Array.from({length:7-k}, (_,i)=>choose(6,k+i)*choose(39,6-k-i)).reduce((a,b)=>a+b,0);
    const counts = {threePlus:5*singleAtLeast(3)-choose(5,2)*choose(6,3)**2,
      fourPlus:5*singleAtLeast(4), fivePlus:5*singleAtLeast(5), six:5};
    // Bonus is drawn from the 39 remaining numbers, never from the six main balls.
    const perGame = {first:1,second:6,third:6*38,fourth:choose(6,4)*choose(39,2),fifth:choose(6,3)*choose(39,3)};
    const expectedGames = Object.fromEntries(Object.entries(perGame).map(([k,v])=>[k,5*v/TOTAL]));
    // For disjoint tickets: >=4 outcomes are mutually exclusive, as are any 5-match outcomes.
    const atLeastOneRank = {
      first:5/TOTAL, second:5*6/TOTAL, third:5*6*38/TOTAL,
      fourth:5*perGame.fourth/TOTAL,
      fifth:(5*perGame.fifth-choose(5,2)*choose(6,3)**2)/TOTAL
    };
    return {total:TOTAL, overlap, counts, atLeastOne: Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/TOTAL])),
      perGame, expectedGames, atLeastOneRank, atLeastTwoFifth:4000/TOTAL,
      meaning:'당첨확률은 번호의 크기 및 과거 출현 빈도와 무관합니다.'};
  }
  async function personalFive(round, secret, cryptoApi = globalThis.crypto) {
    if (!Number.isInteger(round) || round < 1 || round > 10000) throw Error('대상 회차 오류');
    if (typeof secret !== 'string' || !secret.trim() || secret.length > 500) throw Error('개인 시드를 입력하세요(최대 500자).');
    if (!cryptoApi?.subtle) throw Error('개인 번호 생성은 HTTPS 보안 환경이 필요합니다.');
    const pool = Array.from({length:45}, (_,i)=>i+1);
    let words = [], counter = 0;
    async function integer(n) {
      const limit = Math.floor(4294967296/n)*n;
      for (;;) {
        if (!words.length) {
          const input = JSON.stringify([VERSION,round,secret,counter++]);
          const bytes = await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(input));
          const dv = new DataView(bytes);words=Array.from({length:8},(_,i)=>dv.getUint32(i*4,false));
        }
        const v=words.shift();if(v<limit)return v%n;
      }
    }
    for(let i=0;i<30;i++){const j=i+await integer(45-i);[pool[i],pool[j]]=[pool[j],pool[i]];}
    return Array.from({length:5},(_,i)=>pool.slice(6*i,6*i+6).sort((a,b)=>a-b));
  }
  function makeRandomSecret(cryptoApi=globalThis.crypto) {
    if (!cryptoApi?.getRandomValues) throw Error('암호학적 난수 기능을 지원하지 않습니다.');
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function features(game) {
    const sorted=[...game].sort((a,b)=>a-b);let run=1,maxRun=1;
    for(let i=1;i<6;i++){run=sorted[i]===sorted[i-1]+1?run+1:1;maxRun=Math.max(maxRun,run);}
    return {birthdays:sorted.filter(n=>n<=31).length,sum:sorted.reduce((a,b)=>a+b,0),odds:sorted.filter(n=>n%2).length,maxRun};
  }
  // Hypothetical selection model with EXACT normalization over all C(45,6) tickets.
  // P(other person picks game) = weight(game)/Z; weight = (birthdayFactor)^K.
  // This is NOT fitted to Korean sales data and is not a jackpot prediction.
  function splitScenario(games,{birthdayFactor=1.5,otherTickets=10000000}={}) {
    checkGames(games);
    if(!Number.isFinite(birthdayFactor)||birthdayFactor<=0||birthdayFactor>20)throw Error('생일 가중치 범위 오류');
    if(!Number.isInteger(otherTickets)||otherTickets<0||otherTickets>1e10)throw Error('가정 구매량 범위 오류');
    const z=Array.from({length:7},(_,k)=>choose(31,k)*choose(14,6-k)*birthdayFactor**k).reduce((a,b)=>a+b,0);
    const shares=games.map(game=>{
      const f=features(game),q=birthdayFactor**f.birthdays/z;
      const x=(otherTickets+1)*q;
      const conditionalShare=x===0?1:-Math.expm1((otherTickets+1)*Math.log1p(-q))/x;
      return {...f,selectionProbability:q,relativePopularity:q*TOTAL,conditionalShare};
    });
    const meanConditionalShare=shares.reduce((a,b)=>a+b.conditionalShare,0)/5;
    const q0=1/TOTAL, y=(otherTickets+1)*q0;
    const uniformShare=y===0?1:-Math.expm1((otherTickets+1)*Math.log1p(-q0))/y;
    return {birthdayFactor,otherTickets,shares,meanConditionalShare,uniformShare,ratioToUniform:meanConditionalShare/uniformShare,
      disclaimer:'다른 구매자가 생일 범위 숫자에 주어진 가중치를 독립적으로 적용한다는 가상 시나리오이며, 한국 실제 판매 분포가 아닙니다.'};
  }
  function selectSix(probabilities,round,id){
    if(!Array.isArray(probabilities)||probabilities.length!==45||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1)||Math.abs(probabilities.reduce((a,b)=>a+b,0)-6)>1e-6)throw Error('모델 확률 벡터 오류');
    // Deterministic tie breaker based only on round / model / number; no actual outcome.
    function hash(n){let x=2166136261;for(const ch of `${id}:${round}:${n}`){x=Math.imul(x^ch.charCodeAt(0),16777619);}return x>>>0;}
    return Array.from({length:45},(_,i)=>i+1).sort((a,b)=>probabilities[b-1]-probabilities[a-1]||hash(a)-hash(b)||a-b).slice(0,6);
  }
  function normalTail(z){ // two-sided normal tail, rational approximation
    const x=Math.abs(z), t=1/(1+0.2316419*x);
    const p=0.3989422804014327*Math.exp(-x*x/2)*t*(0.319381530+t*(-0.356563782+t*(1.781478+t*(-1.821256+t*1.330274))));
    return Math.min(1,2*p);
  }
  function auditWalkForward(rows,forecastFn,{holdout=100}={}) {
    if(!Array.isArray(rows)||rows.length<400||!Number.isInteger(holdout)||holdout<30||holdout>=rows.length-100)throw Error('최소 400회·적절한 평가 구간이 필요합니다.');
    const draws=[...rows].sort((a,b)=>a.round-b.round);
    for(let i=0;i<draws.length;i++) {
      const d=draws[i];if(!Number.isInteger(d.round)||!Array.isArray(d.nums)||d.nums.length!==6||new Set(d.nums).size!==6||d.nums.some(x=>!Number.isInteger(x)||x<1||x>45)||(i&&d.round!==draws[i-1].round+1))throw Error('누락·오류 있는 학습 자료');
    }
    const methods=['long','hot','cold'], samples={long:[],hot:[],cold:[]}, calibration={long:[],hot:[],cold:[]};
    for(let i=draws.length-holdout;i<draws.length;i++) {
      const history=draws.slice(0,i),actual=new Set(draws[i].nums);
      for (const id of methods) {
        const p=forecastFn(history,id),selected=selectSix(p,draws[i].round,id);
        const hits=selected.filter(n=>actual.has(n)).length;
        for(let j=0;j<45;j++)calibration[id].push({p:p[j],y:actual.has(j+1)?1:0});
        const brier=p.reduce((s,v,j)=>s+(v-(actual.has(j+1)?1:0))**2,0)/45;
        samples[id].push({round:draws[i].round,hits,brier,improvement:BASE*(1-BASE)-brier});
      }
    }
    const results=methods.map(id=>{
      const a=samples[id],n=a.length,avg=(key)=>a.reduce((s,x)=>s+x[key],0)/n;
      const improvement=avg('improvement'),variance=a.reduce((s,x)=>s+(x.improvement-improvement)**2,0)/(n-1);
      const se=Math.sqrt(variance/n),pValue=Math.abs(improvement)<1e-12?1:(se>1e-12?normalTail(improvement/se):0);
      // Five forecast-probability bins (ties are never split); descriptive ECE only.
      const sorted=calibration[id].slice().sort((a,b)=>a.p-b.p);
      const cuts=[.2,.4,.6,.8].map(q=>sorted[Math.floor(q*sorted.length)].p);
      const bins=Array.from({length:5},()=>({n:0,p:0,y:0}));
      for(const pair of sorted){let group=0;while(group<4&&pair.p>cuts[group])group++;
        bins[group].n++;bins[group].p+=pair.p;bins[group].y+=pair.y;}
      const calibrationECE=bins.reduce((sum,b)=>sum+(b.n?Math.abs(b.p-b.y):0),0)/sorted.length;
      const calibrationBins=bins.filter(b=>b.n).map(b=>({n:b.n,meanPredicted:b.p/b.n,observedFrequency:b.y/b.n}));
      return {id,n,firstRound:a[0].round,lastRound:a.at(-1).round,meanHits:avg('hits'),brier:avg('brier'),
        threePlus:a.filter(x=>x.hits>=3).length,fourPlus:a.filter(x=>x.hits>=4).length,
        improvement,calibrationECE,calibrationBins,confidence95:[improvement-1.96*se,improvement+1.96*se],pValue,
        adjustedPValue:Math.min(1,pValue*3),exploratorySignificant:improvement>0&&pValue*3<0.05};
    });
    return {baseline:{meanHits:0.8,brier:BASE*(1-BASE),threePlus:(20*choose(39,3)+15*choose(39,2)+6*39+1)/TOTAL,
      fourPlus:(15*choose(39,2)+6*39+1)/TOTAL},results,n:holdout,
      limitations:'동점은 고정 해시로 정리한 실제 6개 번호 기준. ECE는 5개 확률 구간의 기술통계이며 추정 오차가 큽니다. 정규근사 95% 구간·Bonferroni(3모형) p값은 탐색적 지표이며, 사전 등록된 독립 검증 결과가 아닙니다.'};
  }
  return {TOTAL,VERSION,choose,checkGames,disjointExact,personalFive,makeRandomSecret,features,splitScenario,selectSix,auditWalkForward};
});
