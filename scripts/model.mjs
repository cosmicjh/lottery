export function validateDraw(d) {
 if(!d||!Number.isInteger(d.round)||d.round<1||d.round>10000)throw Error('회차 범위 오류');
 if(!Array.isArray(d.nums)||d.nums.length!==6||new Set(d.nums).size!==6||d.nums.some(n=>!Number.isInteger(n)||n<1||n>45)||!Number.isInteger(d.bonus)||d.bonus<1||d.bonus>45||d.nums.includes(d.bonus))throw Error(d.round+'회 번호 오류');
 const result={round:d.round,nums:[...d.nums].sort((a,b)=>a-b),bonus:d.bonus};
 if(d.date){if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date))||new Date(d.date).toISOString().slice(0,10)!==d.date)throw Error('추첨일 오류');result.date=d.date;}
 return result;
}
export function validateRows(rows) {
 if(!Array.isArray(rows)||rows.length>10000)throw Error('회차 목록 형식 오류');
 const clean=rows.map(validateDraw);if(new Set(clean.map(d=>d.round)).size!==clean.length)throw Error('중복 회차');return clean;
}
export function mergeVisible(seed,overrides) {
 const map=new Map(seed.map(d=>[String(d.round),d]));
 for(const [r,d] of Object.entries(overrides)){if(d===null)map.delete(r);else map.set(r,d);}
 return [...map.values()].sort((a,b)=>b.round-a.round);
}
