import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyAssets} from './verify-assets.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
async function fixture(t) {
 const dir = await mkdtemp(path.join(tmpdir(),'armagedom-closure-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const publicDir=path.join(dir,'public'),dist=path.join(dir,'dist');
 async function put(name,raw,source=true){for(const root of source?[publicDir,dist]:[dist]){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),raw);}}
 const glb=Buffer.alloc(20);glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8);glb.writeUInt32LE(0,12);glb.writeUInt32LE(0x4e4f534a,16);
 // Minimal glTF JSON chunk: embedded-resource model fixture.
 const json=Buffer.from('{"asset":{"version":"2.0"}}  ');const model=Buffer.alloc(20+json.length);glb.copy(model);model.writeUInt32LE(model.length,8);model.writeUInt32LE(json.length,12);json.copy(model,20);
 await put('assets/current.glb',model);await put('assets/unused.glb','original');
 await put('assets/manifest-lossless.json',JSON.stringify({models:{hero:{url:'current.glb',bytes:model.length,sha256:sha(model)},enemy:{url:'current.glb',bytes:model.length,sha256:sha(model)}}}));
 await put('world/west/layout.json','{}');await put('world/west/backdrop.png','picture');
 await put('world/manifest.json',JSON.stringify({files:[{path:'west/layout.json',bytes:2,sha256:sha('{}')},{path:'west/backdrop.png',bytes:7,sha256:sha('picture')}]}));
 await put('index.html','<script type="module" src="./assets/index-ABC.js"></script><link href="./assets/index-DEF.css" rel="stylesheet">',false);
 await put('assets/index-ABC.js','fetch("assets/manifest-lossless.json");fetch("world/manifest.json");',false);await put('assets/index-DEF.css','body{}',false);
 return {publicDir,dist,put};
}
test('selects shared model once, excludes unused original and is repeatable',async t=>{const f=await fixture(t);const r=await verifyAssets({...f,prune:true});assert.equal(r.removed.length,1);assert.equal(r.files.filter(x=>x.path.endsWith('.glb')).length,1);assert.deepEqual((await verifyAssets(f)).files,r.files);assert.equal(await readFile(path.join(f.publicDir,'assets/unused.glb'),'utf8'),'original');});
test('check-only detects unused copied assets',async t=>{const f=await fixture(t);await assert.rejects(verifyAssets(f),/Unselected/);});
test('missing selected resource fails before pruning',async t=>{const f=await fixture(t);await rm(path.join(f.dist,'assets/current.glb'));await assert.rejects(verifyAssets({...f,prune:true}));assert.equal(await readFile(path.join(f.dist,'assets/unused.glb'),'utf8'),'original');});
test('tampered selected model is rejected',async t=>{const f=await fixture(t);await f.put('assets/current.glb','broken',false);await assert.rejects(verifyAssets({...f,prune:true}),/hash|size/i);});
test('unexpected generated asset is rejected rather than deleted',async t=>{const f=await fixture(t);await f.put('secret.env','secret',false);await assert.rejects(verifyAssets({...f,prune:true}),/Unexpected/);});
test('manifest traversal and external URLs rejected',async t=>{const f=await fixture(t);for(const url of ['../escape.glb','https://example.com/a.glb','%2e%2e/a.glb']){await f.put('assets/manifest-lossless.json',JSON.stringify({models:{hero:{url}}}));await assert.rejects(verifyAssets({...f,prune:true}),/Unsafe/);}});
test('symlink copied asset rejected; overlapping output rejected',async t=>{const f=await fixture(t);await rm(path.join(f.dist,'assets/current.glb'));await symlink(path.join(f.publicDir,'assets/current.glb'),path.join(f.dist,'assets/current.glb'));await assert.rejects(verifyAssets({...f,prune:true}),/Symlink/);await assert.rejects(verifyAssets({dist:f.publicDir,publicDir:f.publicDir,prune:true}),/overlap/i);});

test('unreferenced hashed script rejected',async t=>{const f=await fixture(t);await f.put('assets/unused-ABC.js','unexpected',false);await assert.rejects(verifyAssets({...f,prune:true}),/Unexpected/);});

