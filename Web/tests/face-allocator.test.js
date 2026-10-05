import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateFaceRecipes} from '../src/face-allocator.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
const keys=n=>Array.from({length:n},(_,i)=>`fixture-resident-${String(i).padStart(3,'0')}`);
const library=(n=50)=>({version:'fixture-v1',recipes:Array.from({length:n},(_,i)=>({id:`fixture-recipe-${i}`}))});
test('actual6/9/9 complete rosters use distinct first authored recipes for ordinary/Crooked/corpses',()=>{
 for(const[area,residents]of Object.entries(AREA_MOB_SPAWNS)){const l=library(),m=allocateFaceRecipes(area,residents.map(r=>r.key),l);assert.equal(m.size,residents.length);assert.equal(new Set(m.values()).size,residents.length);assert.deepEqual([...m.values()],l.recipes.slice(0,residents.length).map(r=>r.id));}
});
test('roster order, creation order and frozen inputs cannot change key identities',()=>{
 const l=Object.freeze({version:'fixture-v1',recipes:Object.freeze(library().recipes.map(Object.freeze))}),full=Object.freeze(keys(9)),expected=allocateFaceRecipes('east',full,l);
 assert.deepEqual(allocateFaceRecipes('east',[...full].reverse(),l),expected);assert.deepEqual(full,keys(9));assert.deepEqual(l.recipes.map(r=>r.id),library().recipes.map(r=>r.id));
});
test('refresh/death/return lookups use the same full roster including corpses',()=>{
 const full=['ordinary-1','ordinary-2','crooked-1','corpse-1','ordinary-3','ordinary-4'],l=library(),before=allocateFaceRecipes('westminster',full,l),returned=allocateFaceRecipes('westminster',[...full].reverse(),l);
 assert.equal(before.size,full.length);for(const key of full)assert.equal(returned.get(key),before.get(key));
 const dead=new Set(['ordinary-1','corpse-1']);assert.deepEqual(full.filter(k=>!dead.has(k)).map(k=>returned.get(k)),full.filter(k=>!dead.has(k)).map(k=>before.get(k)));
});
test('area and recipe version affect stable identity priority without hidden cache or random state',()=>{
 const l=library(),full=keys(9),m=allocateFaceRecipes('east',full,l);assert.notDeepEqual(m,allocateFaceRecipes('south',full,l));assert.notDeepEqual(m,allocateFaceRecipes('east',full,{...l,version:'fixture-v2'}));assert.deepEqual(m,allocateFaceRecipes('east',full,l));m.clear();assert.equal(allocateFaceRecipes('east',full,l).size,9);
});
test('authored recipe order is preserved, not replaced by invented contrast metadata',()=>{
 const l=library(),full=keys(9),before=allocateFaceRecipes('east',full,l),after=allocateFaceRecipes('east',full,{...l,recipes:[...l.recipes].reverse()});
 assert.deepEqual([...after.values()].sort(),l.recipes.slice(-9).map(r=>r.id).sort());assert.notDeepEqual(after,before);
});
test('empty/50/51/151 allocations terminate; all unused recipes consumed before bounded reuse',()=>{
 const l=library();assert.equal(allocateFaceRecipes('empty',[],l).size,0);
 for(const n of [50,51,151]){const m=allocateFaceRecipes('east',keys(n),l),counts=l.recipes.map(r=>[...m.values()].filter(v=>v===r.id).length);assert.equal(m.size,n);assert.equal(new Set(m.values()).size,50);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
 const first=allocateFaceRecipes('east',keys(50),l);assert.equal(new Set(first.values()).size,50);
 assert.equal(new Set(allocateFaceRecipes('one',keys(101),library(1)).values()).size,1);
});
test('reject malformed area/keys/version, sparse pools and duplicate/invalid recipe identifiers',()=>{
 const l=library();for(const a of ['',null,2,' '])assert.throws(()=>allocateFaceRecipes(a,[],l));
 for(const k of [null,'key',['x','x'],[''],[null],[1],Array(1)])assert.throws(()=>allocateFaceRecipes('east',k,l));
 for(const bad of [null,{}, {...l,version:''},{...l,version:1},{...l,recipes:[]},{...l,recipes:Array(1)},{...l,recipes:[null]},{...l,recipes:[{}]},{...l,recipes:[{id:1}]},{...l,recipes:[{id:''}]},{...l,recipes:[{id:'x'},{id:'x'}]},{...l,recipes:library(51).recipes}])assert.throws(()=>allocateFaceRecipes('east',[],bad));
 const special=['__proto__','constructor','toString'];assert.equal(allocateFaceRecipes('east',special,l).size,3);
});
test('combined24 roster shares one cross-area map for live, corpse, refresh and area-return lookups',()=>{
 const full=Object.values(AREA_MOB_SPAWNS).flat().map(r=>r.key),l=library(),namespace='london-residents';
 assert.equal(full.length,24);assert.equal(new Set(full).size,24);
 const shared=allocateFaceRecipes(namespace,full,l),snapshot=[...shared];
 assert.equal(shared.size,24);assert.equal(new Set(shared.values()).size,24);assert.deepEqual([...shared.values()],l.recipes.slice(0,24).map(r=>r.id));
 assert.deepEqual(allocateFaceRecipes(namespace,[...full].reverse(),l),shared);
 const dead=new Set(Object.values(AREA_MOB_SPAWNS).map(records=>records[0].key));
 const live=area=>AREA_MOB_SPAWNS[area].filter(r=>!dead.has(r.key)).map(r=>[r.key,shared.get(r.key)]);
 const westBefore=live('westminster'),east=live('east'),south=live('south'),westReturn=live('westminster');
 assert.deepEqual(westReturn,westBefore);assert.ok([...east,...south,...westReturn].every(([key,id])=>id===shared.get(key)));
 const corpseIds=[...dead].map(key=>shared.get(key)),all=[...westReturn,...east,...south].map(([,id])=>id).concat(corpseIds);
 assert.equal(all.length,24);assert.equal(new Set(all).size,24);assert.deepEqual([...shared],snapshot);
});
