import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';
import {HOLLOW_GARMENTS,hollowPaletteFor} from '../src/hollow-palette.js';
import {mobSizeProfile} from '../src/mob-size.js';
import {allocateFaceRecipes} from '../src/face-allocator.js';
import {FACE_APPEARANCE_VERSION,FACE_RECIPES,FACE_SKINS,ORIGINAL_FACE_ID} from '../src/face-recipes.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
import {selectFinisher} from '../src/finisher-selection.js';
import {createActors} from '../src/actors.js';
import {disposeActorSources} from '../src/actor-resources.js';
import {createGame,spawnWave} from '../src/combat.js';
import {createHollowEncounter} from '../src/hollow-encounter.js';
const sceneHeadCount=actors=>actors.views.get(0).root.parent.children.filter(o=>o.name==='Prepared detached Hollow head').length;
const assertComplexion=view=>{const recipe=FACE_RECIPES.find(r=>r.id===view.appearance.id),skin=FACE_SKINS.find(s=>s.id===recipe.skinPreset);assert.deepEqual(view.model.getObjectByName('Photo').material.color.toArray(),skin.photo,'ordinary update preserves authored complexion');};
const publicRoot=new URL('../public/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('assets/manifest-hollow.json',publicRoot)));
test('Hollow candidate resolves source-relative body/equipment hashes and keeps the donor player',()=>{
 assert.deepEqual(Object.keys(manifest.models).sort(),['hollow-scavenger','original-dog','original-rat','original-roach','vagrant']);
 const donor=JSON.parse(fs.readFileSync(new URL('assets/donor/manifest.json',publicRoot)));
 const player=structuredClone(manifest.models.vagrant);player.url=player.url.replace('donor/','');player.equipment.url=player.equipment.url.replace('donor/','');assert.deepEqual(player,donor.models.vagrant);
 for(const entry of Object.values(manifest.files)){assert(!entry.file.includes('..'));const bytes=fs.readFileSync(new URL('assets/'+entry.file,publicRoot));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
 assert.equal(manifest.models['hollow-scavenger'].contactRig,'hero');assert.equal(manifest.count,3);
});
test('three Hollow bodies and native knives use independent clones/mixers at selected006 scale',async(t)=>{
 const priorDocument=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};t.after(()=>{if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;});
 const models=new Map();for(const[name,description]of Object.entries(manifest.models))models.set(name,{description,gltf:await loadGeometry(fs.readFileSync(new URL('assets/'+description.url,publicRoot))),equipment:description.equipment?await loadGeometry(fs.readFileSync(new URL('assets/'+description.equipment.url,publicRoot))):null});
 const world={layout:{characterScale:1.265},spawn:{x:0,z:-6},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,geometry:{clear:()=>true,lineClear:()=>true},toRender:(p,h=0)=>new THREE.Vector3(p.x,h,-p.z)};
 const description=manifest.models['hollow-scavenger'];const game=createGame(world,{pilot:'donor-knife',encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:description.contactRig,bodyScale:description.bodyScale})});spawnWave(game);
 const pistolAsset=await loadGeometry(fs.readFileSync(new URL('assets/pistol/pistol.glb',publicRoot)));
 const actors=createActors(new THREE.Scene(),world,{models,manifest,pistolAsset,dispose:()=>disposeActorSources(new Set([...models.values()].flatMap(m=>[m.gltf,m.equipment].filter(Boolean))))},{visualScale:1.3225});actors.update(game,0);
 const playerView=actors.views.get(0);assert.equal(playerView.pistolSlide.supported,true);
 game.player.weapon='pistol';actors.update(game,0,0);const hand=playerView.model.getObjectByName('hand_r'),restHand=hand.getWorldPosition(new THREE.Vector3()),restGun=playerView.pistolMount.getWorldPosition(new THREE.Vector3());actors.update(game,0,1);assert.equal(playerView.pistolSlide.slide.position.z,-.012);const recoilHand=hand.getWorldPosition(new THREE.Vector3()),recoilGun=playerView.pistolMount.getWorldPosition(new THREE.Vector3());assert.ok(recoilHand.distanceTo(restHand)>.1,'whole arm conveys actual shot recoil');assert.ok(Math.abs(recoilHand.distanceTo(recoilGun)-restHand.distanceTo(restGun))<1e-6,'gun remains gripped while arm recoils');
 const slideMaterial=playerView.pistolSlide.slide.children[0].material;assert.ok(playerView.materials.some(m=>m.material===slideMaterial),'slide borrows the actor private material');
 actors.update(game,0,.4);assert.ok(Math.abs(playerView.pistolSlide.slide.position.z+.0048)<1e-9);
 actors.resetFeedback();assert.equal(playerView.pistolSlide.slide.position.z,0);game.player.weapon='knife';actors.update(game,0,1);assert.equal(playerView.pistolSlide.slide.position.z,0,'holstered slide remains at rest');
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
 assert.equal(actors.views.get(0).palette,null);assert.equal(actors.views.get(0).appearance,null);
 const faceMap=allocateFaceRecipes('london-residents',Object.values(AREA_MOB_SPAWNS).flat().map(r=>r.key),{version:FACE_APPEARANCE_VERSION,recipes:FACE_RECIPES});assert.equal(new Set(faceMap.values()).size,24);
 for(const e of game.enemies)assert.equal(actors.views.get(e.id).appearance.id,faceMap.get(e.placementKey));
 const dead=game.enemies.shift(),outfit=actors.views.get(dead.id).palette,faceId=actors.views.get(dead.id).appearance.id;dead.hp=0;game.corpses.push(dead);actors.update(game,0);assert.equal(actors.views.get(dead.id).palette,outfit);assert.equal(actors.views.get(dead.id).appearance.id,faceId);
 actors.reset();actors.update(game,0);assert.equal(actors.views.get(dead.id).palette,outfit);assert.equal(actors.views.get(dead.id).appearance.id,faceId);
 const cohort=[...game.enemies,...game.corpses];for(let i=0;i<cohort.length;i++){const entity=cohort[i],factor=[.85,1.15,1][i];Object.assign(entity,mobSizeProfile({bodyScale:1,combatScale:1.265,radius:.4},factor),{mobSize:factor});}
 actors.reset();actors.update(game,0);
 for(const entity of cohort){const view=actors.views.get(entity.id);assert.equal(view.root.scale.x,1.265*1.3225*entity.mobSize);assert.equal(view.shadow.scale.x,1.25*view.root.scale.x);assert.ok(view.root.position.equals(world.toRender(entity.pos)));assert.equal(view.palette,hollowPaletteFor(entity,world.areaId));}
 assert.equal(actors.views.get(0).root.scale.x,1.265*1.3225);
 for(const [material,rgb]of sourceColors)assert.deepEqual(material.color.toArray(),rgb);
 const hair=[...actors.views.values()].flatMap(v=>v.appearance?.extraMaterials??[]);let hairDisposed=0;hair.forEach(m=>m.addEventListener('dispose',()=>hairDisposed++));
 const flashed=actors.views.get(dead.id);dead.flashUntil=game.time+.12;actors.update(game,0);for(const m of flashed.flashMaterials)if(m.material.emissive)assert.equal(m.material.emissiveIntensity,.8);game.time+=.13;actors.update(game,0);for(const m of flashed.flashMaterials)if(m.material.emissive)assert.deepEqual(m.material.emissive.toArray(),m.emissive.toArray());
 // Controlled actual-view area cohorts: full roster IDs survive teardown/recreation;
 // this checks the renderer seam, not native gate traversal.
 for(const [area,rows] of Object.entries(AREA_MOB_SPAWNS)){
  actors.reset();world.areaId=area;game.corpses=[];
  game.enemies=rows.map((row,i)=>({...cohort[i%cohort.length],id:300+i,placementKey:row.key,pos:{...row.pos},hp:100,flashUntil:0}));
  actors.update(game,0);
  for(const e of game.enemies){const v=actors.views.get(e.id);assert.equal(v.appearance.id,faceMap.get(e.placementKey));assertComplexion(v);assert.equal(v.palette,hollowPaletteFor(e,area));assert.equal(v.model.getObjectByName('Scavenger hair')?.skeleton??v.model.getObjectByName('Photo').skeleton,v.model.getObjectByName('Photo').skeleton);}
  assert.equal(new Set(game.enemies.map(e=>actors.views.get(e.id).appearance.id)).size,rows.length);
 }
 for(const [material,rgb]of sourceColors)assert.deepEqual(material.color.toArray(),rgb);
 // Controlled real-rig stage1 renderer: prepare only at birth, separate corpse
 // poses, borrowed current face/hair, normal clock, head expiry and reset cleanup.
 actors.reset();world.areaId='westminster';game.finishers={maxHeads:2,recentRecipeId:null};game.corpses=[];
 game.enemies=cohort.map((e,i)=>({...e,pos:{x:i*.8,z:1},id:500+i,placementKey:`westminster-roamer-${i+1}`,hp:100,response:null,flashUntil:0}));
 actors.update(game,0);
 for(const e of game.enemies)assert.ok(e.finisherSupport.some(s=>s.id==='decapitation'));
 // Controlled actual-rig feedback: one owner composes render flinch without
 // changing logical positions or advancing/fighting the complete finisher clock.
 const receiver=game.enemies[0],rendered=actors.views.get(receiver.id),origin=world.toRender(receiver.pos),logical={...receiver.pos};
 actors.events({events:[{type:'hit',actor:receiver,amount:10,impactDirection:{x:1,z:0}}]});actors.update(game,1/60,0,{presentationDt:1/60});
 assert.ok(rendered.flashMaterials.filter(m=>m.material.emissive).every(m=>m.material.emissiveIntensity===1),'High real-rig pale flash is visible');
 assert.deepEqual(rendered.model.getObjectByName('Photo').material.color.toArray(),new THREE.Color('#fff3dd').toArray());
 assert.ok(Math.abs(rendered.root.position.x-origin.x-.10)<1e-8);assert.ok(Math.abs(rendered.root.rotation.z+.30)<1e-8);assert.deepEqual(receiver.pos,logical);
 actors.update(game,0,0,{presentationDt:0});assert.ok(Math.abs(rendered.root.position.x-origin.x-.10)<1e-8,'paused repeat does not accumulate root offset');
 world.geometry.clear=()=>false;actors.update(game,0,0,{presentationDt:0});assert.ok(rendered.root.position.equals(origin),'registered wall suppresses visual offset');world.geometry.clear=()=>true;
 actors.configureFeedback('low');assertComplexion(rendered);for(const m of rendered.flashMaterials)if(m.emissive){assert.deepEqual(m.material.emissive.toArray(),m.emissive.toArray());assert.equal(m.material.emissiveIntensity,m.intensity);}actors.events({events:[{type:'hit',actor:receiver,amount:10,impactDirection:{x:1,z:0}}]});actors.update(game,1/60,0,{presentationDt:1/60});assert.ok(Math.abs(rendered.root.position.x-origin.x-.04)<1e-8);
 actors.configureFeedback('off');actors.events({events:[{type:'hit',actor:receiver,amount:10,impactDirection:{x:1,z:0}}]});actors.update(game,1/60,0,{presentationDt:1/60});assert.ok(rendered.root.position.equals(origin));actors.configureFeedback('high');actors.events({events:[{type:'hit',actor:receiver,amount:10}]});actors.update(game,0);actors.resetFeedback();assertComplexion(rendered);for(const m of rendered.flashMaterials)if(m.emissive){assert.deepEqual(m.material.emissive.toArray(),m.emissive.toArray());assert.equal(m.material.emissiveIntensity,m.intensity);}actors.update(game,0);

 const gun=game.enemies.shift();let gunView=actors.views.get(gun.id);gun.finisher=selectFinisher({victimId:gun.id,lethal:true,weapon:'pistol',impactDirection:{x:1,z:0}},{support:gun.finisherSupport,budget:2,ordinal:1});gun.hp=0;gun.response={start:game.time,ticks:144,clip:'Death'};game.corpses.push(gun);actors.events({events:[{type:'hit',actor:gun,amount:15,impactDirection:{x:1,z:0}}]});actors.update(game,0);assert.equal(gunView.impactFlashLife,.1,'actual sever uses existing finite flash slot');assert.equal(gunView.model.getObjectByName('Photo').material.color.getHex(),0x831428);assert.equal(gunView.model.getObjectByName('Photo').material.emissiveIntensity,.35);
 const native=v=>v.motion.native??v.motion;assert.equal(gun.finisher.recipeId,'pistol-decapitation');assert.equal(gunView.finisher.stats().detached,true);assert.equal(native(gunView).currentClip,'Hit');
 const half=gun.finisherSupport.find(row=>row.id==='pistol-directional').reactionSeconds/2;game.time+=half;actors.update(game,half);assert.equal(native(gunView).currentClip,'Hit');assert.ok(Math.abs(native(gunView).currentPhase-.375)<1e-6,'victim Hit pose uses .75 speed during first .2s');assert.ok(Math.abs(gunView.root.position.x-world.toRender(gun.pos).x-.1*Math.sin(Math.PI*.375))<1e-6);
 game.time+=.05;actors.update(game,.05);game.time+=.05;actors.update(game,.05);assert.equal(gunView.impactFlashLife,0);assertComplexion(gunView);
 const cut=game.enemies.shift();let cutView=actors.views.get(cut.id);cut.finisher=selectFinisher({victimId:cut.id,lethal:true,weapon:'knife',moveId:'light_right',impactDirection:{x:0,z:1}},{support:cut.finisherSupport,budget:2,ordinal:1});cut.hp=0;cut.response={start:game.time,ticks:144,clip:'Death'};game.corpses.push(cut);actors.update(game,0);
 assert.equal(native(cutView).currentClip,'Death_SplitCrown');assert.equal(cutView.finisher.stats().detached,true);assert.equal(sceneHeadCount(actors),2);
 const photo=cutView.model.getObjectByName('Photo');assert.equal(photo.visible,false);assert.equal(cutView.finisher.stats().lethalVertexCopies,0);
 actors.reset();actors.update(game,0,0,{restoreCorpses:true});gunView=actors.views.get(gun.id);cutView=actors.views.get(cut.id);
 assert.equal(sceneHeadCount(actors),2);assert.equal(gunView.model.getObjectByName('Photo').visible,false);assert.equal(native(gunView).currentClip,'Hit');assert.equal(cutView.model.getObjectByName('Photo').visible,false);
 game.time+=7;actors.update(game,7);assert.equal(cutView.finisher.stats().expired,true);assert.equal(cut.finisherHeadUntil,0);assert.equal(sceneHeadCount(actors),0);assert.equal(native(gunView).currentClip,'Death');
 actors.reset();actors.update(game,0,0,{restoreCorpses:true});assert.equal(actors.views.get(cut.id).model.getObjectByName('Photo').visible,false);assert.equal(actors.views.get(gun.id).model.getObjectByName('Photo').visible,false);assert.equal(sceneHeadCount(actors),0);
 // Regression: the real Crooked resident must use the same native pose for LUT preparation and death rendering.
 actors.reset();game.corpses=[];const rune={...cohort[0],id:777,placementKey:'westminster-roamer-3',pos:{x:0,z:1},mobSize:1.1,humanBodyRecipe:null,hp:40,response:null,finisher:null};game.enemies=[rune];actors.update(game,0);
 const runeView=actors.views.get(rune.id);assert.equal(runeView.locomotionVariant,'crooked-hollow');rune.finisher=selectFinisher({victimId:rune.id,lethal:true,weapon:'knife',moveId:'thrust',impactDirection:{x:1,z:0}},{support:rune.finisherSupport,budget:2,ordinal:1});assert.equal(rune.finisher.recipeId,'run-through');rune.hp=0;rune.response={start:game.time,ticks:60,clip:'Death'};game.enemies=[];game.corpses=[rune];const runeStart=game.time;
 for(const age of [.05,.25,.7,1.1]){game.time=runeStart+age;actors.update(game,.05);runeView.root.updateWorldMatrix(true,true);runeView.model.traverse(n=>{if(n.skeleton)n.skeleton.update();});let minimum=Infinity;const point=new THREE.Vector3();runeView.model.traverse(n=>{if(!n.isMesh)return;for(let p=n;p&&p!==runeView.root;p=p.parent)if(!p.visible)return;const index=n.geometry.index,pos=n.geometry.attributes.position;for(let i=0;i<(index?.count??pos.count);i++){n.getVertexPosition(index?index.getX(i):i,point).applyMatrix4(n.matrixWorld);minimum=Math.min(minimum,point.y);}});const pose=runeView.finisher.pose(runeView.finisherAge);assert.ok(minimum>=-.0001,JSON.stringify({age,minimum,root:runeView.root.position.toArray(),pose,clip:native(runeView).currentClip,phase:native(runeView).currentPhase,grounding:runeView.finisher.stats().runGrounding}));}
 actors.dispose();assert.equal(hairDisposed,hair.length);
});
