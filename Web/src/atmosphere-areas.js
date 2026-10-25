import { GAME_DATA } from "./engine/game-data.js";

// Presets, anchors and budgets live in data/atmosphere.json (painting coordinates, Y down); this file only resolves them.
export const ATMOSPHERE_PRESETS = GAME_DATA.atmosphere.presets;
export const AREA_ATMOSPHERE = GAME_DATA.atmosphere.areas;
const empty = Object.freeze([]),
  emptyBudget = Object.freeze({ quads: 0, drawCalls: 0, textureBytes: 0 });
export const atmosphereBudget = (area, provided) => provided ?? GAME_DATA.atmosphere.budgets[area] ?? emptyBudget;
// Pure deterministic resolution: stable through re-entry, reset and reload.
export function atmosphereForArea(area, provided) {
  return (provided ?? AREA_ATMOSPHERE[area] ?? empty).map((p) => {
    if (p.preserve) return provided ? { ...ATMOSPHERE_PRESETS[p.preset], ...p } : p;
    const base = { ...ATMOSPHERE_PRESETS[p.preset], ...p };
    let state = p.seed >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const size = 0.94 + random() * 0.12,
      rise = 0.93 + random() * 0.14,
      phase = random(),
      offset = random() * 7;
    const tint = (base.smokeColor ?? [0.095, 0.085, 0.075]).map((c) =>
      Math.max(0, Math.min(1, c * (0.97 + random() * 0.06))),
    );
    return {
      ...base,
      width: base.width * p.scale * size,
      rise: base.rise * p.scale * rise,
      fireWidth: base.fireWidth * p.scale,
      fireHeight: base.fireHeight * p.scale * (0.96 + random() * 0.08),
      opacity: base.opacity * p.intensity * (0.96 + random() * 0.08),
      smokeColor: tint,
      smokeSpeed: (1 / 7) * (0.92 + random() * 0.16),
      phase,
      noiseOffset: offset,
      wind: (area === "east" ? 0.45 : 0.3) + random() * 0.12,
    };
  });
}
