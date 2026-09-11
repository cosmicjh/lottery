const WEEKLY_VERSION='weekly-five-v2-disjoint';
const LEGACY_WEEKLY_VERSION='weekly-five-v1';
async function weeklyFive(round,version=WEEKLY_VERSION){
 if(![WEEKLY_VERSION,LEGACY_WEEKLY_VERSION].includes(version))throw Error("지원하지 않는 추천 버전");
 if(!Number.isInteger(round)||round<1||round>10000)throw Error('대상 회차는 1~10000 정수입니다.');
 if(!globalThis.crypto?.subtle)throw Error('HTTPS 사이트에서 접속하세요. 이 브라우저는 번호 생성에 필요한 기능을 지원하지 않습니다.');
 let words=[],counter=0;
 async function integer(n){
  const limit=Math.floor(4294967296/n)*n;
  for(;;){if(!words.length){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${version}:${round}:${counter++}`));const view=new DataView(digest);words=Array.from({length:8},(_,i)=>view.getUint32(i*4,false));}const v=words.shift();if(v<limit)return v%n;}
 }
 if(version===WEEKLY_VERSION){
  const pool=Array.from({length:45},(_,i)=>i+1);
  for(let i=0;i<30;i++){const j=i+await integer(45-i);[pool[i],pool[j]]=[pool[j],pool[i]];}
  return Array.from({length:5},(_,i)=>pool.slice(i*6,i*6+6).sort((a,b)=>a-b));
 }
 const games=[],seen=new Set();
 while(games.length<5){const pool=Array.from({length:45},(_,i)=>i+1);for(let i=0;i<6;i++){const j=i+await integer(45-i);[pool[i],pool[j]]=[pool[j],pool[i]];}const nums=pool.slice(0,6).sort((a,b)=>a-b),key=nums.join(',');if(!seen.has(key)){seen.add(key);games.push(nums);}}
 return games;
}
function nextWeeklyTarget(draws,now=Date.now()){
 if(!draws.length)return null;
 const latest=draws.reduce((a,b)=>a.round>b.round?a:b);
 if(!latest.date||!/^\d{4}-\d{2}-\d{2}$/.test(latest.date))return null;
 const date=Date.parse(latest.date+'T00:00:00Z');
 if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==latest.date)return null;
 // Weekly schedule assumption, only one round ahead of confirmed data.
 const cutoff=date+7*86400000+11*3600000;
 if(!Number.isFinite(now)||now>=cutoff||latest.round>=10000)return null;
 return {round:latest.round+1,cutoff:new Date(cutoff).toISOString(),date:new Date(date+7*86400000).toISOString().slice(0,10)};
}
function gradeWeekly(games,draw){
 return games.map(nums=>{const hits=nums.filter(n=>draw.nums.includes(n)).length,bonus=nums.includes(draw.bonus);return {hits,rank:hits===6?1:hits===5?(bonus?2:3):hits===4?4:hits===3?5:0};});
}
async function validateWeeklyRecords(records){
 if(!Array.isArray(records)||records.length>10000)throw Error('기록 목록 형식 오류');
 const clean=[],seen=new Set();
 for(const r of records){if(![WEEKLY_VERSION,LEGACY_WEEKLY_VERSION].includes(r?.version)||seen.has(r.version+':'+r.round)||!Number.isFinite(Date.parse(r.createdAt))||!['before-cutoff','unverified'].includes(r.timing))throw Error('기록 버전·회차·시각 오류');
 const expected=await weeklyFive(r.round,r.version);if(JSON.stringify(expected)!==JSON.stringify(r.games))throw Error('기록 번호가 고정 규칙과 일치하지 않습니다.');
 seen.add(r.version+':'+r.round);clean.push({round:r.round,version:r.version,games:expected,createdAt:new Date(r.createdAt).toISOString(),timing:r.timing});}
 return clean.sort((a,b)=>b.round-a.round);
}
export {WEEKLY_VERSION,LEGACY_WEEKLY_VERSION,weeklyFive,nextWeeklyTarget,gradeWeekly,validateWeeklyRecords};
