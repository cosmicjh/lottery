/** Fail-closed official-result parser: no guessed numbers, no historical rewriting. */
import {validatePensionRows} from './pension-research.mjs';
export const PENSION_API='https://www.dhlottery.co.kr/pt720/selectPstPt720Info.do';
function dateValue(x){const s=String(x??'').trim().replace(/[.\s]/g,'').replaceAll('-','');if(!/^\d{8}$/.test(s))return null;return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;}
function digits(v){if(v===null||v===undefined||!/^[0-9]{1,6}$/.test(String(v)))throw Error('공식 숫자 누락 또는 변형');return String(v).padStart(6,'0');}
export function parsePensionResponse(payload,desiredRound=null){
 const rows=payload?.data?.result;if(!Array.isArray(rows)||!rows.length)throw Error('공식 연금복권 API 스키마 불일치');
 const numbered=rows.map(r=>({r,round:Number(r.psltEpsd??payload.data?.psltEpsd),rank:Number(r.wnSqNo)}));
 const rounds=[...new Set(numbered.map(e=>e.round).filter(Number.isInteger))].sort((a,b)=>b-a);
 const round=desiredRound??rounds[0];if(!Number.isInteger(round)||round<1)throw Error('회차 확인 실패');
 const data=numbered.filter(e=>e.round===round);
 const one=data.filter(e=>e.rank===1),bonus=data.filter(e=>e.rank===21);
 if(one.length!==1||bonus.length!==1)throw Error('1등/보너스 공식 결과가 불완전합니다: '+round);
 const group=Number(one[0].r.wnBndNo),number=digits(one[0].r.wnRnkVl),b=digits(bonus[0].r.wnRnkVl);
 const rawDate=one[0].r.psltRflYmd??payload.data?.psltRflYmd??payload.data?.psltEpsdDt??payload.data?.drawDate;
 const date=dateValue(rawDate);
 if(!date)throw Error('추첨일 공식 날짜 필드 확인 필요');
 const draw={round,date,group,number,bonus:b,source:'official',sourceUrl:PENSION_API};validatePensionRows([draw]);return draw;
}
export function mergePension(oldDraws,newDraws){
 const old=validatePensionRows(oldDraws),fresh=validatePensionRows(newDraws),byRound=new Map(old.map(x=>[x.round,x]));
 for(const d of fresh){const p=byRound.get(d.round);if(p){if(p.group!==d.group||p.number!==d.number||p.bonus!==d.bonus||p.date!==d.date)throw Error(d.round+'회 기존 공식 결과와 충돌: 기존 값 보존');continue;}byRound.set(d.round,d);}
 return validatePensionRows([...byRound.values()]);
}
export async function fetchPensionRound(round=null,fetcher=fetch){
 const url=PENSION_API+(round===null?'':'?srchPsltEpsd='+encodeURIComponent(round));
 const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('공식 서버 HTTP '+response.status);
 const text=await response.text();if(text.length>2_000_000)throw Error('공식 응답이 비정상적으로 큽니다');
 let obj;try{obj=JSON.parse(text);}catch{throw Error('공식 서버가 JSON 응답을 반환하지 않음');}
 return parsePensionResponse(obj,round);
}
