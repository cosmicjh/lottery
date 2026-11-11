import {PENSION_VERSION,generatePortfolio,compareStrategies,exactDistribution,coverage,assertPortfolio,ticketGrade,ONE_TICKET_PROBABILITIES} from './pension720.mjs';
import {validatePensionRows,randomnessSummary,backtest} from './pension-research.mjs';
const $=id=>document.getElementById(id),ko=v=>Math.round(v).toLocaleString('ko-KR'),pct=v=>(v*100).toFixed(v<.001?6:4)+'%',num=(el)=>Number($(el).value);
const SKEY='pension720-local-records-v1';
let tickets=[],official=[],shared=[],local=[],ready=false;
const names={random:'균등 의사난수',dispersed:'접미부 분산',concentrated:'동일번호 5개 조 집중',mixed:'혼합',recovery:'끝자리 집중 (구매비 회수 우선)'};
function element(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(className)e.className=className;return e;}
function table(headers,rows){const t=document.createElement('table'),h=element('thead'),r=element('tr');for(const label of headers)r.append(element('th',label));h.append(r);t.append(h);const body=element('tbody');for(const row of rows){const tr=element('tr');for(const v of row)tr.append(element('td',v));body.append(tr);}t.append(body);return t;}
function status(id,msg,err=false){const e=$(id);e.textContent=msg;e.classList.toggle('error',err);}
function options(){return {annualDiscount:num('p-discount')/100,taxRate:num('p-tax')/100,delayMonths:num('p-delay')};}
function selectedRound(){const r=num('p-round');if(!Number.isInteger(r)||r<1)throw Error('대상 회차를 입력하세요. 자동 추정하지 않습니다.');return r;}
function showTickets(){const el=$('p-tickets');el.replaceChildren();tickets.forEach((t,i)=>{const r=element('div',null,'p-ticket');r.append(element('span',String(i+1).padStart(2,'0')));const group=element('select');group.setAttribute('aria-label','조 '+(i+1));for(let g=1;g<=5;g++){const opt=element('option',g+'조');opt.value=g;group.append(opt);}group.value=t.group;
 const number=element('input');number.value=t.number;number.maxLength=6;number.setAttribute('aria-label','여섯 자리 번호 '+(i+1));number.inputMode='numeric';const save=element('button','번호 수정');save.type='button';save.onclick=()=>{
  try{const modified=tickets.map(x=>({...x}));modified[i]={group:Number(group.value),number:number.value};assertPortfolio(modified);tickets=modified;showTickets();renderMetrics();persist();status('p-status','번호 수정 및 전체 커버리지 재검증 완료. 수정한 기록은 기존 기록과 별도로 취급합니다.');}
  catch(e){status('p-status',e.message,true);}
 };r.append(group,number,save);el.append(r);});}
function renderMetrics(){const el=$('p-metrics');el.replaceChildren();if(!tickets.length)return;const d=exactDistribution(tickets,options());
 const cards=[['본 추첨 7등 이상 ≥1장',pct(d.coverage.atLeast[7])],['본 추첨 6등 이상 ≥1장',pct(d.coverage.atLeast[6])],['본 추첨 3등 이상 ≥1장',pct(d.coverage.atLeast[3])],['본 추첨 1·2등 ≥1장',pct(d.coverage.atLeast[2])],['1등·2등 동시 발생',pct(d.coverage.firstAndSecond)],['보너스 ≥1장',pct(d.coverage.bonusAtLeast)],['본·보너스 포함 ≥1장',pct(d.probabilityAny)],['비용 회수 이상',pct(d.probabilityRecover)],['총 기대당첨금(현재가치)',ko(d.expectation)+'원'],['순기대값(구매비 제외)',ko(d.netExpected)+'원'],['표준편차',ko(d.standardDeviation)+'원'],['중앙값',ko(d.median)+'원']];
 const grid=element('div',null,'p-metric-grid');for(const [label,value] of cards){const c=element('div',null,'p-metric');c.append(element('small',label),element('strong',value));grid.append(c);}el.append(grid);
 const row=element('p','구매비 '+ko(d.cost)+'원 · 할인율 '+(options().annualDiscount*100)+'% · 연금 원천징수 '+(options().taxRate*100)+'%. 수치 중 당첨금은 세후 현재가치 가정이며, 실제 구매 가능성은 별도 확인 필요.','muted');el.append(row);
}
function persist(){if(!tickets.length)return;const round=selectedRound(),strategy=$('p-strategy').value;let stored=[];try{stored=JSON.parse(localStorage.getItem(SKEY)||'[]');if(!Array.isArray(stored))throw Error('기록 형식 오류');}catch(e){throw Error('브라우저 기존 기록 오류. 덮어쓰지 않았습니다: '+e.message);}
 const identity=JSON.stringify({round,strategy,tickets});if(stored.some(r=>JSON.stringify({round:r.round,strategy:r.strategy,tickets:r.tickets})===identity))return;
 const record={round,version:PENSION_VERSION,strategy,tickets:tickets.map(t=>({...t})),createdAt:new Date().toISOString(),timing:'browser-unauthenticated',seed:$('p-seed').value};
 localStorage.setItem(SKEY,JSON.stringify([...stored,record]));local=[...stored,record];renderRecords();}
