// Desktop-only material polish for actor and weapon sources (data/qualityTier.json `materialPolish`). A phone, a tablet and the mid and low
// tiers never match QUALITY.materialPolish(), so their materials stay exactly as the GLB shipped them. Each source file is recorded with its
// original values; refresh() applies the rule while it holds and puts the originals back when it stops (the tier dropped after the probe).
// Presentation only: no geometry, texture bytes, shadow or post-processing change, and no new GPU memory beyond sampling the mip chain
// that is already there. Actors cloned before a revert keep what they copied; the tier can only drop once, in the first seconds.
import { GAME_DATA } from "./game-data.js";
import { QUALITY } from "./quality-tier.js";

export function createMaterialPolish(quality = QUALITY) {
  const tracked = new Map(); // material -> its original roughness, metalness and texture anisotropy
  let applied = null;
  const apply = (rule) => {
    for (const [material, was] of tracked) {
      if (material.isMeshStandardMaterial) {
        if (Number.isFinite(was.roughness)) material.roughness = Math.max(was.roughness, rule.roughnessMin);
        if (Number.isFinite(was.metalness)) material.metalness = Math.min(was.metalness, rule.metalnessMax);
      }
      for (const [texture, anisotropy] of was.textures)
        if (texture.generateMipmaps) texture.anisotropy = Math.max(anisotropy, rule.anisotropy);
    }
  };
  const restore = () => {
    for (const [material, was] of tracked) {
      if (material.isMeshStandardMaterial) {
        material.roughness = was.roughness;
        material.metalness = was.metalness;
      }
      for (const [texture, anisotropy] of was.textures) texture.anisotropy = anisotropy;
    }
  };
  function refresh() {
    const rule = quality.materialPolish();
    if (rule === applied) return;
    if (applied) restore();
    applied = rule;
    if (rule) apply(rule);
  }
  quality.onChange(refresh);
  quality.onProbe(refresh);
  return {
    // Record a loaded glTF's materials (before any clone copies them) and polish them if the rule holds now.
    track(gltf) {
      gltf?.scene?.traverse((object) => {
        for (const material of [object.material].flat()) {
          if (!material || tracked.has(material)) continue;
          const textures = new Map();
          for (const slot of GAME_DATA.qualityTier.materialPolish.textureSlots)
            if (material[slot]?.isTexture) textures.set(material[slot], material[slot].anisotropy);
          tracked.set(material, { roughness: material.roughness, metalness: material.metalness, textures });
        }
      });
      refresh();
      if (applied) apply(applied);
    },
    refresh,
    active: () => applied !== null,
    dispose: () => {
      restore();
      tracked.clear();
      applied = null;
    },
  };
}
