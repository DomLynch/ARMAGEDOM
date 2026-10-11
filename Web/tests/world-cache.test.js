import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {LondonWorld} from '../src/world.js';
import {createAreaRegistry} from '../src/area-registry.js';
import {areaDefinitions} from '../src/area-definitions.js';
import {createGame} from '../src/combat.js';
import {travelTo} from '../src/travel.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
const layouts=Object.fromEntries(['westminster','east','south'].map(id=>[id,JSON.parse(readFileSync(new URL(`${id}/layout.json`,base)))]));
function fixture(t,{defer=false,registry=null,size={width:1672,height:941},loadSize=null}={}){
 const requests=[],textures=[],originalFetch=globalThis.fetch;let release;
 globalThis.fetch=async url=>{const id=new URL(url).pathname.split('/').at(-2);requests.push(id);return{ok:true,json:async()=>layouts[id]};};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const texture=(dimensions=size)=>{const tex=new T.Texture({...dimensions});tex.releases=0;tex.addEventListener('dispose',()=>tex.releases++);textures.push(tex);return tex;};
 class Loader{async loadAsync(){const tex=texture(loadSize??size);if(defer)await new Promise(resolve=>{release=resolve;});return tex;}}
 const scene=new T.Scene(),world=new LondonWorld({THREE:{...T,TextureLoader:Loader},scene,camera:new T.PerspectiveCamera(),layout:layouts.westminster,texture:texture(),manifest,registry,baseUrl:'https://example.invalid/'});
 t.after(()=>world.dispose());return{world,scene,requests,textures,release:()=>release()};
}
test('prepared and warm-return worlds retain owned textures, collision and GPU readiness without rebuilding',async t=>{
 const {world,scene,requests,textures}=fixture(t);await world.prepareArea('westminster');world.markAreaReady('westminster');
 const original=world.group,east=await world.prepareArea('east');world.markAreaReady('east');
 await world.loadArea('east');assert.equal(world.group,east.group);assert.equal(world.group.parent,scene);assert.equal(textures[0].releases,0);
 await world.loadArea('westminster');assert.equal(world.group,original);assert.equal(world.isAreaReady('westminster'),true);assert(world.geometry.clear(world.spawn,.4));
 await world.loadArea('east');assert.deepEqual(requests,['east']);assert.equal(textures.length,2);world.dispose();assert.deepEqual(textures.map(x=>x.releases),[1,1]);assert.equal(scene.children.length,0);
});
test('concurrent preparation decodes once and disposal releases a late texture without installing it',async t=>{
 const {world,scene,requests,textures,release}=fixture(t,{defer:true}),a=world.prepareArea('east'),b=world.prepareArea('east');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,1);assert.equal(world.areaId,'westminster');assert.equal(world.group.parent,scene);
 world.dispose();release();const results=await Promise.allSettled([a,b]);assert(results.every(x=>x.status==='rejected'));assert.deepEqual(textures.map(x=>x.releases),[1,1]);assert.equal(scene.children.length,0);
});
test('blocked or unknown entry leaves the active camera, collision and stage intact',async t=>{
 const {world,scene,textures}=fixture(t),group=world.group,geometry=world.geometry,matrix=world.camera.projectionMatrix.clone();
 await assert.rejects(world.loadArea('east',{x:0,y:0}),/blocked/);await assert.rejects(world.prepareArea('fourth'),/Unknown/);
 assert.equal(world.areaId,'westminster');assert.equal(world.group,group);assert.equal(world.geometry,geometry);assert.equal(group.parent,scene);assert.deepEqual(world.camera.projectionMatrix.elements,matrix.elements);assert.equal(textures[0].releases,0);
 await world.prepareArea('south');const stats=world.preparationStats();assert.equal(stats.areas.length,3);assert(stats.estimatedTextureBytes<stats.textureBudgetBytes);
});