test('missing generated chunk rejected',async t=>{const f=await fixture(t);await f.put('assets/index-ABC.js','fetch("assets/manifest-lossless.json");fetch("world/manifest.json");import("./chunk-MISSING.js")',false);await assert.rejects(verifyAssets({...f,prune:true}),/Missing generated/);});
test('CSS resources retained and missing resources rejected',async t=>{const f=await fixture(t);await f.put('assets/index-DEF.css','body{background:url(./texture.png)}',false);await assert.rejects(verifyAssets({...f,prune:true}));await f.put('assets/texture.png','texture');const r=await verifyAssets({...f,prune:true});assert(r.files.some(x=>x.path==='assets/texture.png'));});
async function donorFixture(t){
 const f=await fixture(t),raw=await readFile(path.join(f.publicDir,'assets/current.glb'));
 await f.put('assets/donor/warrior.glb',raw);await f.put('assets/donor/goblin.glb',raw);await f.put('assets/donor/knife.glb',raw);
 const record=file=>({file,bytes:raw.length,sha256:sha(raw)});
 const manifest={models:{vagrant:{url:'warrior.glb',equipment:{url:'knife.glb'}},goblin:{url:'goblin.glb'}},files:{player:record('warrior.glb'),opponent:record('goblin.glb'),weapon:record('knife.glb')}};
 async function set(){await f.put('assets/donor/manifest.json',JSON.stringify(manifest));}
 await set();await f.put('assets/index-ABC.js','fetch("assets/donor/manifest.json");fetch("world/manifest.json");',false);
 return {...f,actors:'assets/donor/manifest.json',prune:true,manifest,set};
}
test('donor file hash records include equipment and prune original roster',async t=>{const f=await donorFixture(t),r=await verifyAssets(f);assert.deepEqual(r.files.filter(x=>x.path.endsWith('.glb')).map(x=>x.path),['assets/donor/goblin.glb','assets/donor/knife.glb','assets/donor/warrior.glb']);assert(r.removed.includes('assets/current.glb'));});
test('missing equipment hash record rejected before pruning',async t=>{const f=await donorFixture(t);delete f.manifest.files.weapon;await f.set();await assert.rejects(verifyAssets(f),/Missing.*hash/);assert.equal(await readFile(path.join(f.dist,'assets/unused.glb'),'utf8'),'original');});
test('tampered equipment rejected even when both copies match',async t=>{const f=await donorFixture(t);await f.put('assets/donor/knife.glb','tampered');await assert.rejects(verifyAssets(f),/hash|size/);});
test('missing and symlink equipment rejected',async t=>{const f=await donorFixture(t);await rm(path.join(f.dist,'assets/donor/knife.glb'));await assert.rejects(verifyAssets(f));await symlink(path.join(f.publicDir,'assets/donor/knife.glb'),path.join(f.dist,'assets/donor/knife.glb'));await assert.rejects(verifyAssets(f),/Symlink/);});
test('unsafe equipment URLs and hash-record paths rejected',async t=>{const f=await donorFixture(t);f.manifest.models.vagrant.equipment.url='../escape.glb';await f.set();await assert.rejects(verifyAssets(f),/Unsafe/);f.manifest.models.vagrant.equipment.url='knife.glb';f.manifest.files.weapon.file='https://example.com/knife.glb';await f.set();await assert.rejects(verifyAssets(f),/Unsafe/);});
test('conflicting duplicate donor hash records rejected',async t=>{const f=await donorFixture(t);f.manifest.files.extra={...f.manifest.files.weapon,sha256:'0'.repeat(64)};await f.set();await assert.rejects(verifyAssets(f),/Conflicting/);});
async function audioFixture(t){const f=await fixture(t),wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36,4);wav.write('WAVE',8);await f.put('audio/combat.wav',wav);const manifest={version:1,url:'combat.wav',bytes:wav.length,sha256:sha(wav),cues:{hit:[]}};async function set(){await f.put('audio/manifest.json',JSON.stringify(manifest));}await set();await f.put('assets/index-ABC.js','fetch("assets/manifest-lossless.json");fetch("world/manifest.json");fetch("audio/manifest.json")',false);return {...f,audio:'audio/manifest.json',prune:true,manifest,set};}
test('selected audio manifest and hashed WAV retained',async t=>{const f=await audioFixture(t),r=await verifyAssets(f);assert(r.files.some(x=>x.path==='audio/combat.wav'));assert(r.files.some(x=>x.path==='audio/manifest.json'));});
test('audio tamper rejected before exclusions are deleted',async t=>{const f=await audioFixture(t);await f.put('audio/combat.wav','tampered');await assert.rejects(verifyAssets(f),/hash|size/);assert.equal(await readFile(path.join(f.dist,'assets/unused.glb'),'utf8'),'original');});
test('missing or symlink WAV rejected',async t=>{const f=await audioFixture(t);await rm(path.join(f.dist,'audio/combat.wav'));await assert.rejects(verifyAssets(f));await symlink(path.join(f.publicDir,'audio/combat.wav'),path.join(f.dist,'audio/combat.wav'));await assert.rejects(verifyAssets(f),/Symlink/);});
test('unsafe audio URL and invalid hash metadata rejected',async t=>{const f=await audioFixture(t);f.manifest.url='../outside.wav';await f.set();await assert.rejects(verifyAssets(f),/Unsafe/);f.manifest.url='combat.wav';delete f.manifest.sha256;await f.set();await assert.rejects(verifyAssets(f),/hash record/);});
test('audio selection must appear in generated code',async t=>{const f=await audioFixture(t);await f.put('assets/index-ABC.js','fetch("assets/manifest-lossless.json");fetch("world/manifest.json")',false);await assert.rejects(verifyAssets(f),/configured audio/);});
