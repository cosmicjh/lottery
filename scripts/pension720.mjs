/** 연금복권720+ v1: exact suffix probabilities and joint payout law, no external dependencies. */
export const PENSION_VERSION='pension720-suffix-v1';
export const TOTAL_MAIN=5_000_000, TOTAL_DIGITS=1_000_000;
export const CASH_PRIZES={3:1_000_000,4:100_000,5:50_000,6:5_000,7:1_000};
export const PENSION_OFFICIAL='https://www.dhlottery.co.kr/pt720/intro';
export function assertTicket(t){
 if(!t||!Number.isInteger(t.group)||t.group<1||t.group>5||typeof t.number!=='string'||!/^[0-9]{6}$/.test(t.number))throw new Error('조는 1–5, 번호는 0을 포함한 6자리 문자열이어야 합니다.');
 return t;
}
export function assertPortfolio(tickets){
 if(!Array.isArray(tickets)||tickets.length<1||tickets.length>20)throw new Error('구매 장수는 1–20장입니다.');
 const seen=new Set();for(const t of tickets){assertTicket(t);const key=t.group+':'+t.number;if(seen.has(key))throw new Error('동일 조·번호의 중복 구매는 이 모형에서 제외합니다.');seen.add(key);}return tickets;
}
export function validDraw(d){
 if(!d||!Number.isInteger(d.group)||d.group<1||d.group>5||typeof d.number!=='string'||!/^[0-9]{6}$/.test(d.number)||typeof d.bonus!=='string'||!/^[0-9]{6}$/.test(d.bonus)||d.number===d.bonus)throw new Error('추첨 데이터 구조 오류 (본 번호와 보너스가 같을 수 없음)');return d;
}
export function suffixLength(a,b){let k=0;while(k<6&&a[5-k]===b[5-k])k++;return k;}
export function mainGrade(t,draw){assertTicket(t);const k=suffixLength(t.number,draw.number);return k===6?(t.group===draw.group?1:2):k>=1?8-k:null;}
export function ticketGrade(t,d){validDraw(d);const main=mainGrade(t,d),bonus=t.number===d.bonus?'bonus':null;
 // Bonus is an annuity and dominates grades 3–7 at realistic scenario rates.
 return main===1||main===2?main:bonus||main;
}
export function assessTicket(t,d){return {ticket:t,grade:ticketGrade(t,d),mainGrade:mainGrade(t,d),bonusHit:t.number===d.bonus};}
/** EXACT unconditional probabilities for one ticket under uniform main six digits and group. */
export const ONE_TICKET_PROBABILITIES={1:1/5_000_000,2:4/5_000_000,3:45/5_000_000,4:450/5_000_000,5:4500/5_000_000,6:45000/5_000_000,7:450000/5_000_000,bonus:1/1_000_000};
export function coverage(tickets){
 assertPortfolio(tickets);const unique=(k)=>new Set(tickets.map(t=>t.number.slice(-k))).size;
 const atLeast={7:unique(1)/10,6:unique(2)/100,5:unique(3)/1000,4:unique(4)/10000,3:unique(5)/100000,2:unique(6)/1000000,1:tickets.length/TOTAL_MAIN};
 const nums=new Set(tickets.map(t=>t.number));const both=[...nums].reduce((sum,n)=>{const k=new Set(tickets.filter(t=>t.number===n).map(t=>t.group)).size;return sum+(k>=2?k/TOTAL_MAIN:0);},0);
 return {atLeast,distinctSuffixes:Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,unique(i+1)])),firstAndSecond:both,bonusAtLeast:nums.size/1_000_000};
}
export function annuityPV(monthly,months,annualDiscount=0,taxRate=.22,delayMonths=0){
 if(![monthly,months,annualDiscount,taxRate,delayMonths].every(Number.isFinite)||monthly<0||!Number.isInteger(months)||months<1||annualDiscount<0||annualDiscount>1||taxRate<0||taxRate>1||delayMonths<0)throw new Error('연금 현재가치 입력값을 확인하세요.');
 const r=Math.pow(1+annualDiscount,1/12)-1;
 const factor=r===0?months:(1-Math.pow(1+r,-months))/r;
 return monthly*(1-taxRate)*factor/Math.pow(1+r,delayMonths);
}
export function prizeValues({annualDiscount=.03,taxRate=.22,delayMonths=0}={}){
 const first=annuityPV(7_000_000,240,annualDiscount,taxRate,delayMonths);
 const second=annuityPV(1_000_000,120,annualDiscount,taxRate,delayMonths);
 return {1:first,2:second,3:1_000_000,4:100_000,5:50_000,6:5_000,7:1_000,bonus:second};
}
/** Seeded deterministic pseudo-random generator. Non-cryptographic, not lottery prediction. */
export function seededRandom(seed){let h=2166136261;for(let i=0;i<String(seed).length;i++){h^=String(seed).charCodeAt(i);h=Math.imul(h,16777619);}let x=h>>>0;
 return ()=>{x+=0x6d2b79f5;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};
}
function randint(rng,limit){return Math.floor(rng()*limit);}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const k=randint(rng,i+1);[a[k],a[i]]=[a[i],a[k]];}return a;}
function randomTicket(rng){return {group:randint(rng,5)+1,number:String(randint(rng,1_000_000)).padStart(6,'0')};}
function uniqueTicket(existing, rng, suffix=null){const seen=new Set(existing.map(t=>t.group+':'+t.number));for(let i=0;i<1000;i++){
 const n=String(randint(rng,10**(6-(suffix?.length||0)))).padStart(6-(suffix?.length||0),'0')+(suffix??'');const t={group:randint(rng,5)+1,number:n};if(!seen.has(t.group+':'+t.number))return t;
 }throw new Error('중복 없는 번호 생성 실패');}
