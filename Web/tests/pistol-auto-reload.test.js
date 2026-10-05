import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createGame,stepGame,resetMobileControls} from '../src/combat.js';import {stepPistol} from '../src/pistol.js';
import {encodeRun,restoreRun,applySavedRun,collectNearbySupplies} from '../src/pistol-save.js';import {issueSupply} from '../src/supplies.js';
const game=()=>{const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},move:(p,d)=>({x:p.x+d.x,z:p.z+d.z}),lineClear:()=>true};const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true});for(const e of g.enemies)e.staggerUntil=1000;stepGame(g,{actions:['pickup']});return g;};
const advance=(g,n=1)=>{for(let i=0;i<n;i++)stepGame(g);};
test('actual fixed-tick integration last shot then released Fire automatically reloads and requires fresh fire',()=>{
 const g=game();g.pistol.magazine=1;stepGame(g,{actions:['fire'],aim:{x:1,z:0}});assert.equal(g.pistol.magazine,0);const time=g.time;
 advance(g,71);assert.equal(g.pistol.reloadingUntil,0);advance(g);assert.ok(g.events.some(e=>e.type==='reload-start'));assert.ok(Math.abs(g.time-time-1.2)<1e-8);const until=g.pistol.reloadingUntil;
 advance(g,77);assert.equal(g.pistol.magazine,0);advance(g);assert.equal(g.pistol.magazine,6);assert.equal(g.pistol.reserve,6);assert.ok(Math.abs(g.time-until)<1e-8);assert.ok(!g.events.some(e=>e.type==='shot'));
 stepGame(g,{actions:['fire'],aim:{x:1,z:0}});assert.equal(g.pistol.magazine,5);assert.equal(g.events.filter(e=>e.type==='shot').length,1);
});
test('saved empty magazine restores atomically and starts fresh auto reload with unchanged DTO',()=>{
 const g=game();g.pistol.magazine=0;g.pistol.reserve=4;g.pistol.reloadingUntil=90;const raw=encodeRun(g),next=game();applySavedRun(next,restoreRun(next,raw));assert.equal(next.pistol.reloadingUntil,0);assert.equal(next.pistol.nextFireAt,0);
 assert.equal(encodeRun(next),raw);advance(next);assert.ok(next.events.some(e=>e.type==='reload-start'));advance(next,78);assert.equal(next.pistol.magazine,4);assert.equal(next.pistol.reserve,0);assert.equal(JSON.parse(encodeRun(next)).version,2);
});
test('real finite supply collection while empty enables reload only after durable award',()=>{
 const g=game();g.pistol.magazine=g.pistol.reserve=0;g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:'westminster-roamer-1',position:g.player.pos,hp:0}).state;
 collectNearbySupplies(g,()=>false);advance(g);assert.equal(g.pistol.reloadingUntil,0);assert.equal(g.pistol.reserve,0);
 collectNearbySupplies(g,proposed=>{assert.equal(proposed.pistol.magazine,0);assert.equal(proposed.pistol.reserve,3);return true;});advance(g);assert.ok(g.events.some(e=>e.type==='reload-start'));advance(g,78);assert.equal(g.pistol.magazine,3);assert.equal(g.pistol.reserve,0);assert.equal(g.supplies.pending.length,0);
});
test('actual main cancellation callback clears reload before completion and paused ticks cannot mutate ammo',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),fn=source.slice(source.indexOf('function cancelPistol(g)'),source.indexOf('function cancelPistol(g)')+source.slice(source.indexOf('function cancelPistol(g)')).indexOf('\n'));
 let actorResets=0;const cancel=new Function('stepPistol','resetMobileControls','effects','actors',`${fn};return cancelPistol;`)(stepPistol,resetMobileControls,{clearPistolFeedback(){},update(){}},{resetFeedback(){actorResets++;}});
 const g=game();g.pistol.magazine=0;advance(g);const time=g.time;cancel(g);assert.equal(actorResets,1);assert.equal(g.pistol.reloadingUntil,0);stepGame(g,{paused:true});assert.equal(g.time,time);assert.equal(g.pistol.magazine,0);assert.equal(g.pistol.reserve,12);
 advance(g);assert.ok(g.pistol.reloadingUntil>g.time);stepGame(g,{actions:['heavy']});assert.equal(g.pistol.equipped,false);assert.equal(g.pistol.reloadingUntil,0);advance(g,100);assert.equal(g.pistol.magazine,0);assert.equal(g.pistol.reserve,12);
 const fresh=game();assert.equal(fresh.pistol.magazine,6);assert.equal(fresh.pistol.reserve,12);assert.equal(fresh.pistol.reloadingUntil,0);
});
