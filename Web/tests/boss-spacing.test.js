import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{createAreaRegistry}from'../src/area-registry.js';import{validateAreaMetadata}from'../src/engine/area-content.js';import{createGame,stepGame}from'../src/combat.js';import{createHollowEncounter}from'../src/hollow-encounter.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),raw=()=>read('../public/world/area-content.json'),registry=createAreaRegistry();
// Spacing is tested in an open controlled arena. Public placement geometry has
// its own validation; placing the player behind its current wall would never wake the boss.
function setup(distance=.88,{minimum=true,move=null,travel=null,homeLeash=null}={}){
 const input=raw();if(!minimum)delete input.bosses.profiles.warden.minimumAttackDistance;if(homeLeash!==null)input.bosses.profiles.warden.homeLeash=homeLeash;
 const c=validateAreaMetadata(input,registry),row=c.bossData.placements.find(p=>p.profileRef==='warden'),geometry={lineClear:()=>true,move:(p,d)=>({x:p.x+d.x,z:p.z+d.z})};
 const w={registry,areaId:'east-bridge',layout:{characterScale:1.265},geometry,bossData:c.bossData,residentPlacements:c.residents,spawn:{x:row.pos.x,z:row.pos.z+distance},lineClear:(a,b)=>geometry.lineClear(a,b),move:move??((p,d,r)=>geometry.move(p,d,r)),travelAt:travel??(()=>null)};
 const g=createGame(w,{pilot:'donor-knife',areaResidents:true,openingGroup:false,residentPlacements:c.residents,encounter:createHollowEncounter({rig:'hollow-scavenger',contactRig:'hero',weapon:'knife',bodyScale:1})});g.enemies=g.enemies.filter(e=>e.bossProfile);g.enemies[0].facing={x:0,z:1};return{g,e:g.enemies[0],c};
}
const gap=({g,e})=>Math.hypot(g.player.pos.x-e.pos.x,g.player.pos.z-e.pos.z),step=s=>{stepGame(s.g,{},1/60);(s.events??=[]).push(...s.g.events);};
test('ordinary stationary close player makes real Warden back away, cross hysteresis, then land real native active damage',()=>{
 const s=setup(),start={...s.e.pos},minimum=1.2*s.e.combatScale;step(s);assert.equal(s.e.swing,null);assert(gap(s)>.88);assert(s.e.pos.z<start.z);assert(s.e.attackSpacing);
 while(!s.e.swing&&s.g.time<3)step(s);assert(s.e.swing);assert(gap(s)>=minimum+.1*s.e.combatScale);assert(gap(s)<1.8*s.e.combatScale);const hitAt=s.e.swing.hitAt;
 while(s.e.swing.ageTicks<s.e.swing.def.windupTicks-1) {step(s);assert.equal(s.g.player.hp,150);}
 for(let n=0;n<16;n++)step(s);assert.equal(s.g.player.hp,134);assert(s.events.some(e=>e.type==='hit'&&e.attackerId===s.e.id));
});
test('outer valid distance starts the same attack immediately without spacing movement',()=>{const s=setup(2.2),pos={...s.e.pos};step(s);assert(s.e.swing);assert.deepEqual(s.e.pos,pos);assert.notEqual(s.e.attackSpacing,true);});
test('spacing hysteresis retains retreat between the two thresholds instead of oscillating',()=>{const s=setup(1.56);s.e.attackSpacing=true;const before=gap(s);step(s);assert.equal(s.e.swing,null);assert(s.e.attackSpacing);assert(gap(s)>before);});
for(const [name,options]of[['blocked backstep',{move:p=>({...p})}],['exit crossing',{travel:()=>({areaId:'area8'})}],['occupied backstep',{move:(p,d)=>({x:p.x+d.x,z:p.z+d.z})}]])test(name+' safely holds without swing or jitter',()=>{const s=setup(.88,options),start={...s.e.pos};if(name==='occupied backstep')s.g.enemies.push({...s.e,id:999,hp:40,pos:{x:start.x,z:start.z-.6},radius:.4,bossProfile:null,home:null,recoverUntil:10});for(let n=0;n<15;n++)step(s);assert.deepEqual(s.e.pos,start);assert.equal(s.e.swing,null);assert.equal(s.g.player.hp,150);});
test('spacing cannot move past the existing home leash',()=>{const s=setup(.88),start={...s.e.pos};s.e.home={x:start.x,z:start.z+4.5};s.e.alerted=true;for(let n=0;n<10;n++)step(s);assert.deepEqual(s.e.pos,start);assert.equal(s.e.swing,null);});
test('active windup/active/recovery remains committed when player closes inside minimum',()=>{const s=setup(2.2);step(s);const swing=s.e.swing;assert(swing);s.g.player.pos={x:s.e.pos.x,z:s.e.pos.z+.88};for(let n=0;n<100;n++){step(s);assert.equal(s.e.swing,swing);assert.notEqual(s.e.attackSpacing,true);}assert.equal(s.e.pattern,1);});
test('non-opted-in profile keeps its previous close attack and has no spacing state',()=>{const s=setup(.88,{minimum:false}),pos={...s.e.pos};step(s);assert(s.e.swing);assert.deepEqual(s.e.pos,pos);assert.equal(s.e.attackSpacing,undefined);});
test('optional spacing data rejects nonfinite, negative, and unreachable minimums; only Warden opts in',()=>{const c=validateAreaMetadata(raw(),registry);assert.equal(c.bossData.profiles.warden.minimumAttackDistance,1.2);for(const id of ['surgeon','butcher'])assert.equal(c.bossData.profiles[id].minimumAttackDistance,undefined);for(const value of [NaN,-1,0,1.75,1.8,4]){const r=raw();r.bosses.profiles.warden.minimumAttackDistance=value;assert.throws(()=>validateAreaMetadata(r,registry));}});
