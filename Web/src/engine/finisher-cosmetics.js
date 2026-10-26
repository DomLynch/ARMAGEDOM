import * as T from "three";
import { FINISHER_DATA, finisherDefinition } from "./finisher-data.js";
import { GAME_DATA } from "./game-data.js";
// The glow pulse (base share and swing) and how much of it tints the colour are appearance.json `finisherCosmetics`.
const LOOK = GAME_DATA.appearance.finisherCosmetics;
// Native clip ownership stays with each rig. These zero-part rows never copy
// vertices, reserve a pooled effect, or change a gameplay/control clock.
export function nativeFinisherSupport({ clip, seconds }) {
  if (typeof clip !== "string" || !clip.trim() || !Number.isFinite(seconds) || seconds <= 0) return [];
  return [...new Set(FINISHER_DATA.bindings.map((b) => b.fallback))].map((id) => ({
    id,
    clip,
    seconds,
    cost: 0,
    parts: [],
    prepared: true,
  }));
}
const palettes = new Map(
  FINISHER_DATA.cosmetics.map((c) => [
    c.damageType,
    { ...c, hot: new T.Color(c.color), glow: new T.Color(c.emissive), settled: new T.Color(c.settleTint) },
  ]),
);
export function applyFinisherCorpseCosmetic(view, entity) {
  if (!(entity?.hp <= 0) || !FINISHER_DATA.bindings.some((b) => b.fallback === entity.finisher?.recipeId)) return false;
  const p = palettes.get(finisherDefinition(entity.finisher?.recipeId)?.damageType);
  if (!p) return false;
  const age = view.restoredCorpse ? p.seconds : Math.max(0, view.finisherAge ?? 0),
    life = Math.max(0, 1 - age / p.seconds),
    pulse = life * (LOOK.pulseBase + LOOK.pulseSwing * Math.abs(Math.cos(age * p.pulseHz)));
  for (const m of view.flashMaterials) {
    if (m.color)
      m.material.color
        .copy(m.color)
        .lerp(p.settled, p.settleBlend)
        .lerp(p.hot, pulse * LOOK.hotMix);
    if (m.emissive) m.material.emissive.copy(m.emissive).lerp(p.glow, pulse);
    if (Number.isFinite(m.intensity)) m.material.emissiveIntensity = m.intensity + p.intensity * pulse;
  }
  return true;
}
