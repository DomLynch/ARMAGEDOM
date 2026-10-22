import test from'node:test';import assert from'node:assert/strict';import{salamanderFixture}from'./helpers/salamander-fixture.js';import{stepGame}from'../src/combat.js';import{safehouseProtected}from'../src/engine/safehouse.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
test('own Salamander wakes nearby then rounds the Westminster bridge beyond both former leashes and returns',()=>{
 const{g}=salamanderFixture(),e=g.enemies.find(e=>e.rig==='giant-salamander');g.enemies=[e];g.player.pos={x:e.home.x,z:e.home.z-3.45};stepGame(g);assert(e.alerted&&!e.returning);assert.equal(e.moveSpeed,1.8);
 const goals=[g.world.geometry.ground({x:.97,y:.34}),g.world.geometry.ground({x:.603125,y:.6875})],markers=[];
 for(const goal of goals){assert(g.world.geometry.clear(goal,g.player.radius));g.player.pos={...goal};let reached=false;for(let i=0;i<2400;i++){stepGame(g);assert(e.alerted&&!e.returning);assert(g.world.geometry.clear(e.pos,e.radius));if(distance(e.pos,goal)<=7.96&&g.world.lineClear(e.pos,goal)){reached=true;break;}}markers.push({goal,end:{...e.pos},reached,time:g.time});assert(reached,JSON.stringify(markers));}
 console.log('SALAMANDER208_BRIDGE_PURSUIT',JSON.stringify({radius:e.radius,home:e.home,markers}));
});
test('engaged Salamander holds outside the real safehouse without healing or attacking',()=>{
 const{g}=salamanderFixture(),e=g.enemies.find(e=>e.rig==='giant-salamander');g.enemies=[e];e.alerted=true;e.hp=91;const position={...e.pos};g.player.pos=g.world.geometry.ground(g.world.safehouseData.props.find(p=>p.id==='comms').standing);assert(safehouseProtected(g));const hp=g.player.hp;for(let i=0;i<120;i++)stepGame(g);assert.deepEqual(e.pos,position);assert(e.alerted&&!e.returning);assert(!e.swing);assert.equal(e.hp,91);assert.equal(g.player.hp,hp);
});