function fourthRegistry(){
 const f=JSON.parse(readFileSync(new URL('./fixtures/area-registry-private-fourth.json',import.meta.url))),areas=structuredClone(areaDefinitions),extended=structuredClone(manifest),keys=['id','visibility','layoutRef','backdropRef','audioRef','entry','exits'];
 areas.find(a=>a.id===f.attach.from).exits.push(f.attach.exit);areas.push(Object.fromEntries(keys.map(k=>[k,f.area[k]])));extended.entries[f.area.id]=f.area.entry;
 for(const [from,exit]of [[f.attach.from,f.attach.exit],[f.area.id,f.area.exits[0]]])extended.links.push({from,to:exit.target,condition:exit.condition,entry:exit.entry});
 return createAreaRegistry({areas,manifest:extended,includePrivate:true});
}
test('private fourth content row evicts only least-recent inactive world resources and reloads safely',async t=>{
 const {world,textures,requests}=fixture(t,{registry:fourthRegistry()}),live=world.group;
 const south=await world.prepareArea('south'),east=await world.prepareArea('east');world.markAreaReady('south');
 await world.prepareArea('fixture-westminster-annex');assert.equal(world.group,live);assert.equal(world.areaId,'westminster');assert.equal(south.disposed,true);assert.equal(south.texture.image,null);assert.equal(east.disposed,false);assert.equal(world.isAreaReady('south'),false);assert.equal(world.cachedArea('south'),undefined);assert.equal(textures[0].releases,0);assert.equal(textures[1].releases,1);
 await world.loadArea('south');assert.equal(world.areaId,'south');assert.notEqual(world.group,south.group);assert(world.geometry.clear(world.spawn,.4));assert.equal(requests.filter(id=>id==='south').length,2);assert(world.preparationStats().estimatedTextureBytes<=world.preparationStats().textureBudgetBytes);
 world.dispose();world.dispose();assert(textures.every(tex=>tex.releases===1));
});
test('active and leased areas survive pressure; unsuccessful admission changes no existing resources',async t=>{
 const {world,textures}=fixture(t,{registry:fourthRegistry()});await world.prepareArea('south');await world.prepareArea('east');const a=world.leaseArea('south'),b=world.leaseArea('east'),groups=[...world.areaCache.stages.values()].map(stage=>stage.group);
 await assert.rejects(world.prepareArea('fixture-westminster-annex'),/budget exceeded/);assert.deepEqual([...world.areaCache.stages.values()].map(stage=>stage.group),groups);assert.deepEqual(textures.map(tex=>tex.releases),[0,0,0,1]);assert.equal(textures[3].image,null);
 a();a();await world.prepareArea('fixture-westminster-annex');assert.equal(world.cachedArea('east').disposed,false);assert.equal(world.cachedArea('south'),undefined);b();assert.deepEqual(world.preparationStats().leases,[]);
});
test('oversized single texture is rejected without evicting current world',async t=>{
 const {world,textures}=fixture(t,{loadSize:{width:4096,height:4096}}),group=world.group;
 await assert.rejects(world.prepareArea('east'),/budget exceeded/);assert.equal(world.group,group);assert.equal(world.disposed,false);assert.equal(textures[0].releases,0);assert.equal(textures[1].releases,1);assert.equal(world.preparationStats().evictions,0);
});

test('world eviction preserves authoritative parked mob, corpse, loot and finisher fields on revisit',async t=>{
 const {world}=fixture(t,{registry:fourthRegistry()}),game=createGame(world,{pilot:'donor-knife',finishers:true}),enemy={id:77,hp:8,ready:10,finisherSupport:['head'],finisherHeadUntil:40},corpse={id:78,hp:0,finisherPartsUntil:50},loot={id:'retained-supply'};
 const record=game.areaFights={south:{initialized:true,cleared:false,enemies:[enemy],corpses:[corpse],loot:[loot],bolts:[],wave:1,nextWave:Infinity,nextEnemyAttackAt:10,parkedAt:0}};
 await world.prepareArea('south');await world.prepareArea('east');await world.prepareArea('fixture-westminster-annex');assert.equal(world.cachedArea('south'),undefined);assert.equal(game.areaFights,record);assert.equal(enemy.finisherHeadUntil,40);assert.equal(corpse.finisherPartsUntil,50);assert.deepEqual(enemy.finisherSupport,['head']);
 game.time=20;await travelTo(game,{areaId:'south'});assert.equal(game.enemies[0],enemy);assert.equal(game.corpses[0],corpse);assert.equal(game.loot[0],loot);assert.equal(enemy.finisherHeadUntil,60);assert.equal(corpse.finisherPartsUntil,70);assert.equal(enemy.ready,30);assert.deepEqual(enemy.finisherSupport,['head']);
});
