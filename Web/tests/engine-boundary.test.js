import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {checkEngineBoundaries} from '../tools/check-engine-boundaries.js';
import {SESSION_OPERATIONS,SIMULATION_STEP_SECONDS,assertSession} from '../src/engine/contracts.js';

const policyURL = new URL('../tools/engine-boundary-baseline.json', import.meta.url);
const policyRaw = readFileSync(policyURL);
const policy = JSON.parse(policyRaw);
const active = JSON.parse(readFileSync(new URL('../tools/engine-boundary-exceptions.json', import.meta.url)));
const files = {};
function readTree(url, prefix='') {
  for (const entry of readdirSync(url, {withFileTypes:true})) {
    const path=prefix+entry.name;
    if(entry.isDirectory()) readTree(new URL(entry.name+'/',url),path+'/');
    else if(entry.name.endsWith('.js')) files[path]=readFileSync(new URL(entry.name,url),'utf8');
  }
}
readTree(new URL('../src/',import.meta.url));

test('existing product imports match shrinking, explicit legacy exceptions',()=>{
  assert.equal(checkEngineBoundaries(files,policy,active).legacyRemaining,active.length);
});
test('a new client cannot import engine internals; public door and internal imports are allowed',()=>{
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"import {stepGame} from './combat.js';"},policy,active),/Forbidden engine boundary/);
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"export {x} from './engine/private.js';"},policy,active),/Forbidden engine boundary/);
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"const x=import('./engine/private.js');"},policy,active),/Forbidden engine boundary/);
  assert.doesNotThrow(()=>checkEngineBoundaries({...files,'new-mode.js':"import {createSession} from './engine/index.js';",'engine/inside.js':"import {stepGame} from '../combat.js';"},policy,active));
});
test('computed external imports and new renderer owners fail',()=>{
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':'const x=import(name);'},policy,active),/Forbidden engine boundary/);
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"const x=import('./' + 'combat.js');"},policy,active),/Forbidden engine boundary/);
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"const x=import('./' + 'engine/private.js');"},policy,active),/Forbidden engine boundary/);
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':String.raw`const x=import('./\x63ombat.js');`},policy,active),/Forbidden engine boundary/);
  assert.doesNotThrow(()=>checkEngineBoundaries({...files,'new-mode.js':"const x=import('./engine/index.js', {with:{type:'json'}});"},policy,active));
  assert.throws(()=>checkEngineBoundaries({...files,'new-mode.js':"import * as THREE from 'three';"},policy,active),/Forbidden engine boundary/);
});
test('legacy exceptions cannot grow and resolved exceptions must shrink',()=>{
  assert.throws(()=>checkEngineBoundaries(files,policy,[...active,'new-mode.js|internal-import|combat.js']),/cannot grow/);
  const row=policy.legacyExceptions.find(x=>x==='main.js|internal-import|combat.js');
  assert(row);
  const legacy={'main.js':"import {stepGame} from './combat.js';"};
  assert.equal(checkEngineBoundaries(legacy,policy,[row]).legacyRemaining,1);
  assert.throws(()=>checkEngineBoundaries({'main.js':''},policy,[row]),/Remove resolved/);
  assert.equal(checkEngineBoundaries({'main.js':''},policy,[]).legacyRemaining,0);
});
test('public session contract requires all lifecycle operations and preserves fixed step',()=>{
  const session=Object.fromEntries(SESSION_OPERATIONS.map(name=>[name,()=>{}]));
  assert.equal(assertSession(session),session);
  assert.equal(SIMULATION_STEP_SECONDS,1/60);
  delete session.dispose;assert.throws(()=>assertSession(session),/dispose/);
});
// The frozen maximum is digest-pinned below. Web removes active exceptions as
// extraction lands; growing the maximum is an explicit policy change, not a fix.
test('legacy maximum remains the reviewed frozen policy',()=>{
  assert.equal(createHash('sha256').update(policyRaw).digest('hex'),'c324cadbe2c636d73c4f615202889f59b66188eef47fa87b78b6f7db2acdb476');
});
