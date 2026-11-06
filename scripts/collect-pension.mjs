/** Usage: node scripts/collect-pension.mjs [--full] [--limit=NUMBER] */
import {fileURLToPath} from 'node:url';
import {collectPensionHistory} from './pension-backfill.mjs';
const file=fileURLToPath(new URL('../data/pension720-results.json',import.meta.url));
const args=process.argv.slice(2),unknown=args.filter(a=>a!=='--full'&&!/^--limit=\d+$/.test(a));
if(unknown.length){console.error('지원하지 않는 옵션: '+unknown.join(', '));process.exitCode=2;}
else {
 const explicit=args.find(a=>a.startsWith('--limit='));
 const limit=explicit?Number(explicit.split('=')[1]):args.includes('--full')?1000:20;
 try{
  const result=await collectPensionHistory({file,maxRequests:limit});
  console.log(`연금복권 결과: 전체 API ${result.bulkOk?'성공':'미확인'}, 저장 ${result.stored}회, 신규 ${result.added}회, 누락 ${result.missing.length}회`);
  if(!result.ok){console.error('수집에 오류가 발생했습니다. 성공한 회차는 보존되었고 다음 실행 때 재시도합니다.');process.exitCode=1;}
 }catch(e){console.error('연금복권 수집 중단, 확인되지 않은 자료는 저장하지 않음:',e.message);process.exitCode=1;}
}
