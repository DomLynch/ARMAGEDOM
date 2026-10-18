import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// The override is only for the portable Lead handoff. After adoption the default
// resolves the actual checkout's Web directory, including in remote staging.
const root=process.env.SAFEHOUSE_WEB_ROOT
  ?pathToFileURL(process.env.SAFEHOUSE_WEB_ROOT.replace(/\/?$/,'/'))
  :new URL('../',import.meta.url);
const rules=await import(process.env.SAFEHOUSE_RULES_MODULE_URL??new URL('src/engine/safehouse.js',root));
const {createGeometry}=await import(new URL('src/world-geometry.js',root));
const content=JSON.parse(fs.readFileSync(new URL('public/world/area-content.json',root)));
const layout=JSON.parse(fs.readFileSync(new URL('public/world/westminster/layout.json',root)));
const geometry=createGeometry(layout);
const data=rules.validateSafehouseData(content.safehouse,{has:id=>id==='westminster'});
function game(){return{
  world:{areaId:'westminster',safehouseData:data,geometry,lineClear:geometry.lineClear},
  player:{pos:geometry.ground(data.props.find(p=>p.id==='comms').standing),radius:.4,hp:150},
  finished:false,time:10,
};}

test('all three actual hub standing points fit a full player footprint and permit the named interaction',()=>{
  assert.doesNotThrow(()=>rules.validateSafehouseGeometry(data,'westminster',geometry,[]));
  assert.deepEqual(data.props.map(p=>p.id).sort(),['comms','locker','map']);
  const g=game();
  for(const prop of data.props){
    g.player.pos=geometry.ground(prop.standing);
    assert(geometry.clear(g.player.pos,.4),prop.id+' standing point is walkable');
    assert(rules.safehouseProtected(g),prop.id+' full footprint is protected');
    assert(rules.safehouseProp(g,prop.id),prop.id+' can be reached without crossing a solid');
  }
});

test('interaction rejects street, wrong area, absent prop, dead and finished player',()=>{
  const g=game();assert.equal(rules.safehouseProp(g,'missing'),false);
  g.player.pos=geometry.ground({x:.16,y:.75});assert.equal(rules.safehouseProp(g,'comms'),false);
  g.player.pos=geometry.ground(data.props.find(p=>p.id==='comms').standing);
  g.world.areaId='east';assert.equal(rules.safehouseProtected(g),false);assert.equal(rules.safehouseProp(g,'comms'),false);
  g.world.areaId='westminster';g.player.hp=0;assert.equal(rules.safehouseProp(g,'comms'),false);
  g.player.hp=150;g.finished=true;assert.equal(rules.safehouseProp(g,'comms'),false);
});

