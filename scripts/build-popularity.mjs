/** Rebuild data/lotto-popularity.json from the official statistics stored in data/lotto.json.
 *
 * Usage: node scripts/build-popularity.mjs
 *        node scripts/build-popularity.mjs --input <draws.json> --source <label>   (one-off seed from another file)
 *
 * While data/lotto.json does not yet hold statistics for enough rounds, the existing profile is kept.
 */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {estimatePopularity} from './popularity.mjs';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const input=option('--input')??fileURLToPath(new URL('../data/lotto.json',import.meta.url));
const source=option('--source')??'official';
if(!/^[a-z0-9-]{1,40}$/.test(source))throw Error('--source 는 영문 소문자·숫자·하이픈만 허용합니다.');
const output=fileURLToPath(new URL('../data/lotto-popularity.json',import.meta.url));

const raw=JSON.parse(await readFile(input,'utf8')),draws=Array.isArray(raw)?raw:raw.draws;
let profile;
try{profile=estimatePopularity(draws,{source});}
catch(e){
 if(/부족/.test(e.message)){console.log('번호 인기도 갱신 보류: '+e.message+'. 기존 자료를 유지합니다.');process.exit(0);}
 throw e;
}
await writeFile(output+'.tmp',JSON.stringify(profile,null,1)+'\n');await rename(output+'.tmp',output);
const v=profile.validation.tiers.map(t=>`${t.rank}등 z=${t.z.toFixed(1)}`).join(', ');
console.log(`번호 인기도 갱신: ${profile.rounds.first}~${profile.rounds.last}회 (${profile.source}), 표본 외 검증 ${v}, 사용 ${profile.usable?'가능':'불가(균등 비중복 v2 사용)'}`);
