import fs from 'node:fs';import assert from 'node:assert/strict';
import {fixture} from './rifle-fixture.js';
import {publicAreaRegistry as registry} from '../../src/area-registry.js';
import {validateAreaMetadata} from '../../src/engine/area-content.js';
import {createGeometry} from '../../src/world-geometry.js';
import {stageProgressionDeath} from '../../src/engine/progression-runtime.js';
import {issueSupply} from '../../src/supplies.js';
export const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
export const markedData=validateAreaMetadata(read('../../public/world/area-content.json'),registry);
export const raw17=fs.readFileSync(new URL('../fixtures/marked196-source195-v17.json',import.meta.url),'utf8');
export function make({earned=false,areaId='westminster',records=earned?new Map([['armagedom:central-hub-run:v17',raw17]]):new Map(),restore=true}={}){const f=fixture({areaId,records,extraWorld:{markedData:markedData.markedData,bossEquipmentData:markedData.bossEquipmentData,safehouseData:markedData.safehouseData,reaperData:markedData.reaperData}});if(restore)f.restore();return f;}
export function stageDeath(f,e,weapon='knife',amount=10){const g=f.g;assert(e);e.hp=0;g.supplies=issueSupply(g.supplies,{areaId:g.world.areaId,placementKey:e.placementKey,position:e.pos,hp:0,rules:g.lootRules,cycle:g.animalCycle}).state;stageProgressionDeath(g,e,weapon,amount);g.enemies=g.enemies.filter(x=>x!==e);g.corpses.push(e);return e;}
export function ordinary(f){return f.g.enemies.find(e=>e.hp>0&&!e.bossProfile&&!e.markedHunter);}
export function earn(f,{boss=false}={}){const e=boss?f.g.enemies.find(e=>e.bossProfile&&e.hp>0):ordinary(f);stageDeath(f,e);assert(f.p.persistRun(f.g));return e;}
export function atArea(f,id){const w=f.world;w.areaId=id;w.geometry=createGeometry(read('../../public/world/'+id+'/layout.json'));w.move=(p,d,r)=>w.geometry.move(p,d,r);w.lineClear=(a,b)=>w.geometry.lineClear(a,b);f.g.player.pos=id==='westminster'?{...w.spawn}:w.geometry.ground(w.registry.get(id).entry);}
export function atHub(f){atArea(f,'central-hub');const w=f.world;w.move=(p,d,r)=>w.geometry.move(p,d,r);w.lineClear=(a,b)=>w.geometry.lineClear(a,b);f.g.player.pos=w.geometry.ground({x:.5,y:.46});f.g.enemies=[];f.g.corpses=[];assert(f.p.persistRun(f.g));}
export function collectPistol(f){f.g.player.pos={...f.g.pistol.pickupPos};assert(f.p.dispatchPistol(f.g,{type:'claimPickup',pickupId:'westminster-start-pistol-v1'},true).ok);assert(f.p.dispatchPistol(f.g,{type:'equip',itemId:'westminster-start-pistol-v1',equipped:false},true).ok);}
