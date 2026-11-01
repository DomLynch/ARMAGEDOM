import { createBoneSaw } from "./engine/bone-saw-view.js";
import { MELEE_VARIANTS, CLEAVER_MOVES } from "./engine/melee-equipment-data.js";
// Quaternion [x, y, z, w] of an XYZ Euler rotation given in degrees (three's setFromEuler order), so this file needs no renderer import.
function eulerXYZ(degrees) {
  const [c1, c2, c3] = degrees.map((d) => Math.cos((d * Math.PI) / 360)),
    [s1, s2, s3] = degrees.map((d) => Math.sin((d * Math.PI) / 360));
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
export { MELEE_VARIANTS, CLEAVER_MOVES } from "./engine/melee-equipment-data.js";
export function selectedMeleeVariant(g) {
  const special = g.world?.bossEquipmentData?.surgicalKnife,
    reward = g.bossEquipment?.surgicalKnife;
  if (special && reward?.status === "owned" && reward.selected && reward.rewardReceipt === special.source.receiptId)
    return MELEE_VARIANTS[special.itemId];
  const data = g.world?.uniqueRewardData,
    state = g.uniqueReward;
  return data &&
    state?.status === "owned" &&
    state.rewardReceipt === data.receiptId &&
    state.selectedMeleeVariant === data.itemId
    ? MELEE_VARIANTS[data.itemId]
    : MELEE_VARIANTS.knife;
}
// Derived presentation/contact fields; the validated unique DTO remains equipment authority.
export function syncMeleeEquipment(g) {
  const profile = selectedMeleeVariant(g),
    p = g.player;
  p.meleeVariantId = profile.itemId;
  p.meleeMoves = profile.itemId === "knife" ? null : profile.moves;
  p.contactPaths = profile.contactPaths;
  p.contactScale = p.combatScale;
  p.meleeClipOverrides = profile.clipOverrides;
  p.meleeTargeting = profile.targeting ?? null;
  p.meleeLowMoves = profile.lowMoves ?? null;
  g.staminaCosts = profile.costs;
  return profile;
}
// Clone only the rigid weapon subtree; the live player rig, mixer and body buffers stay owners.
export function cloneMeleeWeapon(source, variantId) {
  const profile = MELEE_VARIANTS[variantId],
    weapon = source?.equipment?.scene?.getObjectByName("WeaponDrawn");
  if (
    !profile?.modelRef ||
    !weapon ||
    weapon.userData.contact?.from !== profile.contact[0] ||
    weapon.userData.contact?.to !== profile.contact[1]
  )
    throw Error("Melee equipment source/contact mismatch");
  const root = weapon.clone(true),
    grip = source.description?.knifeGripDegrees, // the body's hand bone is oriented differently from the hero's: tilt as equipDonorPlayer does
    materials = [];
  if (grip) root.quaternion.premultiply(root.quaternion.clone().set(...eulerXYZ(grip)));
  let meshes = 0;
  try {
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (node.isSkinnedMesh) throw Error("Player melee equipment must be rigid on its hand mount");
      meshes++;
      node.frustumCulled = false;
      const own = [node.material].flat().map((source) => {
        if (!source?.isMeshStandardMaterial) throw Error("Melee PBR material required");
        const material = source.clone();
        materials.push({
          material,
          color: material.color?.clone(),
          emissive: material.emissive?.clone(),
          intensity: material.emissiveIntensity,
        });
        return material;
      });
      node.material = Array.isArray(node.material) ? own : own[0];
    });
    if (!meshes) throw Error("Empty player melee weapon");
    return { root, materials };
  } catch (error) {
    for (const m of materials) m.material.dispose();
    throw error;
  }
}
export function setPlayerMeleeWeapon(view, source, variantId) {
  if (view.meleeVariantId === variantId) return false;
  const displayId = MELEE_VARIANTS[variantId]?.modelVariantId ?? variantId;
  if (displayId === "knife" && !view.meleeEquipment) {
    view.meleeVariantId = "knife";
    return false;
  }
  if (!Object.hasOwn(MELEE_VARIANTS, variantId) || !view.knife?.parent)
    throw Error("Player melee hand mount unavailable");
  view.meleeEquipment ??= new Map([["knife", view.knife]]);
  view.meleeWeaponParent ??= view.knife.parent;
  if (!view.meleeEquipment.has(displayId)) {
    const clone =
      displayId === "bone-saw" ? { root: createBoneSaw(), materials: [] } : cloneMeleeWeapon(source, variantId);
    if (displayId === "bone-saw") {
      clone.root.position.copy(view.knife.position);
      clone.root.quaternion.copy(view.knife.quaternion);
      clone.root.scale.copy(view.knife.scale);
    }
    view.meleeEquipment.set(displayId, clone.root);
    view.materials.push(...clone.materials);
    view.flashMaterials.push(...clone.materials);
  }
  const next = view.meleeEquipment.get(displayId);
  view.knife.removeFromParent();
  view.meleeWeaponParent.add(next);
  view.knife = next;
  view.meleeVariantId = variantId;
  return true;
}
