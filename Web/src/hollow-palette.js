import {AREA_MOB_SPAWNS} from './area-mob-spawns.js';
import {allocateClothing} from './clothing-allocator.js';
import {CLOTHING_PALETTE_VERSION,TOP_COLOURS,TROUSER_COLOURS,PAIRINGS,outfitFor} from './clothing-palettes.js';

export const HOLLOW_GARMENTS=Object.freeze({jacket:'Torn charcoal canvas jacket',trousers:'Worn tobacco trousers'});
const library=Object.freeze({version:CLOTHING_PALETTE_VERSION,tops:TOP_COLOURS,trousers:TROUSER_COLOURS,pairings:PAIRINGS});
const areaOutfits=new Map();
// Fixture-only fallback. Registered residents always use the complete area roster.
const fallback=TOP_COLOURS.map(top=>outfitFor(top.id,PAIRINGS[top.id][0]));
export function hollowPaletteFor(entity,areaId){
 if(!entity||!Number.isSafeInteger(entity.id)||entity.id<0)throw Error('Hollow palette requires a valid entity identity');
 const roster=AREA_MOB_SPAWNS[areaId];
 if(roster&&roster.some(resident=>resident.key===entity.placementKey)){
  if(!areaOutfits.has(areaId)){
   const allocated=allocateClothing(areaId,roster.map(resident=>resident.key),library);
   areaOutfits.set(areaId,new Map([...allocated].map(([key,slot])=>[key,outfitFor(slot.topId,slot.trouserId)])));
  }
  return areaOutfits.get(areaId).get(entity.placementKey);
 }
 return fallback[entity.id%fallback.length];
}
// Apply once to existing private clones. Only semantic garment colour is written.
export function applyHollowPalette(material,selected,garments=HOLLOW_GARMENTS){
 if(!garments||typeof garments.jacket!=='string'||!garments.jacket||typeof garments.trousers!=='string'||!garments.trousers||garments.jacket===garments.trousers)throw Error('Invalid garment material mapping');
 const slot=material.name===garments.jacket?'jacket':material.name===garments.trousers?'trousers':null;
 if(!slot)return false;
 const approved=outfitFor(selected?.topId,selected?.trouserId);
 material.color.setRGB(...approved[slot]);return true;
}
