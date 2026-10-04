import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createEffects} from '../src/effects.js';
import {createGame,enemy,attack,stepGame} from '../src/combat.js';
let audio={};try{audio=await import('../src/donor-audio.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const attacker={id:1,pos:{x:0,z:0},facing:{x:0,z:1},combatScale:1.265};
test('donor Pommel is a close forward effect; legacy Special remains a shockwave',()=>{
 for(const donor of [false,true]) {
  const scene=new THREE.Scene(),fx=createEffects(scene,{toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)});
  fx.events({pilot:donor?'donor-knife':undefined,time:1,events:[{type:'strike',actor:attacker,action:'special',moveId:donor?'skill_pommel':undefined,dir:attacker.facing,range:1.3}]});
  const positions=scene.children.find(o=>o.isLine).geometry.attributes.position;let radius=0;
  for(let i=0;i<positions.count;i++){radius=Math.max(radius,Math.hypot(positions.getX(i),positions.getZ(i)));if(donor)assert.ok(positions.getZ(i)<0,'Pommel sweeps behind attacker');}
  assert.ok(Math.abs(radius-(donor?1.3*1.265:4.2))<1e-6);fx.dispose();
 }
});
test('donor impact uses victim ground metadata instead of attacker identity',()=>{
 const scene=new THREE.Scene(),fx=createEffects(scene,{toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)});
 const victim={id:2,pos:{x:3,z:4},facing:{x:0,z:-1}};
 fx.events({pilot:'donor-knife',time:1,events:[{type:'hit',actor:victim,attackerId:1,victimId:2,position:{x:3.2,z:4.1},amount:20}]});
 const impacts=scene.children.filter(o=>o.isLine);assert.equal(impacts.length,1);assert.equal(impacts[0].position.x,3.2);assert.equal(impacts[0].position.z,-4.1);fx.dispose();assert.equal(scene.children.length,0);
});
test('donor cues preserve impact gains and omit blocked hits, death and crowd',()=>{
 assert.equal(typeof audio.donorCues,'function','donor sound mapping missing');
 const cues=audio.donorCues([{type:'attack',moveId:'heavy_overhead',actor:attacker},{type:'hit',moveId:'heavy_overhead',actor:{id:2},attackerId:1,victimId:2},{type:'parry',actor:{id:2}},{type:'block'},{type:'guard-break'},{type:'dodge'},{type:'hit',blocked:true,amount:0},{type:'death'},{type:'wave'},{type:'attack',moveId:'skill_pommel'}]);
 assert.deepEqual(cues.map(c=>[c.name,c.gain]),[['hit_heavy',.3],['parry',1],['block',1],['guard_break',1],['whoosh_heavy',.18],['roll',.12],['whoosh_light',.12]]);
});
test('selected WAV contains exactly the pinned donor PCM ranges and no extra cues',()=>{
 const root=new URL('../public/audio/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root))),wav=readFileSync(new URL(manifest.url,root));
 assert.equal(createHash('sha256').update(wav).digest('hex'),manifest.sha256);
 assert.deepEqual(Object.keys(manifest.cues),['hit_flesh','hit_heavy','block','parry','guard_break','whoosh_light','whoosh_heavy','roll']);
 assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt32LE(24),48000);
 for(const [name,variants] of Object.entries(manifest.cues))for(let i=0;i<variants.length;i++){
   const [start,duration]=variants[i],origin=manifest.ranges.filter(r=>r.cue===name)[i],pcm=wav.subarray(44+Math.round(start*48000)*2,44+Math.round((start+duration)*48000)*2);
   assert.equal(createHash('sha256').update(pcm).digest('hex'),origin.pcmSHA256);
 }
});

for (const interrupted of [false,true]) {
 test(`enemy attack warning handles same-tick interruption: ${interrupted}`,()=>{
  const scene=new THREE.Scene(),world={spawn:{x:0,z:0},layout:{characterScale:1},
   move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,
   toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)};
  const game=createGame(world,{pilot:'donor-knife'}),foe=Object.assign(enemy(0,{x:0,z:1.1}),
   {rig:'goblin',weapon:'knife',combatScale:1,bodyScale:.78,hp:100,maxHP:100,ready:14/60});
  game.enemies=[foe];game.wave=1;
  if(interrupted)attack(game,'slash');
  for(let tick=0;tick<14;tick++)stepGame(game);
  assert.ok(game.events.some(event=>event.type==='enemy-attack'));
  assert.equal(foe.hp,interrupted?90:100);
  assert.equal(foe.swing===null,interrupted);
  const effects=createEffects(scene,world);
  try {
   effects.events(game);
   assert.equal(scene.children.filter(mesh=>mesh.isLine&&mesh.material.color.getHex()===0xe45735).length,interrupted?0:1);
   game.time+=1;effects.update(game);
   assert.equal(scene.children.filter(o=>o.isLine).length,0,'expired transient effects must leave the scene');
   assert.equal(scene.children.filter(o=>o.isGroup).length,2,'persistent pistol groups retain their owner until dispose');
  } finally {effects.dispose();assert.equal(scene.children.length,0,'dispose must remove every owned effect and pistol group');}
 });
}
