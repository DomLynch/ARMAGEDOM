// Linear RGB factors, like glTF baseColorFactor; existing vertex grime stays active.
const palette=(id,jacket,trousers)=>Object.freeze({id,jacket:Object.freeze(jacket),trousers:Object.freeze(trousers)});
export const HOLLOW_PALETTES=Object.freeze([
 palette('charcoal',[.025,.03,.035],[.055,.055,.05]),
 palette('brown',[.26,.09,.035],[.18,.10,.055]),
 palette('dark-red',[.36,.045,.025],[.20,.065,.045]),
 palette('olive',[.075,.20,.04],[.085,.12,.045]),
 palette('dirty-ochre',[.42,.27,.045],[.23,.16,.055]),
 palette('muted-purple',[.23,.045,.29],[.14,.065,.17]),
 palette('dusty-blue-grey',[.045,.15,.33],[.065,.105,.18]),
]);
export const HOLLOW_GARMENTS=Object.freeze({jacket:'Torn charcoal canvas jacket',trousers:'Worn tobacco trousers'});
// Warm, cool, then light/dark/olive: each consecutive3-ID window spans families.
// Six cached triplets retain all7 colours across groups without per-frame RNG.
const TRIPLETS=Object.freeze([
 [2,6,4],[1,5,0],[2,6,3],[1,5,4],[2,6,0],[1,5,3],
].map(row=>Object.freeze(row)));
export function hollowPaletteFor(id,seed='westminster-hollow'){
 if(!Number.isSafeInteger(id)||id<0||typeof seed!=='string')throw Error('Hollow palette requires a stable numeric ID and string seed');
 let hash=2166136261;for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
 // Default seed hash%6 is2; offset4 makes IDs1/2/3 rust-red/blue/ochre.
 const n=id-1,slot=((n%3)+3)%3,row=((Math.floor(n/3)+(hash%6+4)%6)%6+6)%6;
 return HOLLOW_PALETTES[TRIPLETS[row][slot]];
}
// Call on EXISTING per-actor material clones once at creation, only for Hollow.
// No clone, texture, geometry, emissive, roughness or shader changes here.
export function applyHollowPalette(material,selected){
 const slot=material.name===HOLLOW_GARMENTS.jacket?'jacket':material.name===HOLLOW_GARMENTS.trousers?'trousers':null;
 if(!slot)return false;
 if(!HOLLOW_PALETTES.includes(selected))throw Error('Unknown Hollow palette');
 material.color.setRGB(...selected[slot]);return true;
}
