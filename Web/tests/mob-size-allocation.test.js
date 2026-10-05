import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateMobSizes} from '../src/mob-size-allocation.js';
import {AREA_MOB_SPAWNS} from '../src/area-mob-spawns.js';
const factors=[.85,.9,1,1.1,1.15],keys=n=>Array.from({length:n},(_,i)=>`resident-${String(i).padStart(3,'0')}`);
test('registered6/9/9 rosters are balanced and use every factor before repetition',()=>{
 for(const[area,records]of Object.entries(AREA_MOB_SPAWNS)){
  const map=allocateMobSizes(area,records.map(r=>r.key)),values=[...map.values()],counts=factors.map(f=>values.filter(v=>v===f).length);
  assert.equal(map.size,records.length);assert.ok(values.every(f=>factors.includes(f)));assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
  for(let i=0;i+5<=values.length;i+=5)assert.equal(new Set(values.slice(i,i+5)).size,5);
 }
});
test('input permutations and frozen arrays preserve stable key assignments',()=>{
 const full=Object.freeze(keys(9)),pool=Object.freeze([...factors]);
 const expected=allocateMobSizes('east',full,pool);assert.deepEqual(allocateMobSizes('east',[...full].reverse(),[...pool].reverse()),expected);assert.deepEqual(full,keys(9));assert.deepEqual(pool,factors);
 assert.deepEqual([...expected.keys()],keys(9));
});
test('dead/ordinary/Crooked keys share full-roster assignments across refresh and return',()=>{
 const full=['ordinary-1','crooked-1','corpse-1','ordinary-2','ordinary-3','ordinary-4','ordinary-5','ordinary-6','ordinary-7'],before=allocateMobSizes('westminster',full),dead=new Set(['corpse-1','ordinary-1']);
 assert.equal(before.size,full.length);const refresh=allocateMobSizes('westminster',[...full].reverse());assert.deepEqual(refresh,before);
 for(const key of full.filter(k=>!dead.has(k)))assert.equal(refresh.get(key),before.get(key));assert.equal(refresh.get('corpse-1'),before.get('corpse-1'));
});
test('area identity affects assignment without random state, actor IDs or persistent cache',()=>{
 const full=keys(9),a=allocateMobSizes('east',full),b=allocateMobSizes('south',full);assert.notDeepEqual(a,b);assert.deepEqual(a,allocateMobSizes('east',full));a.clear();assert.equal(allocateMobSizes('east',full).size,9);
});
test('empty, one-factor, custom pools and larger rosters terminate with balanced bounded reuse',()=>{
 assert.equal(allocateMobSizes('empty',[]).size,0);assert.deepEqual([...allocateMobSizes('single',keys(6),[1]).values()],Array(6).fill(1));
 for(const n of [1,5,6,9,51,101]){const values=[...allocateMobSizes('custom',keys(n),[.85,1,1.15]).values()],counts=[.85,1,1.15].map(f=>values.filter(v=>v===f).length);assert.equal(values.length,n);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
});
test('reject malformed area/keys and duplicate, sparse, nonfinite or out-of-range factors',()=>{
 for(const area of ['',null,1,'   '])assert.throws(()=>allocateMobSizes(area,keys(1)));
 for(const full of [null,'key',['a','a'],[''],[' '],[null],[1],Array(1)])assert.throws(()=>allocateMobSizes('east',full));
 for(const pool of [null,[],{},[.85,.85],[0],[-1],[.84],[1.16],[Infinity],[NaN],['1'],Array(1)])assert.throws(()=>allocateMobSizes('east',[],pool));
});