export function generatePortfolio({count=5,strategy='dispersed',round=1,seed='default'}={}){
 if(!Number.isInteger(count)||count<1||count>20||!Number.isInteger(round)||round<1||!['random','dispersed','concentrated','mixed'].includes(strategy))throw new Error('생성 조건 오류');
 const rng=seededRandom(`${PENSION_VERSION}|${round}|${seed}|${strategy}|${count}`),out=[];
 if(strategy==='random'){for(let i=0;i<count;i++)out.push(uniqueTicket(out,rng));}
 if(strategy==='dispersed'){
  // 1–10 games: distinct final digits is PROVEN optimal for at least one grade >=7.
  // 11–20 games: all 10 final digits covered, all last-two digits distinct.
  const endings=shuffle(Array.from({length:10},(_,i)=>i),rng);
  const combinations=[];for(let i=0;i<count;i++){const last=endings[i%10],tens=(Math.floor(i/10)+randint(rng,10))%10;let suf=String(tens)+String(last);while(combinations.includes(suf)){suf=String((Number(suf[0])+1)%10)+String(last);}combinations.push(suf);out.push(uniqueTicket(out,rng,suf));}
 }
 if(strategy==='concentrated'||strategy==='mixed'){
  const num=String(randint(rng,1_000_000)).padStart(6,'0'),groups=shuffle([1,2,3,4,5],rng),focus=strategy==='concentrated'?count:Math.min(5,Math.max(1,Math.floor(count/2)));
  for(let i=0;i<Math.min(5,focus);i++)out.push({group:groups[i],number:num});
  if(strategy==='concentrated')for(let i=5;i<count;i++){const x=String(randint(rng,1_000_000)).padStart(6,'0');const gs=shuffle([1,2,3,4,5],rng);for(let g=0;g<Math.min(5,count-i);g++)out.push({group:gs[g],number:x});i+=Math.min(5,count-i)-1;}
  else {const endingOptions=shuffle('0123456789'.split('').filter(x=>x!==num[5]),rng);while(out.length<count){const suffix=endingOptions[(out.length-focus)%endingOptions.length];out.push(uniqueTicket(out,rng,suffix));}}
 }
 return assertPortfolio(out);
}
/** Each output has a weighted exact main-number state, including every value needed by bonus-reroll law.
 * All other 6-digit main outcomes are collapsed into suffix-equivalent cells.
 */
