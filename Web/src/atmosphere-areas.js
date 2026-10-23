import { WESTMINSTER_ATMOSPHERE } from "./atmosphere-westminster.js";

// Original painting coordinates, Y down. Overrides are for distinct painted sizes.
export const ATMOSPHERE_PRESETS = Object.freeze({
  "light-smoulder": Object.freeze({
    width: 0.018,
    rise: 0.05,
    smoke: 3,
    opacity: 0.35,
    smokeColor: [0.57, 0.54, 0.49],
    fireWidth: 0,
    fireHeight: 0,
    embers: 0,
  }),
  "heavy-smoke": Object.freeze({
    width: 0.024,
    rise: 0.065,
    smoke: 4,
    opacity: 0.28,
    smokeColor: [0.32, 0.3, 0.27],
    fireWidth: 0,
    fireHeight: 0,
    embers: 0,
  }),
  "small-fire": Object.freeze({
    width: 0.011,
    rise: 0.035,
    smoke: 0,
    opacity: 0,
    fireWidth: 0.007,
    fireHeight: 0.026,
    embers: 1,
  }),
  "structural-fire": Object.freeze({
    width: 0.016,
    rise: 0.055,
    smoke: 2,
    opacity: 0.16,
    fireWidth: 0.011,
    fireHeight: 0.036,
    embers: 2,
  }),
  "fire-with-smoke": Object.freeze({
    width: 0.016,
    rise: 0.048,
    smoke: 2,
    opacity: 0.22,
    fireWidth: 0.008,
    fireHeight: 0.032,
    embers: 1,
  }),
});
const placement = (id, preset, x, y, foot, seed, overrides = {}) =>
  Object.freeze({
    id,
    preset,
    x,
    y,
    foot: foot ? Object.freeze(foot) : null,
    depth: foot ? null : 80,
    seed,
    scale: 1,
    intensity: 1,
    ...overrides,
  });
export const AREA_ATMOSPHERE = Object.freeze({
  // Exact061 footprints/numeric settings, no seeded variation of approved art.
  westminster: Object.freeze(
    WESTMINSTER_ATMOSPHERE.map((a) =>
      Object.freeze({
        ...a,
        preset: a.id === "bus-roof" ? "light-smoulder" : a.smoke ? "fire-with-smoke" : "small-fire",
        seed: { "bus-roof": 100, "tower-breach": 101, "parliament-base-fire": 104, "parliament-west-blaze": 105 }[a.id],
        scale: 1,
        intensity: 1,
        preserve: true,
      }),
    ),
  ),
  east: Object.freeze([
    placement("east-bus-smoulder", "light-smoulder", 0.56, 0.275, { x: 0.56, y: 0.37 }, 201, {
      width: 0.022,
      rise: 0.056,
      opacity: 0.3,
    }),
    placement("east-midbridge-drum", "fire-with-smoke", 0.41, 0.365, { x: 0.42, y: 0.4 }, 204, {
      fireWidth: 0.006,
      fireHeight: 0.022,
      width: 0.011,
      rise: 0.035,
    }),
    placement("east-bank-drum", "small-fire", 0.834, 0.327, { x: 0.835, y: 0.37 }, 205, {
      fireWidth: 0.006,
      fireHeight: 0.021,
    }),
    placement("east-bank-edge-drum", "fire-with-smoke", 0.971, 0.414, { x: 0.97, y: 0.46 }, 206, {
      fireWidth: 0.006,
      fireHeight: 0.024,
      width: 0.012,
      rise: 0.04,
    }),
    placement("east-building-breach", "structural-fire", 0.85, 0.153, null, 207, {
      fireWidth: 0.009,
      fireHeight: 0.03,
      width: 0.013,
      rise: 0.045,
    }),
  ]),
  south: Object.freeze([
    placement("south-central-drum", "fire-with-smoke", 0.444, 0.383, { x: 0.46, y: 0.46 }, 301, {
      fireWidth: 0.008,
      fireHeight: 0.03,
    }),
    placement("south-near-drum", "fire-with-smoke", 0.389, 0.73, { x: 0.4, y: 0.79 }, 302, {
      fireWidth: 0.008,
      fireHeight: 0.032,
      width: 0.016,
      rise: 0.05,
    }),
    placement("south-bus-smoulder", "light-smoulder", 0.778, 0.611, { x: 0.79, y: 0.82 }, 303, {
      opacity: 0.27,
      width: 0.025,
      rise: 0.05,
    }),
    placement("south-upper-wreck", "heavy-smoke", 0.596, 0.115, { x: 0.6, y: 0.19 }, 304, {
      width: 0.016,
      rise: 0.047,
      opacity: 0.22,
      smoke: 3,
    }),
    placement("south-left-rubble-fire", "small-fire", 0.04, 0.369, { x: 0.1, y: 0.42 }, 305, {
      fireWidth: 0.006,
      fireHeight: 0.022,
    }),
    placement("south-distant-breach", "structural-fire", 0.975, 0.273, null, 306, {
      fireWidth: 0.006,
      fireHeight: 0.019,
      width: 0.01,
      rise: 0.03,
    }),
  ]),
});
const BUDGETS = Object.freeze({
  westminster: Object.freeze({ quads: 28, drawCalls: 3, textureBytes: 0 }),
  east: Object.freeze({ quads: 28, drawCalls: 3, textureBytes: 0 }),
  south: Object.freeze({ quads: 28, drawCalls: 3, textureBytes: 0 }),
});
const empty = Object.freeze([]),
  emptyBudget = Object.freeze({ quads: 0, drawCalls: 0, textureBytes: 0 });
export const atmosphereBudget = (area, provided) => provided ?? BUDGETS[area] ?? emptyBudget;
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
