import{MELEE_VARIANTS,CLEAVER_MOVES}from'./engine/melee-equipment-data.js';
export{MELEE_VARIANTS,CLEAVER_MOVES}from'./engine/melee-equipment-data.js';
export function selectedMeleeVariant(g){const data=g.world?.uniqueRewardData,state=g.uniqueReward;return data&&state?.status==='owned'&&state.rewardReceipt===data.receiptId&&state.selectedMeleeVariant===data.itemId?MELEE_VARIANTS[data.itemId]:MELEE_VARIANTS.knife;}
// Derived presentation/contact fields; the validated unique DTO remains equipment authority.
export function syncMeleeEquipment(g){const profile=selectedMeleeVariant(g),p=g.player;p.meleeVariantId=profile.itemId;p.meleeMoves=profile.itemId==='knife'?null:profile.moves;p.contactPaths=profile.contactPaths;p.contactScale=p.combatScale;p.meleeClipOverrides=profile.clipOverrides;p.meleeTargeting=profile.targeting??null;p.meleeLowMoves=profile.lowMoves??null;g.staminaCosts=profile.costs;return profile;}
export function meleeModelRef(g){return selectedMeleeVariant(g).modelRef??null;}
// Clone only the rigid weapon subtree; the live player rig, mixer and body buffers stay owners.
export function cloneMeleeWeapon(source,variantId){
 const profile=MELEE_VARIANTS[variantId],weapon=source?.equipment?.scene?.getObjectByName('WeaponDrawn');
 if(!profile?.modelRef||!weapon||weapon.userData.contact?.from!==profile.contact[0]||weapon.userData.contact?.to!==profile.contact[1])throw Error('Melee equipment source/contact mismatch');
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
