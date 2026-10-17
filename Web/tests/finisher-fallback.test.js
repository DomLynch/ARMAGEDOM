import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {selectFinisher} from '../src/finisher-selection.js';
import {FINISHER_DATA,flameDeathSeconds} from '../src/engine/finisher-data.js';
import {nativeFinisherSupport,applyFinisherCorpseCosmetic} from '../src/engine/finisher-cosmetics.js';
import {createLowHoverDroneLibrary} from '../src/low-hover-drone.js';
import {createGame,enemy,stepGame} from '../src/combat.js';
const families=[['pistol',null,'bullet-native-collapse'],['knife','light_right','cutting-native-collapse'],['knife','thrust','piercing-native-collapse'],['knife','skill_pommel','blunt-native-collapse'],['flamethrower',null,'flame-charred-collapse']];
test('every current weapon family gets a native zero-part special even at zero capacity and without humanoid preparation',()=>{
 for(const [weapon,moveId,recipeId]of families)for(const clip of['rat_death','dog_death','roach_death','Maul_Death','Death','drone_death'])for(const budget of[0,2]){
  const result=selectFinisher({victimId:'victim',lethal:true,weapon,moveId,attackClass:'fire',nativeDeath:{clip,seconds:1},impactDirection:{x:0,z:1}},{support:[],budget,ordinal:1});assert.equal(result.recipeId,recipeId);assert.equal(result.clip,clip);assert.deepEqual(result.parts,[]);assert.equal(result.cost,0);assert(result.admission.admitted);assert.equal(result.admission.reason,'native-fallback');
 }
 const overlap=selectFinisher({victimId:1,lethal:true,weapon:'knife',moveId:'light_right',nativeDeath:{clip:'Death',seconds:2.4},impactDirection:{x:0,z:0}},{ordinal:0});assert.equal(overlap.recipeId,'cutting-native-collapse','a confirmed overlapping lethal still gets a direction-free material presentation');
});
test('compatible alternatives rotate without suppressing admission and chosen corpse never rerolls',()=>{
 const support=[{id:'pistol-directional',clip:'Death',seconds:2.4,cost:0,parts:[],prepared:true},{id:'pistol-decapitation',clip:'Death',seconds:2.4,cost:1,parts:['head'],prepared:true}];let recent=null;
 for(let i=0;i<100;i++){const context={victimId:i+1,lethal:true,weapon:'pistol',impactDirection:{x:1,z:0}},out=selectFinisher(context,{support,budget:2,ordinal:i,recentRecipeId:recent});assert.notEqual(out.recipeId,recent);assert(out.admission.admitted);assert.equal(selectFinisher(context,{chosen:out,support:[],budget:0}),out);recent=out.recipeId;}
});
test('rejected whole-body native tints no longer mutate bullet, cutting or blunt corpses',()=>{const material=new T.MeshStandardMaterial({color:0xababab,emissive:0x010101,emissiveIntensity:.1}),baseline={material,color:material.color.clone(),emissive:material.emissive.clone(),intensity:.1},view={flashMaterials:[baseline],finisherAge:0};for(const recipeId of['pistol-directional','bullet-native-collapse','cutting-native-collapse','blunt-native-collapse']){assert.equal(applyFinisherCorpseCosmetic(view,{hp:0,finisher:{recipeId}}),false);assert(material.color.equals(baseline.color));assert.equal(material.emissiveIntensity,.1);}material.dispose();});
test('drone body materials are privately owned and disposed while another native drone stays unchanged',()=>{
 const library=createLowHoverDroneLibrary(),scene=new T.Scene(),a=library.spawn({scene}),b=library.spawn({scene}),ma=a.root.getObjectByName('ARM_Drone_Rigid_Frame').material,mb=b.root.getObjectByName('ARM_Drone_Rigid_Frame').material;assert.notEqual(ma,mb);const original=mb.color.clone();ma.color.setHex(0xff2200);assert(mb.color.equals(original));a.dispose();b.dispose();library.dispose();
});
test('actual pistol death with no prepared rig support is special once while death/supply/ammo remain once',()=>{
 const world={areaId:'westminster',spawn:{x:0,z:0},layout:{characterScale:1.3225},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};
 for(const rig of['original-rat','original-dog','original-roach','boss-warden']){const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,finishers:true});g.started=true;const e=Object.assign(enemy(0,{x:0,z:.9}),{rig,weapon:'knife',bodyScale:1,combatScale:1,hp:1,placementKey:'westminster-roamer-3',staggerUntil:100,finisherSupport:[]}),survivor=Object.assign(enemy(0,{x:20,z:20}),{rig:'hero',weapon:'knife',bodyScale:1,combatScale:1,staggerUntil:100});g.enemies=[e,survivor];Object.assign(g.pistol,{collected:true,equipped:true,magazine:6,reserve:12});stepGame(g,{actions:['fire'],aim:{x:0,z:1}});assert.equal(e.hp,0);assert.equal(e.finisher.recipeId,'bullet-native-collapse');assert.equal(g.kills,1);assert.equal(g.pistol.magazine,5);assert.equal(g.events.filter(x=>x.type==='death').length,1);assert.deepEqual(g.supplies.issued,['westminster-roamer-3']);const before=JSON.stringify(g.supplies);stepGame(g);assert.equal(g.kills,1);assert.equal(JSON.stringify(g.supplies),before);}
});
test('native fallback rows carry actual clip duration and collapse plus ground hold plus fade is finite',()=>{
 assert.deepEqual(nativeFinisherSupport({clip:'rat_death',seconds:.9}).map(r=>r.parts),Array(5).fill([]));assert(Math.abs(flameDeathSeconds(2.4)-6.7)<1e-10);assert.equal(flameDeathSeconds(9),8);assert.equal(nativeFinisherSupport({clip:'',seconds:1}).length,0);assert.equal(FINISHER_DATA.flameDeath.holdSeconds,3.5);
});

test('existing prepared finisher crimson/impact feedback is left untouched by the native fallback owner',()=>{const material=new T.MeshStandardMaterial({color:0x831428,emissive:0x831428,emissiveIntensity:.35}),baseline={material,color:new T.Color(0xababab),emissive:new T.Color(0),intensity:0};for(const recipeId of['pistol-directional','pistol-decapitation','decapitation','split-crown','opened','run-through']){assert.equal(applyFinisherCorpseCosmetic({flashMaterials:[baseline],finisherAge:.1},{hp:0,finisher:{recipeId}}),false);assert.equal(material.color.getHex(),0x831428);assert.equal(material.emissiveIntensity,.35);}material.dispose();});
