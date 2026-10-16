import{KNIFE_MOVES,KNIFE_STAMINA_COSTS}from'./donor/knife.js';
import{knifePaths}from'./donor/knife-paths.js';
import cleaverPaths from'./donor/cleaver-paths.json'with{type:'json'};
import{CLEAVER_ITEM_ID,UNIQUE_REWARDS}from'./engine/unique-reward-runtime.js';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const changes={light_right:[14,22],light_left:[14,22],thrust:[12,18],heavy_overhead:[20,34]};
function reach(rows,move){return Math.max(...rows.slice(move.windupTicks,move.windupTicks+move.activeTicks).flatMap(r=>[Math.hypot(r[0],r[2]),Math.hypot(r[3],r[5])]));}
export const CLEAVER_MOVES=freeze(Object.fromEntries(Object.entries(KNIFE_MOVES).map(([id,base])=>[id,changes[id]?{...base,damage:changes[id][0],stamina:changes[id][1],range:base.range+Math.max(0,reach(cleaverPaths.hero[id],base)-reach(knifePaths.hero[id],base))}:base])));
export const MELEE_VARIANTS=freeze({knife:{itemId:'knife',name:'Knife',moves:KNIFE_MOVES,costs:KNIFE_STAMINA_COSTS,contactPaths:null,clipOverrides:null},[CLEAVER_ITEM_ID]:{...UNIQUE_REWARDS[CLEAVER_ITEM_ID],moves:CLEAVER_MOVES,costs:{slash:22,stab:18,heavy:34,special:40,dodge:30},contact:[.14,.86],contactPaths:cleaverPaths.hero,clipOverrides:{RatLowSlash:'CleaverRatLowSlash'}}});
export function selectedMeleeVariant(g){const data=g.world?.uniqueRewardData,state=g.uniqueReward;return data&&state?.status==='owned'&&state.rewardReceipt===data.receiptId&&state.selectedMeleeVariant===data.itemId?MELEE_VARIANTS[data.itemId]:MELEE_VARIANTS.knife;}
// Derived presentation/contact fields; the validated unique DTO remains equipment authority.
export function syncMeleeEquipment(g){const profile=selectedMeleeVariant(g),p=g.player;p.meleeVariantId=profile.itemId;p.meleeMoves=profile.itemId==='knife'?null:profile.moves;p.contactPaths=profile.contactPaths;p.contactScale=p.combatScale;p.meleeClipOverrides=profile.clipOverrides;g.staminaCosts=profile.costs;return profile;}
export function meleeModelRef(g){return selectedMeleeVariant(g).modelRef??null;}
// Clone only the rigid weapon subtree; the live player rig, mixer and body buffers stay owners.
export function cloneMeleeWeapon(source,variantId){
 const profile=MELEE_VARIANTS[variantId],weapon=source?.equipment?.scene?.getObjectByName('WeaponDrawn');
 if(!profile?.modelRef||!weapon||JSON.stringify(weapon.userData.contact)!==JSON.stringify(profile.contact))throw Error('Melee equipment source/contact mismatch');
 const root=weapon.clone(true),materials=[];let meshes=0;
 try{root.traverse(node=>{if(!node.isMesh)return;if(node.isSkinnedMesh)throw Error('Player melee equipment must be rigid on its hand mount');meshes++;node.frustumCulled=false;const own=[node.material].flat().map(source=>{if(!source?.isMeshStandardMaterial)throw Error('Melee PBR material required');const material=source.clone();materials.push({material,color:material.color?.clone(),emissive:material.emissive?.clone(),intensity:material.emissiveIntensity});return material;});node.material=Array.isArray(node.material)?own:own[0];});if(!meshes)throw Error('Empty player melee weapon');return{root,materials};}
 catch(error){for(const m of materials)m.material.dispose();throw error;}
}
export function setPlayerMeleeWeapon(view,source,variantId){
 if(view.meleeVariantId===variantId)return false;
 if(variantId==='knife'&&!view.meleeEquipment){view.meleeVariantId='knife';return false;}
 if(!Object.hasOwn(MELEE_VARIANTS,variantId)||!view.knife?.parent)throw Error('Player melee hand mount unavailable');
 view.meleeEquipment??=new Map([['knife',view.knife]]);view.meleeWeaponParent??=view.knife.parent;
 if(!view.meleeEquipment.has(variantId)){const clone=cloneMeleeWeapon(source,variantId);view.meleeEquipment.set(variantId,clone.root);view.materials.push(...clone.materials);view.flashMaterials.push(...clone.materials);}
 const next=view.meleeEquipment.get(variantId);view.knife.removeFromParent();view.meleeWeaponParent.add(next);view.knife=next;view.meleeVariantId=variantId;return true;
}
