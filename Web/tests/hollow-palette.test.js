import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {HOLLOW_PALETTES,HOLLOW_GARMENTS,hollowPaletteFor,applyHollowPalette} from '../src/hollow-palette.js';
const bytes=readFileSync(new URL('../public/assets/hollow-scavenger/hollow-scavenger.glb',import.meta.url)),glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
test('pinned Hollow garment slots are separate from skin/photo/boots and retain vertex grime',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'b309eeb508a1c31babbfeaf13275ace3f54990dab380ae719c0d5881416f89fc');
 assert.equal(glb.materials[4].name,HOLLOW_GARMENTS.jacket);assert.equal(glb.materials[5].name,HOLLOW_GARMENTS.trousers);
 const body=glb.meshes[2].primitives;assert.deepEqual(body.map(p=>p.material),[3,4,5,6]);assert.ok(body.every(p=>p.attributes.COLOR_0!==undefined));
 assert.notEqual(glb.materials[3].name,HOLLOW_GARMENTS.jacket);assert.notEqual(glb.materials[6].name,HOLLOW_GARMENTS.trousers);
});
test('seven bounded, distinct, immutable colour pairs',()=>{
 assert.equal(HOLLOW_PALETTES.length,7);assert.equal(new Set(HOLLOW_PALETTES.map(p=>p.id)).size,7);
 assert.equal(new Set(HOLLOW_PALETTES.map(p=>String(p.jacket))).size,7);
 for(const p of HOLLOW_PALETTES){assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.jacket)&&Object.isFrozen(p.trousers));for(const c of [...p.jacket,...p.trousers])assert.ok(c>0&&c<=.42);}
});
test('every three consecutive IDs spans warm/cool/contrast families across Retry and arbitrary start IDs',()=>{
 const family=id=>['dark-red','brown'].includes(id)?'warm':['dusty-blue-grey','muted-purple'].includes(id)?'cool':'contrast';
 for(const seed of ['westminster-hollow','run-a','run-b',''])for(let start=0;start<90;start++){
  const group=Array.from({length:3},(_,i)=>hollowPaletteFor(start+i,seed));assert.equal(new Set(group).size,3);
  assert.deepEqual(new Set(group.map(p=>family(p.id))),new Set(['warm','cool','contrast']));
  for(let i=0;i<3;i++)assert.equal(hollowPaletteFor(start+i,seed),group[i]);
 }
});
test('first and Retry groups avoid old greenish trio and all7 colours remain available',()=>{
 assert.deepEqual([1,2,3].map(id=>hollowPaletteFor(id).id),['dark-red','dusty-blue-grey','dirty-ochre']);
 assert.deepEqual([4,5,6].map(id=>hollowPaletteFor(id).id),['brown','muted-purple','charcoal']);
 for(const seed of ['westminster-hollow','another-run','']){
  assert.equal(new Set(Array.from({length:18},(_,i)=>hollowPaletteFor(i+1,seed))).size,7);
  for(let start=1;start<=18;start+=3)assert.notDeepEqual([0,1,2].map(i=>hollowPaletteFor(start+i,seed).id).sort(),['charcoal','dirty-ochre','olive']);
 }
});
test('warm/cool jackets have stronger channel separation and light/dark choices differ in luminance',()=>{
 const byId=Object.fromEntries(HOLLOW_PALETTES.map(p=>[p.id,p]));
 for(const id of ['dark-red','brown']){const [r,g,b]=byId[id].jacket;assert.ok(r>=g*2&&r>=b*3);}
 for(const id of ['dusty-blue-grey','muted-purple']){const [r,g,b]=byId[id].jacket;assert.ok(b>=g*2&&b>r);}
 const luminance=p=>p.jacket[0]*.2126+p.jacket[1]*.7152+p.jacket[2]*.0722;
 assert.ok(luminance(byId['dirty-ochre'])>luminance(byId.charcoal)*7);
});
test('park/recreate an actor with the same ID/seed retains its palette',()=>{
 const parked=hollowPaletteFor(41,'encounter-one');for(let i=0;i<100;i++)hollowPaletteFor(i,'elsewhere');assert.equal(hollowPaletteFor(41,'encounter-one'),parked);
});
test('only garment colour is written; shared texture/vertex detail/flash fields preserved',()=>{
 for(const name of glb.materials.map(m=>m.name).concat(['WeaponSteel','PhotoHair'])){
  const writes=[],map={},emissive={},material={name,color:{setRGB(...rgb){writes.push(rgb);}},map,vertexColors:true,emissive,emissiveIntensity:.8,roughness:.94};
  const yes=applyHollowPalette(material,HOLLOW_PALETTES[2]);assert.equal(yes,Object.values(HOLLOW_GARMENTS).includes(name));assert.equal(writes.length,yes?1:0);
  if(yes)assert.deepEqual(writes[0],name===HOLLOW_GARMENTS.jacket?HOLLOW_PALETTES[2].jacket:HOLLOW_PALETTES[2].trousers);
  assert.equal(material.map,map);assert.equal(material.emissive,emissive);assert.equal(material.emissiveIntensity,.8);assert.equal(material.vertexColors,true);assert.equal(material.roughness,.94);
 }
});
test('existing material clone identities stay independent',()=>{
 function own(){return {name:HOLLOW_GARMENTS.jacket,color:{rgb:[],setRGB(...rgb){this.rgb=rgb;}}};}
 const a=own(),b=own();applyHollowPalette(a,HOLLOW_PALETTES[0]);applyHollowPalette(b,HOLLOW_PALETTES[4]);assert.notDeepEqual(a.color.rgb,b.color.rgb);assert.deepEqual(a.color.rgb,HOLLOW_PALETTES[0].jacket);
});
test('invalid identity/config rejected before garment writes',()=>{
 for(const id of [-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>hollowPaletteFor(id));assert.throws(()=>hollowPaletteFor(1,{}));
 const material={name:HOLLOW_GARMENTS.jacket,color:{setRGB(){throw Error('unexpected write');}}};assert.throws(()=>applyHollowPalette(material,{}),/Unknown/);
});
