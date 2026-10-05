import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';
import {HOLLOW_GARMENTS,hollowPaletteFor} from '../src/hollow-palette.js';
import {createActors} from '../src/actors.js';
import {disposeActorSources} from '../src/actor-resources.js';
import {createGame,spawnWave} from '../src/combat.js';
import {createHollowEncounter} from '../src/hollow-encounter.js';
const publicRoot=new URL('../public/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('assets/manifest-hollow.json',publicRoot)));
test('Hollow candidate resolves source-relative body/equipment hashes and keeps the donor player',()=>{
 assert.deepEqual(Object.keys(manifest.models).sort(),['hollow-scavenger','vagrant']);
 const donor=JSON.parse(fs.readFileSync(new URL('assets/donor/manifest.json',publicRoot)));
 const player=structuredClone(manifest.models.vagrant);player.url=player.url.replace('donor/','');player.equipment.url=player.equipment.url.replace('donor/','');assert.deepEqual(player,donor.models.vagrant);
 for(const entry of Object.values(manifest.files)){assert(!entry.file.includes('..'));const bytes=fs.readFileSync(new URL('assets/'+entry.file,publicRoot));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
 assert.equal(manifest.models['hollow-scavenger'].contactRig,'hero');assert.equal(manifest.count,3);
});
test('three Hollow bodies and native knives use independent clones/mixers at selected006 scale',async(t)=>{
 const priorDocument=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;});
 const models=new Map();for(const[name,description]of Object.entries(manifest.models))models.set(name,{description,gltf:await loadGeometry(fs.readFileSync(new URL('assets/'+description.url,publicRoot))),equipment:await loadGeometry(fs.readFileSync(new URL('assets/'+description.equipment.url,publicRoot)))});
 const world={layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,geometry:{clear:()=>true},toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)};
 const description=manifest.models['hollow-scavenger'];const game=createGame(world,{pilot:'donor-knife',encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:description.contactRig,bodyScale:description.bodyScale})});spawnWave(game);
 const actors=createActors(new THREE.Scene(),world,{models,manifest,dispose:()=>disposeActorSources(new Set([...models.values()].flatMap(m=>[m.gltf,m.equipment])))},{visualScale:1.3225});actors.update(game,0);
 assert.equal(game.enemies.length,3);const views=game.enemies.map(e=>actors.views.get(e.id));assert.equal(new Set(views.map(v=>v.root)).size,3);assert.equal(new Set(views.map(v=>v.motion.mixer)).size,3);
 for(const view of views){assert.equal(view.root.name,'hollow-scavenger');assert.equal(view.root.scale.x,1.265*1.3225);assert.equal(view.model.getObjectByName('WeaponDrawn').parent.name,'hand_r');}
 const paletteColors=views.map(view=>view.materials.filter(m=>Object.values(HOLLOW_GARMENTS).includes(m.material.name)).map(m=>({name:m.material.name,rgb:m.material.color.toArray()})));
 for(let i=0;i<views.length;i++){const palette=hollowPaletteFor(game.enemies[i],world.areaId);assert.ok(paletteColors[i].length>=2);for(const m of paletteColors[i])assert.deepEqual(m.rgb,m.name===HOLLOW_GARMENTS.jacket?palette.jacket:palette.trousers);}
 assert.equal(new Set(paletteColors.map(list=>String(list.find(m=>m.name===HOLLOW_GARMENTS.jacket).rgb))).size,3);
 const sourceColors=new Map();models.get('hollow-scavenger').gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])sourceColors.set(m,m.color.toArray());});
 game.enemies[0].flashUntil=game.time+.12;actors.update(game,0);assert.ok(views[0].materials.filter(m=>m.material.emissive).every(m=>m.material.emissiveIntensity===.8));game.time+=.13;actors.update(game,0);for(const m of views[0].materials)if(m.material.emissive){assert.deepEqual(m.material.emissive.toArray(),m.emissive.toArray());assert.equal(m.material.emissiveIntensity,m.intensity);}
 let disposed=0;const own=views.flatMap(v=>v.materials.map(m=>m.material));for(const material of own)material.addEventListener('dispose',()=>disposed++);actors.reset();assert.equal(disposed,own.length);actors.update(game,0);
 for(let i=0;i<views.length;i++){const recreated=actors.views.get(game.enemies[i].id);assert.notEqual(recreated.model,views[i].model);for(const m of recreated.materials){const expected=paletteColors[i].find(p=>p.name===m.material.name);if(expected)assert.deepEqual(m.material.color.toArray(),expected.rgb);}}
 // Controlled material integration: registered keys survive serial-ID changes and real corpse views.
 world.areaId='westminster';actors.reset();
 for(let i=0;i<game.enemies.length;i++){game.enemies[i].placementKey=`westminster-roamer-${i+1}`;game.enemies[i].id+=100;}
 actors.update(game,0);
 for(const entity of game.enemies){const view=actors.views.get(entity.id),palette=hollowPaletteFor(entity,world.areaId);assert.equal(view.palette,palette);for(const {material} of view.materials){if(material.name===HOLLOW_GARMENTS.jacket)assert.deepEqual(material.color.toArray(),palette.jacket);if(material.name===HOLLOW_GARMENTS.trousers)assert.deepEqual(material.color.toArray(),palette.trousers);}}
 assert.equal(actors.views.get(0).palette,null);
 const dead=game.enemies.shift(),outfit=actors.views.get(dead.id).palette;dead.hp=0;game.corpses.push(dead);actors.update(game,0);assert.equal(actors.views.get(dead.id).palette,outfit);
 actors.reset();actors.update(game,0);assert.equal(actors.views.get(dead.id).palette,outfit);
 for(const [material,rgb]of sourceColors)assert.deepEqual(material.color.toArray(),rgb);actors.dispose();
});
