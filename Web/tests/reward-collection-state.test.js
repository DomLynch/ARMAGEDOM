import test from 'node:test';
import assert from 'node:assert/strict';
const {createRewardCollectionModel}=await import(process.env.REWARD_COLLECTION_URL??new URL('../src/engine/reward-collection-state.js',import.meta.url).href);
// Minimal meaningful reward contract fixture, not the rifle runtime/codec.
function component({denyClear=false}={}){return{
 freshState:()=>({owned:false,selected:false,ammo:0,position:null}),
 valid:s=>!!s&&Object.keys(s).length===4&&typeof s.owned==='boolean'&&typeof s.selected==='boolean'&&Number.isInteger(s.ammo)&&s.ammo>=0&&s.ammo<=3&&(!s.selected||s.owned)&&(s.position===null||Number.isFinite(s.position.x)),
 copy:s=>({...s,position:s.position&&{...s.position}}),
 transition(s,a){switch(a.type){
  case 'drop':return a.position&&Number.isFinite(a.position.x)?{...s,position:{...a.position}}:null;
  case 'pickup':return s.owned?null:{...s,owned:true,ammo:3,position:null};
  case 'select':return typeof a.selected!=='boolean'||a.selected&&!s.owned||!a.selected&&denyClear?null:{...s,selected:a.selected};
  case 'fire':return s.selected&&s.ammo>0?{...s,ammo:s.ammo-1}:null;
  case 'reload':return s.selected?{...s,ammo:3}:null;
  default:return null;
 }}
};}
const fixture=()=>createRewardCollectionModel({rifle:component(),shotgun:component(),grenades:component()});
test('fixed exact own-key component map, fresh state and nested copies',()=>{
 const models={rifle:component(),shotgun:component()},m=createRewardCollectionModel(models);models.extra=component();const s=m.freshState();assert.deepEqual(Object.keys(s),['rifle','shotgun']);assert.ok(m.valid(s));s.rifle.position={x:2};const copy=m.copy(s);copy.rifle.position.x=3;assert.equal(s.rifle.position.x,2);
 for(const bad of[{},null,[],{rifle:{}},{constructor:component()},Object.defineProperty({},'rifle',{get(){throw Error('getter');},enumerable:true})])assert.throws(()=>createRewardCollectionModel(bad),TypeError);
});
test('selecting owned reward clears former selection through its component and preserves resources',()=>{
 const m=fixture();let s=m.freshState();for(const key of['rifle','shotgun','grenades'])s=m.transition(s,key,{type:'pickup'});s=m.transition(s,'rifle',{type:'select',selected:true});s=m.transition(s,'rifle',{type:'fire'});const before=structuredClone(s),next=m.transition(s,'shotgun',{type:'select',selected:true});
 assert.equal(next.rifle.selected,false);assert.equal(next.shotgun.selected,true);assert.equal(next.rifle.ammo,2);assert.equal(next.shotgun.ammo,3);assert.deepEqual(next.grenades,s.grenades);assert.deepEqual(s,before);assert.ok(m.valid(next));
 const last=m.transition(next,'grenades',{type:'select',selected:true});assert.equal(last.shotgun.selected,false);assert.equal(last.grenades.selected,true);
});
test('drop/pickup/fire/reload delegate only requested component and never mutate inputs/actions',()=>{
 const m=fixture(),fresh=m.freshState(),action={type:'drop',position:{x:2}},drop=m.transition(fresh,'grenades',action);assert.deepEqual(drop.grenades.position,{x:2});drop.grenades.position.x=9;assert.equal(action.position.x,2);assert.equal(fresh.grenades.position,null);
 let s=m.transition(drop,'grenades',{type:'pickup'});s=m.transition(s,'grenades',{type:'select',selected:true});const before=structuredClone(s),fired=m.transition(s,'grenades',{type:'fire'});assert.equal(fired.grenades.ammo,2);assert.deepEqual(s,before);assert.deepEqual(fired.rifle,s.rifle);assert.deepEqual(fired.shotgun,s.shotgun);assert.equal(m.transition(fired,'grenades',{type:'reload'}).grenades.ammo,3);
});
test('unknown field/action, locked selection, invalid component and multiple selected fail closed',()=>{
 const m=fixture(),s=m.freshState();for(const field of['unknown','__proto__','constructor',1])assert.equal(m.transition(s,field,{type:'pickup'}),null);
 for(const a of[null,[],{type:'unknown'},{type:'select',selected:true},{type:'fire'},Object.defineProperty({},'type',{get(){throw Error('getter');},enumerable:true})])assert.equal(m.transition(s,'rifle',a),null);
 for(const bad of[{...s,extra:{}},{...s,rifle:{...s.rifle,ammo:-1}},{...s,rifle:{...s.rifle,owned:true,selected:true},shotgun:{...s.shotgun,owned:true,selected:true}}]){assert.equal(m.valid(bad),false);assert.throws(()=>m.copy(bad),TypeError);assert.equal(m.transition(bad,'rifle',{type:'pickup'}),null);}
});
test('failed secondary deselection keeps original collection, never returns conflicting selection',()=>{
 const m=createRewardCollectionModel({rifle:component({denyClear:true}),shotgun:component()});let s=m.freshState();s=m.transition(s,'rifle',{type:'pickup'});s=m.transition(s,'shotgun',{type:'pickup'});s=m.transition(s,'rifle',{type:'select',selected:true});const before=structuredClone(s);assert.equal(m.transition(s,'shotgun',{type:'select',selected:true}),null);assert.deepEqual(s,before);
});
test('delegated mutating/throwing/invalid transitions cannot change caller state',()=>{
 const base=component(),mutating={...base,transition(s,a){s.ammo=2;s.position={x:99};a.type='changed';throw Error('component rejected');}},m=createRewardCollectionModel({rifle:mutating}),s=m.freshState(),action={type:'pickup'},before=structuredClone(s);assert.equal(m.transition(s,'rifle',action),null);assert.deepEqual(s,before);assert.deepEqual(action,{type:'pickup'});
 const bad=createRewardCollectionModel({rifle:{...base,transition:()=>({selected:true})}});assert.equal(bad.transition(bad.freshState(),'rifle',{type:'pickup'}),null);
});
