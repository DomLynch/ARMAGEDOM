// Optional source preset. Art supplies bodyScale and the matched donor path rig;
// this file does not approve an asset or silently substitute Goblin proportions.
export const HOLLOW_TUNING = Object.freeze({count:3,health:40,moveSpeed:2.1,regen:1,aggression:.6,recovery:.55});
export function createHollowEncounter(character,tuning={}){
 if(character?.rig!=='hollow-scavenger'||character.weapon!=='knife'||!['hero','goblin'].includes(character.contactRig)||!Number.isFinite(character.bodyScale)||character.bodyScale<=0||character.bodyScale>3)
  throw Error('Hollow requires a matched knife character descriptor with source bodyScale/contactRig');
 const values=Object.fromEntries(Object.entries(HOLLOW_TUNING).map(([key,value])=>[key,tuning[key]===undefined?value:tuning[key]]));
 if(!Number.isInteger(values.count)||values.count<3||values.count>5)throw Error('Hollow encounter supports3–5 copies');
 for(const [key,min,max] of [['health',1,120],['moveSpeed',.1,6],['regen',.1,2],['aggression',.1,5],['recovery',0,5]])
  if(!Number.isFinite(values[key])||values[key]<min||values[key]>max)throw Error(`Invalid Hollow ${key}`);
 return Object.freeze({id:'hollow-scavengers',character:Object.freeze({...character}),...values});
}