function renderRecords(){const e=$('p-records');e.replaceChildren();const union=[...shared.map(r=>({...r,where:'공개 기록 (서버 시각 별도 확인 필요)'})),...local.map(r=>({...r,where:'이 기기 (시점 미인증)'}))];
 if(!union.length){e.append(element('p','아직 기록이 없습니다.'));return;}
 const rows=union.sort((a,b)=>b.round-a.round).slice(0,60).map(r=>{const d=official.find(x=>x.round===r.round);let grade='공식 결과 없음';if(d)grade=r.tickets.map(t=>ticketGrade(t,d)??'-').join(', ');return [r.round+'회',r.strategy||'',r.tickets.map(t=>t.group+'조 '+t.number).join(' / '),r.where,new Date(r.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),grade];});
 e.append(table(['회차','방식','추천번호','기록 구분','기록일시','대조 (1–7등·보너스)'],rows));
}
async function refreshData(){const resp=await fetch('./data/pension720-results.json',{cache:'no-store'});if(!resp.ok)throw Error('HTTP '+resp.status);const data=await resp.json();if(data.product!=='pension720')throw Error('다른 복권 자료 혼입');official=validatePensionRows(data.draws||[]);
 const latest=official.at(-1);
 const known=new Set(official.map(d=>d.round));
 const gaps=latest?Array.from({length:latest.round},(_,i)=>i+1).filter(r=>!known.has(r)):[];
 status('p-official',latest?`공식 확인 ${official.length}개 회차 · 최신 ${latest.round}회 (${latest.date}) · 누락 ${gaps.length}회${gaps.length?' (자동 보충 대상)':' (연속 수집)'}`:'공식 당첨자료가 아직 수집되지 않았습니다. 번호를 임의로 생성하지 않습니다.');
 if(official.length&&!$('p-round').value)$('p-round').value=official.at(-1).round+1;
 try{const rec=await fetch('./data/pension720-weekly.json',{cache:'no-store'});if(rec.ok){const d=await rec.json();if(d.product!=='pension720'||!Array.isArray(d.records))throw Error('공개 기록 구조 오류');shared=d.records.filter(r=>r.version===PENSION_VERSION&&Array.isArray(r.tickets));}}catch(e){status('p-recordstatus','공개 기록 확인 필요: '+e.message,true);}
 renderRecords();renderResearch();}
