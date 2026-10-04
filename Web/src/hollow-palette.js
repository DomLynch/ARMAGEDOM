// Linear RGB factors, like glTF baseColorFactor; existing vertex grime stays active.
const palette=(id,jacket,trousers)=>Object.freeze({id,jacket:Object.freeze(jacket),trousers:Object.freeze(trousers)});
export const HOLLOW_PALETTES=Object.freeze([
 palette('charcoal',[.09,.10,.10],[.13,.125,.11]),
 palette('brown',[.20,.13,.08],[.16,.13,.105]),
 palette('dark-red',[.23,.075,.06],[.14,.105,.09]),
 palette('olive',[.12,.17,.075],[.135,.14,.10]),
 palette('dirty-ochre',[.30,.23,.08],[.18,.15,.10]),
 palette('muted-purple',[.17,.10,.19],[.135,.115,.14]),
 palette('dusty-blue-grey',[.11,.17,.23],[.12,.14,.155]),
]);
export const HOLLOW_GARMENTS=Object.freeze({jacket:'Torn charcoal canvas jacket',trousers:'Worn tobacco trousers'});
// Current Hollow IDs are consecutive at spawn. Multiplication by3 permutes all7.
// No frame RNG: same entity ID/encounter seed always selects the same cached object.
export function hollowPaletteFor(id,seed='westminster-hollow'){
 if(!Number.isSafeInteger(id)||id<0||typeof seed!=='string')throw Error('Hollow palette requires a stable numeric ID and string seed');
 let hash=2166136261;for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
 return HOLLOW_PALETTES[((id%7)*3+hash%7)%7];
}
// Call on EXISTING per-actor material clones once at creation, only for Hollow.
// No clone, texture, geometry, emissive, roughness or shader changes here.
export function applyHollowPalette(material,selected){
 const slot=material.name===HOLLOW_GARMENTS.jacket?'jacket':material.name===HOLLOW_GARMENTS.trousers?'trousers':null;
 if(!slot)return false;
 if(!HOLLOW_PALETTES.includes(selected))throw Error('Unknown Hollow palette');
 material.color.setRGB(...selected[slot]);return true;
}
