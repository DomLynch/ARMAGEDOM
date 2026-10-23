import fs from'node:fs';
import{createGame}from'../../src/combat.js';
import{createRunPersistence}from'../../src/engine/run-core.js';
import{createAreaRegistry}from'../../src/area-registry.js';
import{createGeometry}from'../../src/world-geometry.js';
import{validateAreaMetadata}from'../../src/engine/area-content.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../public/'+p,import.meta.url))),registry=createAreaRegistry({manifest:read('world/manifest.json')});
export function wolfFixture({records=new Map(),areaId='east',cycle='A'}={}){const data=validateAreaMetadata(read('world/area-content.json'),registry),layout=read('world/'+areaId+'/layout.json'),geometry=createGeometry(layout),world={...data,areaId,registry,spawn:geometry.ground(registry.get(areaId).entry),layout,geometry,progressionData:data.progression,expeditionData:data.expedition,residentPlacements:data.residents,lineClear:(a,b)=>geometry.lineClear(a,b),move:(p,d,r)=>geometry.move(p,d,r),travelAt:()=>null};
const fresh=()=>createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true,areaResidents:true,openingGroup:false,residentPlacements:data.residents,animalVariants:true,animalCycle:cycle,rat:true,dog:true,roach:true,drone:true,encounter:{id:'hollow-scavengers',character:{rig:'hollow-scavenger',weapon:'knife',contactRig:'hero',bodyScale:1}}});let g=fresh();const p=createRunPersistence({getRun:()=>g,setRun:v=>g=v,createFreshRun:fresh,storage:{getItem:key=>records.get(key)??null,setItem:(key,raw)=>records.set(key,raw)}});return{world,records,p,get g(){return g},restore:()=>p.restoreSavedRun(g)};}