function renderResearch(){const e=$('p-research');e.replaceChildren();if(!official.length){e.append(element('p','검증된 공식 회차 자료가 없어 연구 결과를 산출하지 않았습니다. 사후 학습 결과를 미래 예측 우위로 표시하지 않습니다.'));return;}
 const stats=randomnessSummary(official),walk=backtest(official);e.append(table(['자리','표본수','엔트로피 (정규화)','카이제곱 p','카이제곱 보정 p','Runs p','Runs 보정 p'],stats.map(x=>[x.label,x.n,x.normalizedEntropy?.toFixed(4)??'-',x.chiPValue?.toFixed(5)??'표본부족',x.adjustedChiP?.toFixed(5)??'표본부족',x.runsPValue?.toFixed(5)??'표본부족',x.adjustedRunsP?.toFixed(5)??'표본부족'])));
 e.append(element('p','Runs 검정은 자리별 0–4와 5–9(조는 1–2조와 3–5조) 분할 기준이며, 보정 p는 13개 자리에 대한 Bonferroni 보정입니다. 다중검정 보정 후에도 유의성은 예측 가능성을 입증하지 않습니다.','muted'));
 if(walk.status==='insufficient-data')e.append(element('p',`시계열 검증 보류: 검증 회차 최소 ${walk.minRequired}개 필요, 현재 ${walk.n}개.`));
 else {e.append(element('h3',`과거 시계열 순차검증 · 최종 ${walk.holdoutRounds}개 회차`));e.append(table(['모형','평균 Log Loss','평균 Brier','자리별 정답률','균등 대비 Log Loss 개선 (95% 구간)','3모형 보정 p'],walk.models.map(r=>[r.mode,r.logLoss.toFixed(6),r.brier.toFixed(6),pct(r.accuracy),r.vsUniform?`${r.vsUniform.meanLogLossImprovement.toFixed(6)} [${r.vsUniform.confidence95[0].toFixed(6)}, ${r.vsUniform.confidence95[1].toFixed(6)}]`:'기준',r.vsUniform?r.vsUniform.adjustedPValue.toFixed(4):'-'])));e.append(element('p',`균등 모형의 이론 정답률은 ${pct(walk.expectedUniformAccuracy)}입니다(동점은 균등 분배). 개선 값은 회차 단위 대응 비교이며 양수가 균등 대비 우위, 구간이 0을 포함하면 차이를 구별할 수 없습니다. `+walk.disclaimer,'muted'));}
}
async function init(){
 const nav=$('p-nav');nav.addEventListener('click',e=>{const target=e.target.closest('button[data-page]');if(!target)return;const which=target.dataset.page;$('lotto-view').hidden=which!=='lotto';$('pension-view').hidden=which!=='pension';for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===target));});
 try{local=JSON.parse(localStorage.getItem(SKEY)||'[]');if(!Array.isArray(local))throw Error('배열이 아닙니다');}catch(e){local=[];status('p-recordstatus','기록 읽기 실패. 기존 저장내용을 덮어쓰지 않습니다: '+e.message,true);}
 $('p-generate').onclick=()=>{try{const round=selectedRound();tickets=generatePortfolio({count:num('p-count'),strategy:$('p-strategy').value,round,seed:$('p-seed').value});showTickets();renderMetrics();persist();status('p-status',`${round}회 · ${tickets.length}장 · ${PENSION_VERSION} 생성 완료. 판매 여부는 공식 구매화면에서 확인하세요.`);}catch(e){status('p-status',e.message,true);}};
 $('p-compare').onclick=()=>{
  try{
   const results=compareStrategies(num('p-count'),selectedRound(),$('p-seed').value,options());
   const headers=['전략','본 7등 이상','본 6등 이상','본 1·2등','본·보너스 포함 ≥1장','구매비 회수 이상','1등·2등 동시','기대당첨금(원)','표준편차(원)'];
   const rows=results.map(({strategy,metrics:m})=>[
    names[strategy],pct(m.coverage.atLeast[7]),pct(m.coverage.atLeast[6]),pct(m.coverage.atLeast[2]),
    pct(m.probabilityAny),pct(m.probabilityRecover),pct(m.coverage.firstAndSecond),ko(m.expectation),ko(m.standardDeviation)
   ]);
   $('p-comparison').replaceChildren(table(headers,rows));
   status('p-status','동일 구매 장수 기준으로 당첨 확률과 구매비 회수 확률을 비교했습니다.');
  }catch(e){status('p-status',e.message,true);}
 };
 $('p-copy').onclick=async()=>{try{if(!tickets.length)throw Error('번호를 먼저 생성하세요.');const str=tickets.map((t,i)=>`${i+1}. ${t.group}조 ${t.number}`).join('\n');await navigator.clipboard.writeText(str);status('p-status','번호를 클립보드에 복사했습니다.');}catch(e){status('p-status','복사 제한 또는 오류: '+e.message,true);}};
 $('p-export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:1,records:local},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='pension720-local-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('p-refresh').onclick=async()=>{try{await refreshData();}catch(e){status('p-official','공식 기록 로딩 실패: '+e.message,true);}};
 for(const id of ['p-discount','p-tax','p-delay'])$(id).addEventListener('change',()=>{try{renderMetrics();}catch(e){status('p-status',e.message,true);}});
 try{await refreshData();}catch(e){status('p-official','공식 자료를 확인하지 못했습니다: '+e.message,true);}
 ready=true;
}
init();
