function logGamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (x < s + 1) {
    let term = 1 / s, sum = term;
    for (let n = 1; n < 500; n++) {
      term *= x / (s + n); sum += term;
      if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
    }
    return Math.max(0,1 - sum * Math.exp(-x + s * Math.log(x) - logGamma(s)));
  }
  const FPMIN = 1e-300, EPS = 1e-15;
  let b = x + 1 - s, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.max(0,Math.min(1,Math.exp(-x + s * Math.log(x) - logGamma(s)) * h));
}
const chi2CDF = (x, df) => 1 - gammaQ(df / 2, x / 2);
function chiSquareTest(obs, exp, factor=1) {
  let stat = 0;
  for (let i = 0; i < obs.length; i++) if (exp[i] > 0) stat += Math.pow(obs[i] - exp[i], 2) / exp[i];
  stat *= factor;
  return { statistic: stat, df: obs.length - 1, pValue: gammaQ((obs.length-1)/2,stat/2) };
}
function chi2InvCDF(p, df) {
  let lo = 0, hi = Math.max(df * 10, 100);
  while (chi2CDF(hi, df) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2CDF(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-8) break;
  }
  return (lo + hi) / 2;
}
function analyzeLotto(draws) {
  const N = draws.length, counts = new Array(46).fill(0);
  for (const d of draws) for (const n of d.nums) counts[n]++;
  const observed = counts.slice(1, 46);
  const expected = new Array(45).fill(N * 6 / 45);
  return { mode: 'lotto', N, observed, expected,
    labels: Array.from({length: 45}, (_, i) => String(i + 1)),
    test: chiSquareTest(observed, expected,44/39) };
}
function randomInt(n) {
  if(!Number.isInteger(n)||n<1) throw new Error('무작위 범위 오류');
  const a=new Uint32Array(1), limit=Math.floor(4294967296/n)*n;
  do {crypto.getRandomValues(a);} while(a[0]>=limit);
  return a[0]%n;
}
function shuffle(a) {for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function lottoPopScore(combo) {
  const u31=combo.filter(n=>n<=31).length;
  let maxRun=1,run=1;
  for(let i=1;i<6;i++){run=combo[i]===combo[i-1]+1?run+1:1;maxRun=Math.max(maxRun,run);}
  return {score:u31>=5?1:0,reasons:u31>=5?['생일범위 번호 5개 이상']:[],u31,
    sum:combo.reduce((a,b)=>a+b,0),odds:combo.filter(n=>n%2).length,low:combo.filter(n=>n<=22).length,maxRun,m5:combo.filter(n=>n%5===0).length};
}
function parseNumList(text,max=45) {
  if(!text.trim())return [];
  const parts=text.trim().split(/[,\s]+/),min=max===9?0:1;
  if(parts.some(p=>!/^\d+$/.test(p)||Number(p)<min||Number(p)>max))throw new Error(`숫자는 ${min}~${max} 범위로 입력하세요.`);
  const nums=parts.map(Number);if(new Set(nums).size!==nums.length)throw new Error('입력 번호가 중복됩니다.');
  return nums;
}
function generateLotto(opts) {
  const {N,include=[],exclude=[],minSum=21,maxSum=255,avoidHistory=false,historyDraws=[],candidateCount=20000,strategy='random',maxOverlap=5}=opts;
  if(!Number.isInteger(N)||N<1||N>10)throw new Error('생성 개수는 1~10입니다.');
  if(!['birthday','random'].includes(strategy)||![0,2,5].includes(maxOverlap))throw new Error('선택 방식 확인');
  if(!Number.isInteger(candidateCount)||candidateCount<1||candidateCount>100000)throw new Error('후보 수 확인');
  if(!Number.isFinite(minSum)||!Number.isFinite(maxSum)||minSum>maxSum)throw new Error('합계 범위를 확인하세요.');
  for(const a of [include,exclude])if(new Set(a).size!==a.length||a.some(n=>!Number.isInteger(n)||n<1||n>45))throw new Error('포함·제외 번호 확인');
  if(include.length>5)throw new Error('포함 번호는 최대 5개입니다.');
  if(include.some(n=>exclude.includes(n)))throw new Error('포함·제외 번호가 겹칩니다.');
  if(N>1&&include.length>maxOverlap)throw new Error('포함 번호 수가 조합 간 공통 번호 제한을 초과합니다.');
  const pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!exclude.includes(n)&&!include.includes(n));
  const slots=6-include.length;
  if(pool.length<slots)throw new Error('선택 가능한 번호가 부족합니다.');
  if(maxOverlap===0&&6*N>45-exclude.length)throw new Error('공통 번호 0개 조건에 필요한 번호가 부족합니다.');
  const includeSum=include.reduce((a,b)=>a+b,0);
  if(includeSum+pool.slice(0,slots).reduce((a,b)=>a+b,0)>maxSum||includeSum+pool.slice(-slots).reduce((a,b)=>a+b,0)<minSum)throw new Error('포함·제외 조건과 합계 범위를 동시에 만족할 수 없습니다.');
  const hist=new Set(avoidHistory?historyDraws.map(d=>[...d.nums].sort((a,b)=>a-b).join(',')):[]);
  const candidates=[],seen=new Set();
  for(let k=0;k<candidateCount;k++) {
    const avail=[...pool];
    for(let i=0;i<slots;i++){const j=i+randomInt(avail.length-i);[avail[i],avail[j]]=[avail[j],avail[i]];}
    const nums=[...include,...avail.slice(0,slots)].sort((a,b)=>a-b),key=nums.join(','),stats=lottoPopScore(nums);
    if(seen.has(key)||hist.has(key)||stats.sum<minSum||stats.sum>maxSum)continue;
    seen.add(key);candidates.push({nums,...stats});
  }
  if(candidates.length<N)throw new Error(`후보 ${candidates.length}개 확보: 요청한 ${N}개보다 적습니다. 후보 수를 늘리거나 조건을 완화하세요. 수학적 불가능 판정은 아닙니다.`);
  // Tied candidates are randomized. Multiple restarts resolve bounded greedy dead ends.
  let best=[];
  for(let attempt=0;attempt<20;attempt++) {
    const ordered=shuffle([...candidates]);
    if(strategy==='birthday')ordered.sort((a,b)=>a.score-b.score);
    const selected=[];
    for(const c of ordered){if(selected.every(r=>c.nums.filter(n=>r.nums.includes(n)).length<=maxOverlap)){selected.push(c);if(selected.length===N)break;}}
    if(selected.length>best.length)best=selected;
    if(best.length===N)break;
  }
  if(best.length<N)throw new Error(`검색한 후보에서 ${best.length}/${N}개만 조합할 수 있었습니다. 후보 수를 늘리거나 공통 번호 제한을 완화하세요. 제한을 자동 해제하지 않았습니다.`);
  return {type:'lotto',strategy,combinations:best,totalCandidates:candidates.length,minScore:candidates.some(c=>c.score===0)?0:1,maxScore:candidates.some(c=>c.score===1)?1:0};
}

export {generateLotto, parseNumList, analyzeLotto, gammaQ};
