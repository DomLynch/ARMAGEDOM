import { GAME_DATA } from "./engine/game-data.js";

// Presets, anchors and budgets live in data/atmosphere.json (painting coordinates, Y down); this file only resolves them.
export const ATMOSPHERE_PRESETS = GAME_DATA.atmosphere.presets;
export const AREA_ATMOSPHERE = GAME_DATA.atmosphere.areas;
const V = GAME_DATA.atmosphere.variation; // the per-anchor jitter ranges
export const atmosphereBudget = (area, provided) =>
  provided ?? GAME_DATA.atmosphere.budgets[area] ?? { quads: 0, drawCalls: 0, textureBytes: 0 };
// Pure deterministic resolution: stable through re-entry, reset and reload.
export function atmosphereForArea(area, provided) {
  return (provided ?? AREA_ATMOSPHERE[area] ?? []).map((p) => {
    if (p.preserve) return provided ? { ...ATMOSPHERE_PRESETS[p.preset], ...p } : p;
    const base = { ...ATMOSPHERE_PRESETS[p.preset], ...p };
    let state = p.seed >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0; // tuning-ok: the LCG multiplier and increment
      return state / 4294967296; // tuning-ok: 2^32, the LCG modulus
    };
    const draw = (row) => row.min + random() * row.span;
    const size = draw(V.size),
      rise = draw(V.rise),
      phase = random(),
      offset = random() * V.noiseOffsetSpan;
    const tint = (base.smokeColor ?? V.defaultSmokeColor).map((c) => Math.max(0, Math.min(1, c * draw(V.tint))));
    return {
      ...base,
      width: base.width * p.scale * size,
      rise: base.rise * p.scale * rise,
      fireWidth: base.fireWidth * p.scale,
      fireHeight: base.fireHeight * p.scale * draw(V.fireHeight),
      opacity: base.opacity * p.intensity * draw(V.opacity),
      smokeColor: tint,
      smokeSpeed: (1 / V.smokePeriod) * draw(V.smokeSpeed),
      phase,
      noiseOffset: offset,
      wind: (area === "east" ? V.wind.east : V.wind.other) + random() * V.wind.span,
    };
  });
}
