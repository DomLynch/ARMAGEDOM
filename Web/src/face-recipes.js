// Authored ingredients only; World allocates these IDs from the full roster.
export const FACE_APPEARANCE_VERSION = 'armagedom-face-v1';
export const ORIGINAL_FACE_ID = 'face-original';
const freeze = o => Object.freeze(o);
export const FACE_HEADS = freeze([
  freeze({id:'narrow',width:.87,height:1.035}),
  freeze({id:'broad',width:1.12,height:.98}),
]);
export const FACE_HAIRS = freeze(['buzz','rough-crop','crest','back-crop','messy']);
export const FACE_SKINS = freeze([
  freeze({id:'light',photo:freeze([1.30,1.22,1.12])}),
  freeze({id:'tan',photo:freeze([1.02,.91,.78])}),
  freeze({id:'olive',photo:freeze([.80,.79,.62])}),
  freeze({id:'brown',photo:freeze([.62,.43,.30])}),
  freeze({id:'deep',photo:freeze([.43,.29,.20])}),
]);
export const FACE_WEATHERING = freeze(['dust','stubble','scar','ash','grime']);
// Alternate head shapes and stride through complexion/hair contrasts. Every
// approved combination appears once; ordering is part of this library version.
export const FACE_RECIPES = freeze(Array.from({length:50},(_,i)=>{
  const side=i%2,head=FACE_HEADS[side],k=Math.floor(i/2),hair=FACE_HAIRS[(k%5*2+side*3)%5],skin=FACE_SKINS[(Math.floor(k/5)*2+k%5+side*3)%5];
  return freeze({id:`face-${head.id}-${hair}-${skin.id}`,headPreset:head.id,hairPreset:hair,skinPreset:skin.id,weatheringPreset:FACE_WEATHERING[(Math.floor(k/5)+k%5+side*2)%5]});
}));
const original=freeze({id:ORIGINAL_FACE_ID,headPreset:'original',hairPreset:'original',skinPreset:'original',weatheringPreset:'original'});
const lookup=new Map([[ORIGINAL_FACE_ID,original],...FACE_RECIPES.map(r=>[r.id,r])]);
export function faceRecipeFor(id){const r=lookup.get(id);if(!r)throw Error('Unknown face recipe: '+id);return r;}
