import test from'node:test';import assert from'node:assert/strict';import{stepPlayerHealth,PLAYER_HEALTH_RULES}from'../src/engine/player-health.js';import{createGame,stepGame,receiveHit}from'../src/combat.js';import{createRunPersistence}from'../src/engine/run-core.js';import{salamanderFixture}from'./helpers/salamander-fixture.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){const f=salamanderFixture(),g=createGame(f.world,{...f.options,healthRegen:true});g.enemies=[];return{...f,g};}
function ticks(g,n,intent={}){for(let i=0;i<n;i++)stepGame(g,intent);}
test('living player regenerates one current max-health bar per60 active seconds, partial bars proportionately and without overfill',()=>{
 assert.equal(PLAYER_HEALTH_RULES.regenerationSeconds,60);
 for(const[maxHP,start,seconds]of[[150,1,59.6],[150,75,30],[300,75,45]]){const{g}=fixture();Object.assign(g.player,{hp:start,maxHP});ticks(g,seconds*60);assert.equal(g.player.hp,maxHP);ticks(g,120);assert.equal(g.player.hp,maxHP);}
 const{g}=fixture();g.player.hp=50;ticks(g,60);near(g.player.hp,52.5);assert.equal(g.player.maxHP,150);
});
test('real damage remains applied and next active step regenerates normally without an invented combat delay',()=>{const{g}=fixture();assert(receiveHit(g,{amount:10,origin:{x:g.player.pos.x,z:g.player.pos.z+1},block:false,parry:false}));near(g.player.hp,140);ticks(g,1);near(g.player.hp,140+2.5/60);});
test('pause and terminal/dead state cannot heal or revive; featureless legacy fixtures keep original behavior',()=>{
 const{g}=fixture();g.player.hp=50;const time=g.time;ticks(g,600,{paused:true});assert.equal(g.player.hp,50);assert.equal(g.time,time);ticks(g,60);near(g.player.hp,52.5);g.finished=true;ticks(g,60);near(g.player.hp,52.5);g.finished=false;g.player.hp=0;ticks(g,60);assert.equal(g.player.hp,0);
 const old=salamanderFixture().g;old.enemies=[];old.player.hp=50;ticks(old,60);assert.equal(old.player.hp,50);
});
test('ordinary existing persistence retains fractional health and reload adds no offline healing or new save fields',()=>{
 const f=fixture(),records=new Map();let g=f.g;const fresh=()=>{const n=createGame(f.world,{...f.options,healthRegen:true});n.enemies=[];return n;};const persistence=createRunPersistence({getRun:()=>g,setRun:n=>g=n,createFreshRun:fresh,storage:{getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v)}});persistence.restoreSavedRun(g);g.enemies=[];g.player.hp=37.125;ticks(g,13);const hp=g.player.hp;assert(persistence.persistRun(g));const bytes=JSON.stringify([...records]);g=fresh();persistence.restoreSavedRun(g);g.enemies=[];near(g.player.hp,hp);assert.equal(g.healthRegen,true);assert.equal(JSON.stringify([...records]),bytes);ticks(g,60);near(g.player.hp,hp+2.5);assert(!JSON.stringify([...records]).includes('healthRegen'));
});
test('invalid time or health data does not mint health; dead player remains dead',()=>{for(const dt of[NaN,Infinity,-1,0]){const p={hp:50,maxHP:150};stepPlayerHealth(p,dt);assert.equal(p.hp,50);}const dead={hp:0,maxHP:150};stepPlayerHealth(dead,1);assert.equal(dead.hp,0);});

test('regeneration coalesces storage writes while real damage and terminal health persist immediately',()=>{
 const f=fixture(),records=new Map();let g=f.g,writes=0;const persistence=createRunPersistence({getRun:()=>g,setRun:n=>g=n,createFreshRun:()=>createGame(f.world,{...f.options,healthRegen:true}),storage:{getItem:k=>records.get(k)??null,setItem:(k,v)=>{records.set(k,v);writes++;}}});persistence.restoreSavedRun(g);g.enemies=[];g.player.hp=1;assert(persistence.persistRun(g));const startWrites=writes;
 for(let i=0;i<3600;i++){stepGame(g);assert(persistence.persistRun(g));}assert.equal(g.player.hp,150);assert(writes-startWrites<=61,`regen caused ${writes-startWrites} writes`);
 g.player.hp=100;assert(persistence.persistRun(g));for(let i=0;i<48;i++){stepGame(g);persistence.persistRun(g);}const beforeDamage=writes;assert(receiveHit(g,{amount:1,origin:{x:g.player.pos.x,z:g.player.pos.z+1},block:false,parry:false}));assert(g.player.hp>100,'actual damage still above last regen checkpoint');assert(persistence.persistRun(g));assert.equal(writes,beforeDamage+1,'damage must bypass positive-health coalescing');
 g.player.hp=0;g.finished=true;const beforeDeath=writes;assert(persistence.persistRun(g));assert.equal(writes,beforeDeath+1);console.log('HEALTH209_STORAGE',JSON.stringify({activeSeconds:60,regenOnlyWrites:writes-startWrites-3,totalWrites:writes,deathSaved:true,damageSaved:true}));
});

test('corrupt existing save remains rejected and cannot regenerate or overwrite original bytes',()=>{const f=fixture();let g=f.g,writes=0;const raw='{broken';const persistence=createRunPersistence({getRun:()=>g,setRun:n=>g=n,createFreshRun:()=>createGame(f.world,{...f.options,healthRegen:true}),storage:{getItem:()=>raw,setItem:()=>writes++}});persistence.restoreSavedRun(g);assert(g.runSaveInvalid);assert.equal(g.player.hp,0);ticks(g,120);assert.equal(g.player.hp,0);assert.equal(writes,0);});
