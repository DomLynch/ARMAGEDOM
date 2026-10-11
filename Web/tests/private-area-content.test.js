import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {preparePrivateAreaContent,namespacedRunStorage} from '../src/engine/private-area-content.js';
import {createGame,stepGame} from '../src/combat.js';import {createHollowEncounter} from '../src/hollow-encounter.js';import {travelTo} from '../src/travel.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const fixture=()=>({areas:read('./fixtures/private-fourth/private-registry-rows.json'),manifest:read('./fixtures/private-fourth/private-manifest.json'),residents:read('./fixtures/private-fourth/private-residents.json'),layouts:Object.fromEntries(['westminster','east','south'].map(id=>['layout.'+id,read('../public/world/'+id+'/layout.json')])),namespace:'armagedom:private:fourth-pilot:',textureBudgetBytes:32*1024*1024});
const privateId='fixture-westminster-annex';
test('actual supplied private content validates registry and full-radius residents without public definitions changing',()=>{
 const c=preparePrivateAreaContent(fixture());assert.equal(c.registry.ids.length,4);assert.equal(c.residents[privateId].length,1);assert(Object.isFrozen(c.residents[privateId][0].patrol));
});
test('malformed provided resident rows, incompatible refs, illegal points and unknown exits fail before IO',()=>{
 const cases=[c=>c.residents[privateId][0].extra=true,c=>c.residents[privateId][0].pos.x=NaN,c=>c.residents[privateId][0].foundationRef='unknown',c=>c.residents[privateId][0].recipeRef='dog-pack-chaser',c=>c.residents[privateId].push(structuredClone(c.residents[privateId][0])),c=>c.residents[privateId][0].pos={x:10000,z:10000},c=>c.residents[privateId][0].patrol[1]={x:10000,z:10000},c=>c.residents.westminster=c.residents[privateId],c=>c.areas[0].exits[0].target='unknown',c=>c.namespace='armagedom:area1-run:v1',c=>c.textureBudgetBytes=0];
 for(const mutate of cases){const c=fixture();mutate(c);assert.throws(()=>preparePrivateAreaContent(c));}
});
test('private storage leaves public current and legacy keys byte-exact while retaining its own writes',()=>{
 const values=new Map([['armagedom:area1-run:v1','PUBLIC'],['armagedom:pistol:v1','LEGACY']]);const io=namespacedRunStorage({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},preparePrivateAreaContent(fixture()).namespace);
 assert.equal(io.getItem('armagedom:area1-run:v1'),null);io.setItem('armagedom:area1-run:v1','PRIVATE');assert.equal(io.getItem('armagedom:area1-run:v1'),'PRIVATE');assert.equal(values.get('armagedom:area1-run:v1'),'PUBLIC');assert.equal(values.get('armagedom:pistol:v1'),'LEGACY');
});
test('actual resident initialization uses existing Hollow mechanics and retains one changed actor across area revisits',async()=>{
 const c=preparePrivateAreaContent(fixture()),world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},registry:c.registry,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true,async loadArea(id){this.areaId=id;return{x:0,z:-6};}};
 const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,areaResidents:true,openingGroup:false,residentPlacements:c.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1})});
 await travelTo(g,{areaId:privateId});assert.equal(g.enemies.length,1);const e=g.enemies[0];assert.equal(e.placementKey,c.residents[privateId][0].key);assert.equal(e.rig,'hollow-scavenger');assert.equal(e.hp,40);assert.equal(e.radius,.4);
 const pos={...e.pos};stepGame(g);assert.notDeepEqual(e.pos,pos);await travelTo(g,{areaId:'westminster'});await travelTo(g,{areaId:privateId});assert.equal(g.enemies.length,1);assert.equal(g.enemies[0],e);assert.equal(g.supplies.issued.length,0);
});

test('accepted layout snapshot stays immutable and is the geometry source despite later input edits',()=>{
 const input=fixture(),c=preparePrivateAreaContent(input),accepted=JSON.stringify(c.layouts['layout.westminster']);input.layouts['layout.westminster'].blockers=[];
 assert.equal(JSON.stringify(c.layouts['layout.westminster']),accepted);assert(Object.isFrozen(c.layouts['layout.westminster'].blockers));
});
