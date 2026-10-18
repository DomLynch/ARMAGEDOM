import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {driverPreflight,MAINTAINED_ADAPTER_POLICY} from './driver-preflight.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixture=fileURLToPath(new URL('./fixtures/driver-preflight/valid',import.meta.url));
function stage(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'driver-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(fixture,root,{recursive:true});return root;}
const config=root=>({stageRoot:root,entrypoints:['driver.mjs']});
const codes=report=>report.errors.map(e=>e.code);
async function beforeSubmission(configuration,submit){const report=await driverPreflight(configuration);if(report.status!=='PASS_STATIC_DRIVER_PREFLIGHT')return{report,submitted:false};submit();return{report,submitted:true};}
test('valid maintained guarded driver resolves real AST imports/fixture and deterministic hashes without execution',async t=>{
 const root=stage(t),cfg=config(root),a=await driverPreflight(cfg),b=await driverPreflight(cfg);assert.equal(a.status,'PASS_STATIC_DRIVER_PREFLIGHT',JSON.stringify(a.errors));assert.deepEqual(a,b);assert.equal(a.phase,'static');assert.equal(a.identity,null);assert.equal(a.tool.parser.name,'acorn');assert.equal(a.trustedAdapters.length,1);assert.equal(a.files.find(f=>f.path==='scripts/qa/weapon-action-guard.mjs').sha256,MAINTAINED_ADAPTER_POLICY[0].sha256);assert.ok(a.files.some(f=>f.path==='fixtures/earned.json'));assert.ok(a.graph.some(e=>e.kind==='fixture'));assert.equal(a.files.find(f=>f.path==='read-state.mjs').sha256,sha(fs.readFileSync(path.join(root,'read-state.mjs'))));let submitted=0;assert.equal((await beforeSubmission(cfg,()=>submitted++)).submitted,true);assert.equal(submitted,1);
});
test('missing local module or literal data fixture rejects before any submission',async t=>{
 const root=stage(t);let submissions=0;fs.unlinkSync(path.join(root,'fixtures/earned.json'));const missing=await beforeSubmission(config(root),()=>submissions++);assert.equal(missing.submitted,false);assert.ok(codes(missing.report).includes('DEPENDENCY_UNAVAILABLE'));assert.equal(submissions,0);
 fs.writeFileSync(path.join(root,'fixtures/earned.json'),'{}');fs.unlinkSync(path.join(root,'read-state.mjs'));const module=await beforeSubmission(config(root),()=>submissions++);assert.equal(module.submitted,false);assert.equal(submissions,0);
});
test('direct bypass, method alias/destructuring and computed method reject with zero submission',async t=>{
 const root=stage(t),file=path.join(root,'bypass.mjs');let submissions=0;
 for(const source of["await page.click('#retry');","const unsafe=page.mouse.down; unsafe();","const {click:unsafe}=page; unsafe('#retry');","const method='click';page[method]('#retry');","page.evaluate(\"document.querySelector('button').click()\");"]){fs.writeFileSync(file,source);const result=await beforeSubmission({...config(root),entrypoints:['bypass.mjs']},()=>submissions++);assert.equal(result.submitted,false,source);assert.equal(result.report.status,'FAIL_STATIC_DRIVER_PREFLIGHT');assert.ok(result.report.errors.length);}
 assert.equal(submissions,0);
});
test('candidate cannot self-approve custom adapter or modified maintained helper',async t=>{
 const root=stage(t),source="export async function unsafe(page){await page.click('#fire')}";fs.writeFileSync(path.join(root,'unsafe.mjs'),source);
 let result=await driverPreflight({...config(root),entrypoints:['unsafe.mjs'],trustedAdapters:[{path:'unsafe.mjs',sha256:sha(source),exports:['unsafe'],callbackSlots:[]}]});assert.ok(codes(result).includes('CANDIDATE_TRUST_REJECTED'));assert.ok(codes(result).includes('UNGUARDED_INTERACTION'));
 fs.appendFileSync(path.join(root,'scripts/qa/weapon-action-guard.mjs'),'\n// candidate changed adapter\n');result=await driverPreflight(config(root));assert.ok(codes(result).includes('TRUSTED_HELPER_HASH_MISMATCH'));assert.equal(result.status,'FAIL_STATIC_DRIVER_PREFLIGHT');
});
test('audited aliased process launch and CDP send escapes reject with zero submission',async t=>{
 const root=stage(t);let submitted=0;
 for(const source of["import {spawn as launch} from 'node:child_process';launch('node',['unscanned.mjs']);","const dispatch=cdp.send.bind(cdp);await dispatch('Input.dispatchMouseEvent',{type:'mousePressed',x:0,y:0});","const dispatch=cdp.send;await dispatch('Input.dispatchTouchEvent',{});","const {send:dispatch}=cdp;await dispatch('Input.dispatchMouseEvent',{});","cdp.send.call(cdp,'Input.dispatchMouseEvent',{});","cdp.send.apply(cdp,['Input.dispatchMouseEvent',{}]);"]){fs.writeFileSync(path.join(root,'alias.mjs'),source);const result=await beforeSubmission({...config(root),entrypoints:['alias.mjs']},()=>submitted++);assert.equal(result.submitted,false,source);assert.ok(result.report.errors.some(e=>['UNSUPPORTED_PROCESS_CAPABILITY','UNSUPPORTED_PROTOCOL_ALIAS'].includes(e.code)),JSON.stringify(result.report.errors));}
 assert.equal(submitted,0);
});
test('reviewed UI guard ack parameter resolves only inside exact approved helper internals',async t=>{
 const root=stage(t);fs.copyFileSync(new URL('./ui-interaction-guard.mjs',import.meta.url),path.join(root,'scripts/qa/ui-interaction-guard.mjs'));
 const code="import {checkedControl} from './scripts/qa/ui-interaction-guard.mjs';export const run=page=>checkedControl(page,{selector:'#retry',method:'click',ack:()=>!document.getElementById('menu').open,timeoutMs:1000});";fs.writeFileSync(path.join(root,'ui.mjs'),code);let report=await driverPreflight({...config(root),entrypoints:['ui.mjs']});assert.equal(report.status,'PASS_STATIC_DRIVER_PREFLIGHT',JSON.stringify(report.errors));assert.equal(report.trustedAdapters[0].path,'scripts/qa/ui-interaction-guard.mjs');
 fs.writeFileSync(path.join(root,'ui.mjs'),code+"const ack=()=>true;await page.waitForFunction(ack);");report=await driverPreflight({...config(root),entrypoints:['ui.mjs']});assert.equal(report.status,'FAIL_STATIC_DRIVER_PREFLIGHT');assert.ok(codes(report).includes('UNSUPPORTED_BROWSER_EVALUATION'));
 fs.appendFileSync(path.join(root,'scripts/qa/ui-interaction-guard.mjs'),'\n// changed helper\n');report=await driverPreflight({...config(root),entrypoints:['ui.mjs']});assert.ok(codes(report).includes('TRUSTED_HELPER_HASH_MISMATCH'));
});
test('trusted binding shadow and callbacks outside direct approved call are not exemptions',async t=>{
 const root=stage(t),head="import {weaponAction} from './scripts/qa/weapon-action-guard.mjs';\n";
 for(const body of["export async function run(weaponAction){return weaponAction({press:()=>page.click('#fire')})}","const press=()=>page.click('#fire');weaponAction({press});"]){fs.writeFileSync(path.join(root,'shadow.mjs'),head+body);const report=await driverPreflight({...config(root),entrypoints:['shadow.mjs']});assert.equal(report.status,'FAIL_STATIC_DRIVER_PREFLIGHT');assert.ok(codes(report).includes('UNGUARDED_INTERACTION'));}
});
test('syntax, unresolved dynamic imports/data/code and process launch report unsupported rather than claiming PASS',async t=>{
 const root=stage(t),file=path.join(root,'unsupported.mjs');
 for(const source of["export function broken( {", "import('./'+name)","import fs from 'node:fs';fs.readFileSync(config.fixture)","new Function('page.click()')","import {spawn} from 'node:child_process';spawn('node',['unlisted.mjs'])"]){fs.writeFileSync(file,source);const report=await driverPreflight({...config(root),entrypoints:['unsupported.mjs']});assert.equal(report.status,'FAIL_STATIC_DRIVER_PREFLIGHT',source);}
});
test('fixture paths do not use ambiguous lexical constants or fake path methods; unsupported source extensions reject',async t=>{
 const root=stage(t),file=path.join(root,'paths.mjs');
 for(const source of["import fs from 'node:fs';const file='./fixtures/earned.json';function read(file){fs.readFileSync(file)}", "import fs from 'node:fs';const fake={join:()=>''};fs.readFileSync(fake.join('fixtures','earned.json'))", "import fs from 'node:fs';function a(){const file='missing.json';fs.readFileSync(file)}function b(){const file='fixtures/earned.json';fs.readFileSync(file)}", "import './unscanned.ts'"]){fs.writeFileSync(file,source);const report=await driverPreflight({...config(root),entrypoints:['paths.mjs']});assert.equal(report.status,'FAIL_STATIC_DRIVER_PREFLIGHT',source);}
 fs.writeFileSync(file,"import fs from 'node:fs';import path from 'node:path';const file=path.join(import.meta.dirname,'fixtures','earned.json');fs.readFileSync(file)");assert.equal((await driverPreflight({...config(root),entrypoints:['paths.mjs']})).status,'PASS_STATIC_DRIVER_PREFLIGHT');
});
test('local import cycles resolve once and stage escapes/symlinks fail closed',async t=>{
 const root=stage(t);fs.writeFileSync(path.join(root,'a.mjs'),"import './b.mjs';");fs.writeFileSync(path.join(root,'b.mjs'),"import './a.mjs';");const valid=await driverPreflight({...config(root),entrypoints:['a.mjs']});assert.equal(valid.status,'PASS_STATIC_DRIVER_PREFLIGHT');assert.equal(valid.files.length,2);
 fs.writeFileSync(path.join(root,'a.mjs'),"import '../outside.mjs';");assert.equal((await driverPreflight({...config(root),entrypoints:['a.mjs']})).status,'FAIL_STATIC_DRIVER_PREFLIGHT');fs.symlinkSync(path.join(root,'driver.mjs'),path.join(root,'alias.mjs'));assert.equal((await driverPreflight({...config(root),entrypoints:['alias.mjs']})).status,'FAIL_STATIC_DRIVER_PREFLIGHT');
});
test('source-build manifest binds actual files/fingerprint, allows null package hash; tamper rejects',async t=>{
 const root=stage(t),raw=fs.readFileSync(path.join(root,'driver.mjs')),files=[{path:'driver.mjs',bytes:raw.length,sha256:sha(raw)}],fingerprint=sha(JSON.stringify(files.map(f=>({bytes:f.bytes,path:f.path,sha256:f.sha256}))));fs.writeFileSync(path.join(root,'source-manifest.json'),JSON.stringify({version:1,head:'a'.repeat(40),fingerprint,files}));const cfg={...config(root),sourceManifest:'source-manifest.json',expect:{source:'a'.repeat(40),fingerprint,packageSha256:null}};let report=await driverPreflight(cfg);assert.equal(report.status,'PASS_STATIC_DRIVER_PREFLIGHT',JSON.stringify(report.errors));assert.deepEqual(report.identity,{source:'a'.repeat(40),fingerprint,packageSha256:null});
 fs.appendFileSync(path.join(root,'driver.mjs'),'\n// stale file\n');report=await driverPreflight(cfg);assert.equal(report.status,'FAIL_STATIC_DRIVER_PREFLIGHT');assert.ok(codes(report).includes('SOURCE_IDENTITY_FAILED'));
});
test('existing-package retry binds actual release/payload/hash, identity mismatch rejects',async t=>{
 const root=stage(t),directory=path.join(root,'export');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'index.html'),'actual bytes');const release={sourceCommit:'b'.repeat(40),sourceFingerprint:'c'.repeat(64),files:[{path:'index.html',bytes:12,sha256:sha('actual bytes')}]},raw=JSON.stringify(release);fs.writeFileSync(path.join(directory,'release.json'),raw);const cfg={...config(root),packageRoot:'export',expect:{source:release.sourceCommit,fingerprint:release.sourceFingerprint,packageSha256:sha(raw)}};let report=await driverPreflight(cfg);assert.equal(report.status,'PASS_STATIC_DRIVER_PREFLIGHT',JSON.stringify(report.errors));assert.equal(report.identity.packageSha256,sha(raw));fs.writeFileSync(path.join(directory,'index.html'),'changedbytes');assert.equal((await driverPreflight(cfg)).status,'FAIL_STATIC_DRIVER_PREFLIGHT');assert.equal((await driverPreflight({...config(root),expect:cfg.expect})).status,'FAIL_STATIC_DRIVER_PREFLIGHT');
});
test('CLI emits stable report and nonzero for missing fixture, no driver execution/submission side effects',t=>{
 const root=stage(t),cfg=path.join(root,'driver-preflight-config.json'),out=path.join(root,'driver-preflight.json'),script=fileURLToPath(new URL('./driver-preflight.mjs',import.meta.url));fs.writeFileSync(cfg,JSON.stringify({...config(root),stageRoot:'.'}));let run=spawnSync(process.execPath,[script,cfg,out],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const before=fs.readFileSync(out,'utf8');run=spawnSync(process.execPath,[script,cfg,out],{cwd:root,encoding:'utf8'});assert.equal(run.status,0);assert.equal(fs.readFileSync(out,'utf8'),before);fs.unlinkSync(path.join(root,'fixtures/earned.json'));run=spawnSync(process.execPath,[script,cfg,out],{cwd:root,encoding:'utf8'});assert.equal(run.status,1);assert.equal(JSON.parse(fs.readFileSync(out,'utf8')).status,'FAIL_STATIC_DRIVER_PREFLIGHT');
});
