import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {HOLLOW_GARMENTS,hollowPaletteFor,applyHollowPalette} from '../src/hollow-palette.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
const samples=AREA_MOB_SPAWNS.westminster.map((r,i)=>hollowPaletteFor({id:i+1,placementKey:r.key},'westminster'));
const bytes=readFileSync(new URL('../public/assets/hollow-scavenger/hollow-scavenger.glb',import.meta.url)),glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
test('pinned Hollow garment slots are separate from skin/photo/boots and retain vertex grime',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'352533ecf93234b23a69752b266b134eee387c35e5fc87ea0c2230085fa4f1ff');
 assert.equal(glb.materials[4].name,HOLLOW_GARMENTS.jacket);assert.equal(glb.materials[5].name,HOLLOW_GARMENTS.trousers);
 const body=glb.meshes[2].primitives;assert.deepEqual(body.map(p=>p.material),[3,4,5,6]);assert.ok(body.every(p=>p.attributes.COLOR_0!==undefined));
 assert.notEqual(glb.materials[3].name,HOLLOW_GARMENTS.jacket);assert.notEqual(glb.materials[6].name,HOLLOW_GARMENTS.trousers);
});
test('full registered area rosters use unique tops and outfits, ordinary and Crooked sharing one pool',()=>{
 for(const [area,roster] of Object.entries(AREA_MOB_SPAWNS)){
  const outfits=roster.map((resident,i)=>hollowPaletteFor({id:i+1,placementKey:resident.key},area));
  assert.equal(new Set(outfits.map(p=>p.topId)).size,roster.length);
  assert.equal(new Set(outfits.map(p=>p.id)).size,roster.length);
  for(const p of outfits)assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.jacket)&&Object.isFrozen(p.trousers));
 }
});
test('death, refresh, changed serial IDs, spawn order and area return retain resident outfits',()=>{
 const area='westminster',roster=AREA_MOB_SPAWNS[area];
 const initial=new Map(roster.map((r,i)=>[r.key,hollowPaletteFor({id:i+1,placementKey:r.key},area)]));
 // Remove a resident from the caller's surviving list; allocation still includes its key.
 for(const r of roster.slice(1).reverse())assert.equal(hollowPaletteFor({id:901,placementKey:r.key},area),initial.get(r.key));
 for(const r of AREA_MOB_SPAWNS.east)hollowPaletteFor({id:902,placementKey:r.key},'east');
 for(const r of roster)assert.equal(hollowPaletteFor({id:903,placementKey:r.key},area),initial.get(r.key));
});
test('nonresident fixtures have stable bounded approved fallback outfits',()=>{
 const fixtures=[1,2,3].map(id=>hollowPaletteFor({id},undefined));
 assert.equal(new Set(fixtures.map(p=>p.topId)).size,3);
 assert.equal(hollowPaletteFor({id:41},'fixture'),hollowPaletteFor({id:41},'fixture'));
 assert.equal(hollowPaletteFor({id:51},'fixture'),fixtures[0]);
});
test('only garment colour is written; shared texture/vertex detail/flash fields preserved',()=>{
 for(const name of glb.materials.map(m=>m.name).concat(['WeaponSteel','PhotoHair'])){
  const writes=[],map={},emissive={},material={name,color:{setRGB(...rgb){writes.push(rgb);}},map,vertexColors:true,emissive,emissiveIntensity:.8,roughness:.94};
  const yes=applyHollowPalette(material,samples[2]);assert.equal(yes,Object.values(HOLLOW_GARMENTS).includes(name));assert.equal(writes.length,yes?1:0);
  if(yes)assert.deepEqual(writes[0],name===HOLLOW_GARMENTS.jacket?samples[2].jacket:samples[2].trousers);
  assert.equal(material.map,map);assert.equal(material.emissive,emissive);assert.equal(material.emissiveIntensity,.8);assert.equal(material.vertexColors,true);assert.equal(material.roughness,.94);
 }
});
test('existing material clone identities stay independent',()=>{
 function own(){return {name:HOLLOW_GARMENTS.jacket,color:{rgb:[],setRGB(...rgb){this.rgb=rgb;}}};}
 const a=own(),b=own();applyHollowPalette(a,samples[0]);applyHollowPalette(b,samples[4]);assert.notDeepEqual(a.color.rgb,b.color.rgb);assert.deepEqual(a.color.rgb,samples[0].jacket);
});
test('semantic garment mapping supports future compatible models without tinting other slots',()=>{
 const garments={jacket:'Future coat',trousers:'Future pants'},writes=[];
 for(const name of ['Future coat','Future pants','Skin','Boots','Vest','WeaponSteel']){
  const material={name,color:{setRGB(...rgb){writes.push({name,rgb});}}};
  assert.equal(applyHollowPalette(material,samples[0],garments),['Future coat','Future pants'].includes(name));
 }
 assert.deepEqual(writes.map(w=>w.rgb),[samples[0].jacket,samples[0].trousers]);
});
test('invalid identity, unapproved pair and ambiguous mapping reject before garment writes',()=>{
 for(const id of [-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>hollowPaletteFor({id}));
 assert.throws(()=>hollowPaletteFor(null));
 const material={name:HOLLOW_GARMENTS.jacket,color:{setRGB(){throw Error('unexpected write');}}};
 assert.throws(()=>applyHollowPalette(material,{}));
 assert.throws(()=>applyHollowPalette(material,samples[0],{jacket:'same',trousers:'same'}),/mapping/);
});
