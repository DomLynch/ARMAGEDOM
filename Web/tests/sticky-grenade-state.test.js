import test from 'node:test';
import assert from 'node:assert/strict';
const {createStickyAttachmentModel}=await import(process.env.STICKY_GRENADE_URL??new URL('../src/engine/sticky-grenade-state.js',import.meta.url).href);
const model=()=>createStickyAttachmentModel({areaIds:['area7','westminster']});
const active=()=>({id:'grenade:25:1',areaId:'area7',position:{x:5,z:2},detonateAt:11});
const target=()=>({victimId:'area7-resident-1',areaId:'area7',position:{x:4,z:2},yaw:0,hp:100});
const hit=()=>({confirmed:true,victimId:'area7-resident-1',areaId:'area7',position:{x:5,z:2}});
const near=(actual,expected)=>{assert.ok(Math.abs(actual.x-expected.x)<1e-10);assert.ok(Math.abs(actual.z-expected.z)<1e-10);};
test('host-confirmed identity only, never auto-selects a nearby unrelated target',()=>{
 const m=model(),a=active();assert.deepEqual(m.attach(a,hit(),target()),{active:a,attachment:{victimId:'area7-resident-1',areaId:'area7',localOffset:{x:1,z:0}}});
 for(const bad of[{...hit(),confirmed:false},{...hit(),victimId:'other'},{...hit(),areaId:'westminster'}])assert.equal(m.attach(a,bad,target()),null);
 assert.equal(m.attach(a,hit(),{...target(),hp:0}),null);assert.equal(m.attach(a,hit(),null),null);
});
test('moving and rotating target follows the original local offset, id and deadline',()=>{
 const m=model(),sticky=m.attach(active(),hit(),target());
 const moved=m.follow(sticky,{...target(),position:{x:10,z:3},yaw:Math.PI/2},'area7');near(moved.active.position,{x:10,z:2});assert.equal(moved.active.id,sticky.active.id);assert.equal(moved.active.detonateAt,11);assert.deepEqual(moved.attachment,sticky.attachment);
 const initialRotated={...target(),yaw:Math.PI/2},atRotation=m.attach(active(),hit(),initialRotated),same=m.follow(atRotation,initialRotated,'area7');near(same.active.position,hit().position);
 const wrap=m.follow(sticky,{...target(),yaw:2*Math.PI},'area7');near(wrap.active.position,hit().position);
 const negative=m.follow(sticky,{...target(),yaw:-Math.PI*3/2},'area7');near(negative.active.position,{x:4,z:1});
});
test('death/removal/identity replacement detach at last known point and never reattach',()=>{
 const m=model(),sticky=m.attach(active(),hit(),target()),last=m.follow(sticky,{...target(),position:{x:10,z:2}},'area7');
 for(const gone of[null,{...target(),hp:0,position:{x:99,z:99}},{...target(),victimId:'replacement'},{...target(),areaId:'westminster'}]){
  const detached=m.follow(last,gone,'area7');assert.equal(detached.attachment,null);assert.deepEqual(detached.active.position,last.active.position);assert.equal(detached.active.detonateAt,11);
  assert.deepEqual(m.follow(detached,{...target(),position:{x:20,z:20}},'area7'),detached);
 }
});
test('confirmed surface anchors preserve actual hit rather than thrown aim, no target following',()=>{
 const m=model(),surface={...hit(),victimId:null,position:{x:2,z:3}},anchored=m.attach(active(),surface,null);assert.deepEqual(anchored,{active:{...active(),position:{x:2,z:3}},attachment:null});
 assert.deepEqual(m.follow(anchored,target(),'area7'),anchored);assert.equal(m.attach(active(),surface,target()),null);
});
test('travel cancels rather than following or later reviving the old-area active',()=>{
 const m=model(),sticky=m.attach(active(),hit(),target());const canceled=m.follow(sticky,target(),'westminster');assert.deepEqual(canceled,{active:null,attachment:null});assert.equal(m.follow(canceled,target(),'area7'),null);assert.equal(m.follow(sticky,target(),'unknown'),null);
});
test('malformed identities/numbers/hidden fields reject; host must discard null result',()=>{
 const m=model(),sticky=m.attach(active(),hit(),target());
 for(const t of[{...target(),yaw:NaN},{...target(),hp:Infinity},{...target(),hp:-1},{...target(),victimId:''},{...target(),position:{x:Infinity,z:0}},{...target(),areaId:'unknown'},{...target(),extra:1}]){assert.equal(m.attach(active(),hit(),t),null);assert.equal(m.follow(sticky,t,'area7'),null);}
 for(const a of[{...active(),id:'__proto__'},{...active(),detonateAt:NaN},{...active(),detonateAt:0},{...active(),position:{x:0,z:0,extra:1}}])assert.equal(m.attach(a,hit(),target()),null);
 const getter=Object.defineProperty({...target()},'yaw',{get(){throw Error('getter');},enumerable:true});assert.equal(m.follow(sticky,getter,'area7'),null);
 for(const areaIds of[[],['area7','area7'],['__proto__'],null])assert.throws(()=>createStickyAttachmentModel({areaIds}),TypeError);
});
test('deep defensive copies; frozen input active, hit, target and sticky are unchanged',()=>{
 const m=model(),a=active(),h=hit(),t=target();for(const v of[a,h,t]){Object.freeze(v.position);Object.freeze(v);}const before=structuredClone({a,h,t}),sticky=m.attach(a,h,t);Object.freeze(sticky.active.position);Object.freeze(sticky.active);Object.freeze(sticky.attachment.localOffset);Object.freeze(sticky.attachment);Object.freeze(sticky);
 const next=m.follow(sticky,t,'area7');next.active.position.x=55;next.attachment.localOffset.x=55;assert.deepEqual({a,h,t},before);assert.equal(sticky.active.position.x,5);assert.equal(sticky.attachment.localOffset.x,1);assert.equal(next.active.id,a.id);assert.equal(next.active.detonateAt,a.detonateAt);
});
