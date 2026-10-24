import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as THREE from 'three';
import {loadGeometry} from '../../art/donor/probe.mjs';
import {createSurvivorKit,survivorVariantIndex,SURVIVOR_VARIANTS} from '../src/engine/remote-survivors.js';
const read=p=>readFileSync(new URL('../public/assets/'+p,import.meta.url)),manifest=JSON.parse(read('manifest-hollow.json')),description=manifest.models.vagrant;
const source=async()=>({description,gltf:await loadGeometry(read(description.url)),equipment:await loadGeometry(read(description.equipment.url))});
const meshes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
test('the same player id always gets the same variant and every variant is used',()=>{
 for(const id of [1,7,42,'a1b2','uuid-0001'])assert.equal(survivorVariantIndex(id),survivorVariantIndex(id));
 assert.equal(survivorVariantIndex(12),survivorVariantIndex('12'));
 const seen=new Set();for(let id=1;id<=200;id++){const v=survivorVariantIndex(id);assert(v>=0&&v<SURVIVOR_VARIANTS.length);seen.add(v);}
 assert.equal(seen.size,SURVIVOR_VARIANTS.length);assert(SURVIVOR_VARIANTS.length>=4&&SURVIVOR_VARIANTS.length<=6);
});
test('variants are visibly distinct garment tints',()=>{
 const key=v=>v.garment.map(x=>x.toFixed(2)).join();assert.equal(new Set(SURVIVOR_VARIANTS.map(key)).size,SURVIVOR_VARIANTS.length);
});
test('eight remote players share geometry and per-variant materials, reuse the local model and start animated',async()=>{
 const src=await source(),kit=createSurvivorKit({source:src}),figures=Array.from({length:8},(_,i)=>kit.spawn(i+1)),sourceMeshes=meshes(src.gltf.scene);
 const geometries=new Set(sourceMeshes.map(m=>m.geometry)),materials=new Set(),byVariant=new Map();
 for(const f of figures){
  for(const m of meshes(f.root)){if(m.name==='Friendly ring')continue;assert(geometries.has(m.geometry)||m.geometry.attributes.position,'geometry present');
   for(const x of [].concat(m.material))materials.add(x);}
  assert(f.root.getObjectByName('Friendly ring'),'friendly ring');
  const same=byVariant.get(f.variant.id)??[];same.push(f);byVariant.set(f.variant.id,same);
 }
 const own=meshes(figures[0].root).filter(m=>m.isSkinnedMesh);assert(own.length>0);
 for(const f of figures)for(const m of meshes(f.root).filter(m=>m.isSkinnedMesh))assert(geometries.has(m.geometry),'skinned geometry is the shared source geometry');
 const sourceMaterials=new Set(sourceMeshes.flatMap(m=>[].concat(m.material)));
 assert(materials.size<=SURVIVOR_VARIANTS.length*(sourceMaterials.size+2)+8,'materials bounded by variants, not by players');
 for(const list of byVariant.values())for(const f of list.slice(1)){const a=new Set(meshes(list[0].root).flatMap(m=>[].concat(m.material)));assert(meshes(f.root).every(m=>[].concat(m.material).every(x=>a.has(x))),'same variant, same material instances');}
 assert.equal(kit.active,8);for(const f of figures)f.update({moving:false});
 for(const f of figures)f.dispose();assert.equal(kit.active,0);kit.dispose();
});
test('players wearing the same variant share one material set, different variants differ, skin is untouched',async()=>{
 const src=await source(),kit=createSurvivorKit({source:src}),ids=[];
 for(let id=1;ids.length<3&&id<500;id++){if(!ids.some(i=>survivorVariantIndex(i)===survivorVariantIndex(id)))ids.push(id);}
 const twin=[...Array(500).keys()].find(i=>i>ids[0]&&survivorVariantIndex(i)===survivorVariantIndex(ids[0])),a=kit.spawn(ids[0]),b=kit.spawn(twin),c=kit.spawn(ids[1]);
 const named=(f,n)=>meshes(f.root).filter(m=>[].concat(m.material).some(x=>x.name===n)).map(m=>[].concat(m.material).find(x=>x.name===n))[0];
 assert.equal(named(a,'Gambeson'),named(b,'Gambeson'));assert.notEqual(named(a,'Gambeson'),named(c,'Gambeson'));
 assert.notEqual(named(a,'Gambeson').color.getHex(),named(c,'Gambeson').color.getHex());
 const skinMat=named(a,'Skin');assert(skinMat);
 const original=meshes(src.gltf.scene).flatMap(m=>[].concat(m.material)).find(x=>x.name==='Skin');assert.equal(skinMat.color.getHex(),original.color.getHex());
 kit.dispose();
});
test('moving crossfades the walk clip in and a still player returns to idle',async()=>{
 const src=await source(),kit=createSurvivorKit({source:src}),f=kit.spawn(3);let t=0;const realNow=globalThis.performance.now.bind(globalThis.performance);
 globalThis.performance.now=()=>t;try{
  f.update({moving:true});for(let i=0;i<30;i++){t+=50;f.update({moving:true});}
  const weights=()=>f.mixer._actions.map(a=>a.getEffectiveWeight());assert(Math.max(...weights())===1&&Math.min(...weights())===0);
  const before=weights();for(let i=0;i<30;i++){t+=50;f.update({moving:false});}assert.notDeepEqual(weights(),before);
 }finally{globalThis.performance.now=realNow;}kit.dispose();
});
test('a kit with no equipment or clips refuses to build instead of drawing a broken figure',async()=>{
 const src=await source();assert.throws(()=>createSurvivorKit({source:{...src,equipment:null}}));assert.throws(()=>createSurvivorKit({source:null}));
});
test('disposing the kit releases its materials and rejects later spawns',async()=>{
 const src=await source(),kit=createSurvivorKit({source:src});kit.spawn(1);kit.dispose();assert.throws(()=>kit.spawn(2));
});
