import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {collectLotto} from './collector.mjs';
import {validateRows} from './model.mjs';
const path=fileURLToPath(new URL('../data/lotto.json',import.meta.url));
// Invalid existing data aborts before writing: never replace a corrupt history with an empty one.
const prior=JSON.parse(await readFile(path,'utf8'));
validateRows(prior.draws);
const next={...prior,attemptedAt:new Date().toISOString()};
try {
 next.draws=await collectLotto(prior.draws);
 next.checkedAt=new Date().toISOString();next.ok=true;
 next.status=`공식 결과 ${next.draws[0].round}회까지 확인. 최초 실행은 공식 응답의 최근 회차만 수집합니다. 과거 자료는 가져오기로 추가할 수 있습니다.`;
} catch(e) { next.ok=false;next.status='공식 수집 실패: '+e.message+'. 기존 자료 유지.';process.exitCode=1; }
await writeFile(path+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(path+'.tmp',path);
console.log(next.status);