test('touching the boundary lowers weapons before a full footprint earns protection',()=>{
  const g=game(),a=geometry.ground(data.boundary[0]),b=geometry.ground(data.boundary[1]);
  g.player.pos={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  assert.equal(rules.safehouseTouches(g,g.player.pos,.4),true);
  assert.equal(rules.safehouseProtected(g),false);
  assert.equal(rules.safehouseWeaponBlocked(g),true);
});

test('attacks across or within the protected landing are blocked; an unrelated outside segment remains legal',()=>{
  const g=game(),p=g.player.pos;
  assert(rules.safehouseBlocksSegment(g,{x:p.x-20,z:p.z},{x:p.x+20,z:p.z}));
  assert(rules.safehouseBlocksSegment(g,p,{x:p.x+20,z:p.z}));
  assert(rules.safehouseBlocksSegment(g,p,p));
  assert.equal(rules.safehouseBlocksSegment(g,{x:-100,z:-100},{x:-99,z:-100}),false);
  g.world.areaId='east';
  assert.equal(rules.safehouseBlocksSegment(g,{x:p.x-20,z:p.z},{x:p.x+20,z:p.z}),false);
});

test('entry cancels queued attacks and delayed projectiles without refunding or deleting owned resources',()=>{
  const g=game();Object.assign(g.player,{swing:{moveId:'slash'},buffer:{moveId:'heavy'},guarding:true,parryUntil:11});
  Object.assign(g,{
    activeGrenades:[{id:'paid-grenade'}],activeRockets:[{id:'paid-rocket'}],
    pistol:{collected:true,magazine:3,reserve:4,reloadingUntil:20},
    rifle:{status:'owned',magazine:2,reserve:5},rifleAction:{reloadingUntil:20},
    bossEquipmentAction:{shotgun:{reloadingUntil:20},rocketLauncher:{reloadingUntil:20}},
    bossEquipment:{rocketLauncher:{status:'owned',magazine:0,reserve:3}},
    flameFuel:{collected:true,fuelUnits:42.25},
    flame:{equipped:true,active:true,wantFire:true,elapsed:2,pendingReturn:true},
    locker:{version:1,weapons:['bridge-warden-rifle-v1'],ammo:{'rifle-reserve':3}},
  });
  const before=structuredClone({pistol:g.pistol,rifle:g.rifle,bossEquipment:g.bossEquipment,flameFuel:g.flameFuel,locker:g.locker});
  rules.cancelSafehouseActions(g);
  assert.equal(g.player.swing,null);assert.equal(g.player.buffer,null);assert.equal(g.player.guarding,false);assert.equal(g.player.parryUntil,0);
  assert.deepEqual(g.activeGrenades,[]);assert.deepEqual(g.activeRockets,[]);
  assert.equal(g.pistol.reloadingUntil,0);assert.equal(g.rifleAction.reloadingUntil,0);
  assert(Object.values(g.bossEquipmentAction).every(clock=>clock.reloadingUntil===0));
  assert.equal(g.flame.active,false);assert.equal(g.flame.wantFire,false);
  assert.deepEqual(g.pistol,{...before.pistol,reloadingUntil:0});
  for(const key of ['rifle','bossEquipment','flameFuel','locker'])assert.deepEqual(g[key],before[key],key+' retained');
});

test('protected movement remains available while combat intent is removed; outside intent remains unchanged',()=>{
  const g=game(),intent={move:{x:1,z:.5},actions:['fire','slash'],held:['fire'],fire:true,guard:true,guardPressed:true};
  const before=structuredClone(intent),safe=rules.prepareSafehouseStep(g,intent);
  assert.deepEqual(intent,before);assert.deepEqual(safe.move,intent.move);
  assert.deepEqual(safe.actions,[]);assert.deepEqual(safe.held,[]);
  assert.equal(safe.fire,false);assert.equal(safe.guard,false);assert.equal(safe.guardPressed,false);
  assert.equal(g.safehouseProtected,true);assert.equal(g.weaponsLowered,true);
  g.player.pos=geometry.ground({x:.16,y:.75});
  assert.equal(rules.prepareSafehouseStep(g,intent),intent);
  assert.equal(g.safehouseProtected,false);assert.equal(g.weaponsLowered,false);
});

test('invalid standing points and an actual resident placed in the hub reject content adoption',()=>{
  const bad=structuredClone(data);bad.props[0].standing={x:.16,y:.75};
  assert.throws(()=>rules.validateSafehouseGeometry(bad,'westminster',geometry,[]),/usable landing/);
  const g=game();assert.throws(()=>rules.validateSafehouseGeometry(data,'westminster',geometry,[{pos:g.player.pos}]),/resident spawn/);
});

test('region cache follows replacement world geometry rather than retaining a previous projection',()=>{
  const g=game();assert(rules.safehouseProtected(g));
  const translated={...geometry,ground:p=>{const q=geometry.ground(p);return{x:q.x+100,z:q.z};}};
  g.world.geometry=translated;assert.equal(rules.safehouseProtected(g),false);
  g.player.pos=translated.ground(data.props.find(p=>p.id==='comms').standing);
  assert(rules.safehouseProtected(g));
});
