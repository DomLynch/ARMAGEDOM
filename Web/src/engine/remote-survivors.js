// Look of the other players (W2): the existing survivor rig and model, one of six outfit variants picked from the player id.
// Presentation only. Geometry and the skeleton's source data are shared with the local player (no new download); each variant
// owns one set of tinted garment materials shared by every remote player wearing it, so the cost per player is a skinned clone,
// a mixer and a ring. A cool ground ring marks a figure as a friendly player, apart from hunters (warm tint) and scavengers (grey).
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { equipDonorPlayer } from "../donor-motion.js";
import { GAME_DATA } from "./game-data.js";

// garment: multiplies the tunic and wraps; accent: the heraldry cloth and the ground ring. Skin, face and steel stay untouched.
// The rows live in Web/src/data/visual.json `survivorVariants` (read through game-data.js).
export const SURVIVOR_VARIANTS = GAME_DATA.visual.survivorVariants;
const GARMENTS = new Set(["Gambeson", "Wrap"]),
  ACCENTS = new Set(["Heraldry"]);
const RING_INNER = 0.62,
  RING_OUTER = 0.74;

// FNV-1a over the id's text: every client maps the same id to the same variant.
export function survivorVariantIndex(id, count = SURVIVOR_VARIANTS.length) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()) / 1000;

// `animations`: the clips to play. Omit it to use the source's own; pass the player model's clips when the source is the reduced
// remote mesh, which ships no clips and shares the player's skeleton.
export function createSurvivorKit({ source, animations: clipSource = null, characterScale = 1.265 }) {
  if (!source?.gltf?.scene || !source.equipment || !source.description?.clips) throw Error("Survivor source not ready");
  const { description } = source,
    clips = description.clips,
    scale = characterScale * (description.scale ?? 1);
  const ringGeometry = new THREE.RingGeometry(RING_INNER, RING_OUTER, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const variantParts = new Map(), // variant index -> { materials: Map(original -> tinted), ring }
    owned = [],
    figures = new Set();
  let animations = null,
    disposed = false;

  function partsFor(index) {
    let parts = variantParts.get(index);
    if (parts) return parts;
    const variant = SURVIVOR_VARIANTS[index],
      garment = new THREE.Color(...variant.garment),
      accent = new THREE.Color(...variant.accent),
      materials = new Map();
    source.gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const original of [].concat(o.material)) {
        if (materials.has(original)) continue;
        const own = original.clone();
        if (GARMENTS.has(original.name)) own.color?.multiply(garment);
        else if (ACCENTS.has(original.name)) own.color?.copy(accent);
        materials.set(original, own);
        owned.push(own);
      }
    });
    const ring = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });
    owned.push(ring);
    parts = { materials, ring };
    variantParts.set(index, parts);
    return parts;
  }

  return {
    // The same id always yields the same variant.
    variantFor: (id) => SURVIVOR_VARIANTS[survivorVariantIndex(id)],
    spawn(id) {
      if (disposed) throw Error("Survivor kit disposed");
      const index = survivorVariantIndex(id),
        { materials, ring } = partsFor(index),
        model = clone(source.gltf.scene),
        equipped = equipDonorPlayer({ scene: model, animations: clipSource ?? source.gltf.animations }, source.equipment);
      animations ??= equipped.animations;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const swap = (m) => materials.get(m) ?? m;
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
      const body = new THREE.Group(),
        root = new THREE.Group(),
        marker = new THREE.Mesh(ringGeometry, ring);
      body.scale.setScalar(scale);
      body.add(model);
      marker.position.y = 0.03;
      marker.renderOrder = 1;
      marker.name = "Friendly ring";
      root.name = `Survivor ${id}`;
      root.add(body, marker);
      const mixer = new THREE.AnimationMixer(model),
        action = (name) => {
          const a = mixer.clipAction(equipped.animations.find((c) => c.name === name));
          a.play();
          return a;
        },
        idle = action(clips.idle),
        walk = action(clips.walk);
      idle.setEffectiveWeight(1);
      walk.setEffectiveWeight(0);
      // Desynchronise the loops so a group of players never breathes in step.
      mixer.update((survivorVariantIndex(`${id}:phase`, 1000) / 1000) * idle.getClip().duration);
      let weight = 0,
        last = now(),
        gone = false;
      const figure = {
        root,
        variant: SURVIVOR_VARIANTS[index],
        mixer,
        update({ moving = false } = {}) {
          if (gone) return;
          const t = now(),
            dt = Math.min(0.1, Math.max(0, t - last));
          last = t;
          weight = THREE.MathUtils.clamp(weight + (moving ? 1 : -1) * dt * 6, 0, 1);
          idle.setEffectiveWeight(1 - weight);
          walk.setEffectiveWeight(weight);
          mixer.update(dt);
        },
        dispose() {
          if (gone) return;
          gone = true;
          mixer.stopAllAction();
          mixer.uncacheRoot(model);
          root.removeFromParent();
          figures.delete(figure);
        },
      };
      figures.add(figure);
      return figure;
    },
    get active() {
      return figures.size;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const figure of [...figures]) figure.dispose();
      for (const material of owned) material.dispose();
      ringGeometry.dispose();
      variantParts.clear();
    },
  };
}
