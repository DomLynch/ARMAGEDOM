import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateClothing} from '../src/clothing-allocator.js';

const keys=n=>Array.from({length:n},(_,i)=>`resident-${String(i).padStart(3,'0')}`);
function library(n=50){
 const tops=Array.from({length:n},(_,i)=>({id:`top-${i}`,family:'worn',linear:[.02+(i%10)*.065,.03+Math.floor(i/10)*.07,.02+(i%7)*.045]}));
 const trousers=Array.from({length:50},(_,i)=>({id:`pant-${i}`,family:'earth',linear:[.02+i*.009,.015+i*.007,.01+i*.005]}));
 const pairings=Object.fromEntries(tops.map((t,i)=>[t.id,[`pant-${i}`,`pant-${(i+7)%50}`]]));
 return {version:'test-1',tops,trousers,pairings};
}
const outfits=m=>[...m.values()].map(x=>`${x.topId}/${x.trouserId}`);

test('full ordinary/Crooked/corpse roster gives unique tops and outfits for current areas and all50',()=>{
 for(const [area,n]of [['westminster',6],['east',9],['south',9],['capacity',50]]){
  const full=keys(n),m=allocateClothing(area,full,library());
  assert.equal(m.size,n);assert.equal(new Set([...m.values()].map(x=>x.topId)).size,n);assert.equal(new Set(outfits(m)).size,n);
  for(const [key,outfit]of m){assert.ok(full.includes(key));assert.ok(library().pairings[outfit.topId].includes(outfit.trouserId));assert.ok(Object.isFrozen(outfit));}
 }
});
test('resident, library and allowed-pair ordering cannot reshuffle identities or mutate inputs',()=>{
 const l=library(),full=keys(9),before=JSON.stringify(l),expected=allocateClothing('east',full,l);
 const reordered={...l,tops:[...l.tops].reverse(),trousers:[...l.trousers].reverse(),pairings:Object.fromEntries(Object.entries(l.pairings).reverse().map(([k,v])=>[k,[...v].reverse()]))};
 assert.deepEqual(allocateClothing('east',[...full].reverse(),reordered),expected);assert.equal(JSON.stringify(l),before);assert.deepEqual(full,keys(9));
});
test('death/return/refresh lookups use the full registered roster before the live filter',()=>{
 const full=['ordinary-1','ordinary-2','crooked-1','corpse-1','ordinary-3','ordinary-4'],l=library();
 const before=allocateClothing('south',full,l),dead=new Set(['ordinary-1','corpse-1']);
 const refreshed=allocateClothing('south',[...full].reverse(),l);
 for(const key of full){assert.deepEqual(refreshed.get(key),before.get(key));}
 const live=full.filter(key=>!dead.has(key));assert.deepEqual(live.map(key=>refreshed.get(key)),live.map(key=>before.get(key)));
 // Deliberately allocating only survivors loses the stable sorted rank: caller must not do this.
 assert.notDeepEqual(allocateClothing('south',live,l).get('ordinary-2'),before.get('ordinary-2'));
});
test('farthest-first picks greatest minimum perceptual distance among UNUSED grey tops',()=>{
 const values=[0,.001,.008,.125,1],l=library(5);l.tops=values.map((v,i)=>({id:`top-${i}`,family:'ash',linear:[v,v,v]}));
 const chosen=[...allocateClothing('grey',keys(5),l).values()].map(o=>Number(o.topId.slice(4))),used=[];assert.equal(chosen.length,5);
 for(const pick of chosen){if(used.length){const gap=i=>Math.min(...used.map(j=>Math.abs(Math.cbrt(values[i])-Math.cbrt(values[j]))));const best=Math.max(...values.map((_,i)=>used.includes(i)?-1:gap(i)));assert.ok(gap(pick)>=best-1e-7);}used.push(pick);}
});
test('51+ uses bounded deterministic top reuse and approved alternate pants, not uniqueness fiction',()=>{
 const l=library();for(const n of [51,101,151]){const m=allocateClothing('east',keys(n),l);assert.equal(m.size,n);assert.equal(new Set([...m.values()].slice(0,50).map(o=>o.topId)).size,50);}
 const m=allocateClothing('east',keys(151),l),all=[...m.values()];
 assert.equal(m.size,151);assert.equal(new Set(all.slice(0,50).map(o=>o.topId)).size,50);
 for(let i=50;i<all.length;i++){assert.equal(all[i].topId,all[i%50].topId);assert.ok(l.pairings[all[i].topId].includes(all[i].trouserId));}
 assert.notEqual(all[50].trouserId,all[0].trouserId);assert.deepEqual(all[100],all[0]);assert.deepEqual(m,allocateClothing('east',keys(151).reverse(),l));
});
test('empty roster and one-colour library terminate; only listed coordinated pairs are possible',()=>{
 assert.equal(allocateClothing('empty',[],library()).size,0);
 const l=library(1);l.trousers=l.trousers.slice(0,1);l.pairings={'top-0':['pant-0']};
 assert.equal(new Set(outfits(allocateClothing('one',keys(101),l))).size,1);
});
test('area/version affect deterministic priority without hidden cache or input dependence',()=>{
 const l=library(),full=keys(9),m=allocateClothing('east',full,l);
 assert.deepEqual(m,allocateClothing('east',full,l));assert.notDeepEqual(m,allocateClothing('south',full,l));assert.notDeepEqual(m,allocateClothing('east',full,{...l,version:'test-2'}));
 m.clear();assert.equal(allocateClothing('east',full,l).size,9);
});
test('reject bad area/keys/version, duplicate colour IDs, invalid RGB and broken pairing libraries',()=>{
 const l=library();for(const area of ['',null,12])assert.throws(()=>allocateClothing(area,[],l));
 for(const full of [null,'key',['a','a'],[''],[null],[1]])assert.throws(()=>allocateClothing('east',full,l));
 for(const change of [{version:''},{version:null},{tops:[]},{trousers:[]},{tops:[l.tops[0],l.tops[0]]},{trousers:[l.trousers[0],l.trousers[0]]},{tops:[{...l.tops[0],linear:[NaN,0,0]}]},{tops:[{...l.tops[0],linear:[0,0]}]},{tops:[{...l.tops[0],linear:[-1,0,0]}]},{tops:[{...l.tops[0],linear:[2,0,0]}]},{tops:[{...l.tops[0],family:''}]},{pairings:{}},{pairings:{...l.pairings,'top-0':[]}},{pairings:{...l.pairings,'top-0':['unknown']}},{pairings:{...l.pairings,'top-0':['pant-0','pant-0']}}])assert.throws(()=>allocateClothing('east',keys(1),{...l,...change}));
 assert.throws(()=>allocateClothing('east',[],null));
});
