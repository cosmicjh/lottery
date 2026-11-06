import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const read=(p)=>readFile(new URL(p,root),'utf8');

test('expanded original Lotto 6/45 features remain in integrated HTML',async()=>{
 const html=await read('index.html');
 for(const id of ['recommendmode','personalseed','portfolio-summary','birthdayfactor','othertickets','splitresult','auditsummary','p-nav','lotto-view','pension-view']){
  assert.ok(html.includes(`id="${id}"`),`Missing existing/new UI control: ${id}`);
 }
 assert.ok(html.includes('<script src="./scripts/portfolio.js"></script><script>'));
 assert.ok(html.includes('<script type="module" src="./scripts/pension-ui.mjs"></script>'));
 const originalInline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(originalInline);new vm.Script(originalInline);
 assert.ok(!/pension720|pt720/i.test(originalInline),'Pension module must not alter existing Lotto logic');
});
test('GitHub Pages bundle includes portfolio.js alongside every imported pension module and each product data file',async()=>{
 const workflow=await read('.github/workflows/lotto-pages.yml');
 for(const needle of ['cp scripts/portfolio.js public/scripts/','cp scripts/pension720.mjs scripts/pension-research.mjs scripts/pension-ui.mjs public/scripts/','data/lotto.json','data/weekly.json','data/study.json','data/pension720-results.json','data/pension720-weekly.json','data/pension720-study.json']){
  assert.ok(workflow.includes(needle),`Pages artifact missing ${needle}`);
 }
 for(const src of ['scripts/portfolio.js','scripts/pension-ui.mjs','scripts/pension-research.mjs','scripts/pension720.mjs','data/lotto.json','data/pension720-results.json']){
  await access(new URL(src,root));
 }
});
test('original Lotto benchmark research and independent verification tools are retained',async()=>{
 const benchmark=JSON.parse(await read('research/benchmark-1249.json'));
 assert.equal(typeof benchmark,'object');
 for(const path of ['lottery-analysis.md','lottery-deployment.md','tests/portfolio.test.mjs','tools/benchmark.mjs','tools/exact-enumeration.cpp','tools/verify.py'])await access(new URL(path,root));
});

test('new pension bulk-history backfill is integrated into existing Actions workflow',async()=>{
 const workflow=await read('.github/workflows/lotto-pages.yml');
 for(const token of ['pension_full_history:', 'node scripts/collect-pension.mjs --full', 'node scripts/collect-pension.mjs'])assert.ok(workflow.includes(token),token);
 for(const file of ['scripts/pension-backfill.mjs','tests/pension-backfill.test.mjs'])await access(new URL(file,root));
});
