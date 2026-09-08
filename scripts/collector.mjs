import {validateDraw} from './model.mjs';
export const SOURCE='https://www.dhlottery.co.kr';
async function fetchText(url,fetcher=fetch){
  const response=await fetcher(url,{headers:{Accept:'application/json,text/html','User-Agent':'LotteryResultReader/2.0'},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok)throw new Error('공식 사이트 HTTP '+response.status);
  const text=await response.text();if(text.length>3000000)throw new Error('응답 용량 초과');return text;
}
function number(v){if(v===null||v===undefined||String(v).trim()===''||!/^\d+$/.test(String(v)))throw new Error('공식 숫자 필드 누락');return Number(v);}
function drawDate(v){const s=String(v||'').replace(/[-.]/g,'');if(!/^\d{8}$/.test(s))throw new Error('공식 추첨일 누락');const date=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;if(new Date(date).toISOString().slice(0,10)!==date||Date.parse(date)>Date.now()+86400000)throw new Error('공식 추첨일 오류');return date;}
export function parseLottoResponse(body){
  const rows=body?.data?.list;if(!Array.isArray(rows)||!rows.length)throw new Error('공식 로또 응답 형식 변경 또는 미발표');
  return rows.map(r=>{
    const draw={round:number(r.ltEpsd),nums:[1,2,3,4,5,6].map(i=>number(r[`tm${i}WnNo`])),bonus:number(r.bnsWnNo),date:drawDate(r.ltRflYmd),sourceUrl:SOURCE+'/lt645/result'};
    for(const [key,field] of Object.entries({sales:'wholEpsdSumNtslAmt',firstWinners:'rnk1WnNope',secondWinners:'rnk2WnNope',thirdWinners:'rnk3WnNope'}))if(r[field]!=null)draw[key]=number(r[field]);
    return validateDraw(draw);
  });
}
function mergeOfficial(old,rows){
  const map=new Map(old.map(d=>[d.round,d]));
  for(const d of rows){const prior=map.get(d.round);if(prior){const a=[...prior.nums].sort((a,b)=>a-b).join(','),b=d.nums.join(',');if(a!==b||prior.bonus!==d.bonus)throw new Error(d.round+'회 기존 공식 결과와 충돌: 확인 후 갱신 필요');}map.set(d.round,{...prior,...d});}
  return [...map.values()].sort((a,b)=>b.round-a.round);
}
export async function collectLotto(old=[],fetcher=fetch){
  const html=await fetchText(SOURCE+'/lt645/result',fetcher);
  const matches=[...html.matchAll(/<[^>]+\b(?:data-value|value)=["'](\d{1,4})["'][^>]*>\s*(\d{1,4})회/g)].filter(m=>m[1]===m[2]).map(m=>Number(m[1]));
  if(!matches.length)throw new Error('공식 페이지의 회차 목록을 읽지 못했습니다.');
  const latest=Math.max(...matches);
  const url=new URL('/lt645/selectPstLt645InfoNew.do',SOURCE);url.searchParams.set('srchDir','center');url.searchParams.set('srchLtEpsd',String(latest));
  const rows=parseLottoResponse(JSON.parse(await fetchText(url.href,fetcher)));
  if(!rows.some(d=>d.round===latest))throw new Error('최신 회차 결과 미발표');
  return mergeOfficial(old,rows);
}
