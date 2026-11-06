/** Strict parsing of unofficially documented endpoints on the official dhlottery host.
 * Results are never synthesized, corrected, or used to overwrite conflicting history.
 */
import {validatePensionRows} from './pension-research.mjs';

export const PENSION_API='https://www.dhlottery.co.kr/pt720/selectPstPt720Info.do';
export const PENSION_HISTORY_API='https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';
const HEADERS={
 Accept:'application/json',
 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
 'X-Requested-With':'XMLHttpRequest',
 Referer:'https://www.dhlottery.co.kr/pt720/result'
};
function dateValue(value){
 const s=String(value??'').trim().replace(/[.\s-]/g,'');
 if(!/^\d{8}$/.test(s))throw Error('공식 추첨일 형식 오류');
 return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}
function digits(v){
 if(v===null||v===undefined||!/^[0-9]{1,6}$/.test(String(v)))throw Error('공식 숫자 누락 또는 변형');
 return String(v).padStart(6,'0');
}
function strictRound(v){
 if(v===null||v===undefined||!/^[0-9]+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<1)throw Error('공식 회차 형식 오류');
 return Number(v);
}
function fromBulkRow(r){
 if(!r||typeof r!=='object')throw Error('전체 회차 항목 형식 오류');
 const draw={
  round:strictRound(r.psltEpsd),date:dateValue(r.psltRflYmd),group:Number(r.wnBndNo),
  number:digits(r.wnRnkVl),bonus:digits(r.bnsRnkVl),
  source:'official',sourceUrl:PENSION_HISTORY_API
 };
 validatePensionRows([draw]);return draw;
}
/** Bulk official-host endpoint returns one record per draw with bnsRnkVl. */
export function parsePensionHistory(payload){
 const rows=payload?.data?.result;
 if(!Array.isArray(rows)||rows.length<1)throw Error('전체 회차 공식 응답이 비었거나 스키마가 변경됨');
 const byRound=new Map();
 for(const raw of rows){
  const d=fromBulkRow(raw),existing=byRound.get(d.round);
  if(existing && (existing.date!==d.date||existing.group!==d.group||existing.number!==d.number||existing.bonus!==d.bonus))
   throw Error(`${d.round}회 전체 조회 응답에 상충하는 기록이 존재`);
  byRound.set(d.round,d);
 }
 return validatePensionRows([...byRound.values()]);
}
/** Per-round endpoint returns ranks 1 and 21 in data.result. */
export function parsePensionResponse(payload,desiredRound=null){
 const rows=payload?.data?.result;
 if(!Array.isArray(rows)||!rows.length)throw Error('개별 회차 공식 API 스키마 불일치');
 const numbered=rows.map(r=>({r,round:Number(r.psltEpsd??payload.data?.psltEpsd),rank:Number(r.wnSqNo)}));
 const rounds=[...new Set(numbered.map(e=>e.round).filter(Number.isInteger))].sort((a,b)=>b-a);
 const round=desiredRound??rounds[0];if(!Number.isInteger(round)||round<1)throw Error('회차 확인 실패');
 const data=numbered.filter(e=>e.round===round);
 const one=data.filter(e=>e.rank===1),bonus=data.filter(e=>e.rank===21);
 if(one.length!==1||bonus.length!==1)throw Error('1등/보너스 공식 결과가 불완전합니다: '+round);
 const rawDate=one[0].r.psltRflYmd??payload.data?.psltRflYmd??payload.data?.psltEpsdDt??payload.data?.drawDate;
 const draw={round,date:dateValue(rawDate),group:Number(one[0].r.wnBndNo),number:digits(one[0].r.wnRnkVl),bonus:digits(bonus[0].r.wnRnkVl),source:'official',sourceUrl:PENSION_API};
 validatePensionRows([draw]);return draw;
}
export function mergePension(oldDraws,newDraws){
 const old=validatePensionRows(oldDraws),fresh=validatePensionRows(newDraws),byRound=new Map(old.map(x=>[x.round,x]));
 for(const d of fresh){
  const p=byRound.get(d.round);
  if(p){
   if(p.group!==d.group||p.number!==d.number||p.bonus!==d.bonus||p.date!==d.date)
    throw Error(d.round+'회 기존 공식 결과와 충돌: 기존 값 보존');
   continue;
  }
  byRound.set(d.round,d);
 }
 return validatePensionRows([...byRound.values()]);
}
async function requestJson(url,fetcher){
 const response=await fetcher(url,{headers:HEADERS,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('공식 서버 HTTP '+response.status);
 const text=await response.text();
 if(text.length>8_000_000)throw Error('공식 응답이 비정상적으로 큽니다');
 let obj;try{obj=JSON.parse(text);}catch{throw Error('공식 서버가 JSON 응답을 반환하지 않음');}
 return obj;
}
export async function fetchPensionHistory(fetcher=fetch){
 return parsePensionHistory(await requestJson(PENSION_HISTORY_API,fetcher));
}
export async function fetchPensionRound(round=null,fetcher=fetch){
 if(round!==null&&(!Number.isInteger(round)||round<1))throw Error('요청 회차 오류');
 const url=PENSION_API+(round===null?'':'?srchPsltEpsd='+encodeURIComponent(round));
 return parsePensionResponse(await requestJson(url,fetcher),round);
}
