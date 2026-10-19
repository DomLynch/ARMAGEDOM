import {SHOTGUN_PROFILE,GRENADE_PROFILE,MARSHAL_PISTOL_PROFILE,ROCKET_PROFILE} from './weapon-catalog.js';
import {closedData} from './progression-state.js';
export const SURGEON_KNIFE_PROFILE=Object.freeze({itemId:'surgeons-knife-v1',name:'Surgeon’s Knife',family:'blades',weaponKey:'knife',delivery:'melee',modelRef:null,finisherBinding:'knife',rules:Object.freeze({damage:12,stabDamage:16,heavyDamage:16,pickupRadius:1.3}),source:Object.freeze({placementKey:'boss-surgeon-v1',areaId:'lambeth',receiptId:'boss-surgeon-v1:surgeons-knife-v1'})});
export const EMBER_PROJECTOR_PROFILE=Object.freeze({itemId:'ember-flamethrower-v1',name:'Ember Projector',family:'flamethrowers',weaponKey:'knife',delivery:'cone',modelRef:'player-flamethrower',finisherBinding:'flamethrower',rules:Object.freeze({damage:10,interval:.2,range:3,fuelCapacity:1000,unitsPerSecond:10,pickupRadius:1.3}),source:Object.freeze({placementKey:'boss-witch-v1',areaId:'westminster',receiptId:'boss-witch-v1:ember-flamethrower-v1'})});
export const BOSS_EQUIPMENT_PROFILES=Object.freeze({shotgun:SHOTGUN_PROFILE,grenade:GRENADE_PROFILE,surgicalKnife:SURGEON_KNIFE_PROFILE,commanderPistol:MARSHAL_PISTOL_PROFILE,emberProjector:EMBER_PROJECTOR_PROFILE,rocketLauncher:ROCKET_PROFILE});
export function validateBossEquipmentData(input,registry,residents){
 if(input===undefined)return null;
 if(!closedData(input,['version'])||input.version!==1)throw TypeError('Invalid boss equipment selection');
 for(const data of Object.values(BOSS_EQUIPMENT_PROFILES))if(!registry.has(data.source.areaId)||!(residents[data.source.areaId]??[]).some(row=>row.key===data.source.placementKey))throw TypeError('Unknown equipment reward source');
 for(const areaId of registry.ids)for(const link of registry.links(areaId))if(link.requiresDefeat&&!Object.values(BOSS_EQUIPMENT_PROFILES).some(data=>data.source.areaId===areaId&&data.source.placementKey===link.requiresDefeat))throw TypeError('Unknown exit defeat source');
 return BOSS_EQUIPMENT_PROFILES;
}
export function bossEquipmentClock(g,field){const clocks=g.bossEquipmentAction??(g.bossEquipmentAction={});return clocks[field]??(clocks[field]={nextFireAt:0,reloadingUntil:0,firedAt:-1});}

export function selectedFlameProfile(g){const base=g.world.flameData,data=g.world.bossEquipmentData?.emberProjector,state=g.bossEquipment?.emberProjector;return data&&state?.status==='owned'&&state.selected&&state.rewardReceipt===data.source.receiptId?{...base,name:data.name,unitsPerSecond:data.rules.unitsPerSecond,contact:{...base.contact,damage:data.rules.damage}}:base;}