function* mainCells(tickets){
 const specials=new Set();for(const t of tickets){for(let d=0;d<10;d++)specials.add(t.number.slice(0,5)+d);}
 const roots=[...tickets.map(t=>t.number),...specials];
 const walk=function*(depth,reversePrefix,candidates,states){
  if(depth===6){yield {number:reversePrefix.split('').reverse().join(''),count:1,states};return;}
  const present=new Set();for(const n of candidates)present.add(n[5-depth]);
  for(let d=0;d<10;d++){
   const child=candidates.filter(n=>n[5-depth]===String(d));
   const ranks=states.map((k,i)=>tickets[i].number[5-depth]===String(d)&&k===depth?depth+1:k);
   if(!child.length){yield {number:null,count:10**(5-depth),states:ranks};}
   else yield* walk(depth+1,reversePrefix+d,child,ranks);
  }
 };
 yield* walk(0,'',roots,new Array(tickets.length).fill(0));
}
function gradesForState(tickets,state,group){return state.map((n,i)=>n===6?(tickets[i].group===group?1:2):n>0?8-n:null);}
/** Joint payout distribution is exact under uniform (group, six digit), plus independent bonus
 * with conditioning: B = M rerolls its ones digit until it differs. This conditions on
 * *six-digit equality*, not equality of any suffix.
 */
export function exactDistribution(tickets,opts={}){
 assertPortfolio(tickets);const payouts=prizeValues(opts),numMap=new Map();for(const t of tickets){if(!numMap.has(t.number))numMap.set(t.number,[]);numMap.get(t.number).push(t);}
 const keys=[...numMap.keys()],law=new Map(),cost=tickets.length*1000;let totalCellWeight=0;
 const add=(v,p)=>law.set(v,(law.get(v)||0)+p);
 for(const cell of mainCells(tickets)){
  const mainProb=cell.count/TOTAL_MAIN;totalCellWeight+=5*mainProb;
  for(let group=1;group<=5;group++){
   const grades=gradesForState(tickets,cell.states,group);
   const base=grades.reduce((s,k)=>s+(k?payouts[k]:0),0);
   let totalBonusProbability=0;
   for(const num of keys){let prob=1/TOTAL_DIGITS;
    if(cell.number===num)prob=0;
    else if(cell.number!==null&&cell.number.slice(0,5)===num.slice(0,5))prob+=1/(9*TOTAL_DIGITS);
    const affected=numMap.get(num);let extra=0;
    for(const ticket of affected){const index=tickets.indexOf(ticket);extra+=Math.max(payouts.bonus,grades[index]?payouts[grades[index]]:0)-(grades[index]?payouts[grades[index]]:0);}
    totalBonusProbability+=prob;
    add(base+extra,mainProb*prob);
   }
   add(base,mainProb*(1-totalBonusProbability));
  }
 }
 if(Math.abs(totalCellWeight-1)>1e-10)throw new Error('추첨 경우의 수 집계 오류: '+totalCellWeight);
 const entries=[...law].filter(([,p])=>p>0).sort((a,b)=>a[0]-b[0]);const totalP=entries.reduce((s,[,p])=>s+p,0);
 if(Math.abs(totalP-1)>1e-9)throw new Error('전체 당첨 확률 정규화 오류: '+totalP);
 const expectation=entries.reduce((s,[v,p])=>s+v*p,0);
 const variance=entries.reduce((s,[v,p])=>s+(v-expectation)**2*p,0);
 let accumulated=0,median=0;for(const [v,p] of entries){accumulated+=p;if(accumulated>=.5){median=v;break;}}
 const probabilityAtLeast=(amount)=>entries.reduce((s,[v,p])=>s+(v>=amount?p:0),0);
 return {expectation,variance,standardDeviation:Math.sqrt(variance),median,cost,netExpected:expectation-cost,probabilityAny:1-(law.get(0)||0),probabilityRecover:probabilityAtLeast(cost),probabilityAtLeast,distribution:entries,coverage:coverage(tickets),assumptions:{...opts,bonusReroll:'same-six-digits-reroll-last-digit',model:'exact',tax:'pension-annuity-withholding-only'}};
}
export function compareStrategies(count=5,round=1,seed='compare',opts={}){
 return ['random','dispersed','concentrated','mixed'].map(strategy=>{const tickets=generatePortfolio({count,round,seed,strategy});return {strategy,tickets,metrics:exactDistribution(tickets,opts)};});
}
