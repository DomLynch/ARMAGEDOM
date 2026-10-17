import {closed,freeze} from './content-schema.js';
import {FLAME_PILOT_PROFILE} from './flame-fuel-state.js';
export const FLAME_VISUAL_DATA=freeze({emitterCount:24,reducedCount:6,burnSlots:6,burnPerVictim:2,burnSeconds:.35,textureSize:32,emitterWidth:[.26,.5],burnWidth:[.5,.7],burnAspect:1.65,palette:[0xfff6ce,0xffb843,0xf15a10]});
export const FLAME_MODEL_REF='player-flamethrower';
export function validateFlameData(input,registry){
 if(input===undefined)return null;
 closed(input,['version','pickupId','areaId','position','modelRef']);closed(input.position,['x','z']);
 if(input.version!==1||input.pickupId!==FLAME_PILOT_PROFILE.pickupId||input.areaId!==FLAME_PILOT_PROFILE.areaId||input.modelRef!==FLAME_MODEL_REF||registry.get(input.areaId)?.visibility!=='public'||!Object.values(input.position).every(n=>Number.isFinite(n)&&Math.abs(n)<=200))throw Error('Invalid registered flamethrower');
 return freeze({...FLAME_PILOT_PROFILE,...structuredClone(input),pickupRadius:1.3});
}
export function validateFlameGeometry(data,registry,areaId,geometry){
 if(!data||data.areaId!==areaId)return;
 const p=data.position,point=geometry.point(p);
 if(!geometry.clear(p,data.pickupRadius)||!geometry.lineClear(geometry.ground(registry.get(areaId).entry),p)||registry.links(areaId).some(link=>Object.entries(link.condition).every(([key,value])=>key==='xMin'?point.x>value:key==='xMax'?point.x<value:key==='yMin'?point.y>value:point.y<value)))throw Error('Blocked flamethrower pickup');
}
