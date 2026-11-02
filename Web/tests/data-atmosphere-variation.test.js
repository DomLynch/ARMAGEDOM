import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { AREA_ATMOSPHERE, ATMOSPHERE_PRESETS, atmosphereForArea } from "../src/atmosphere-areas.js";
import { GAME_DATA, validateAtmosphere } from "../src/engine/game-data.js";

// Data batch 14 (World): the per-anchor jitter ranges of atmosphere-areas.js moved into data/atmosphere.json `variation`.
// `legacyAtmosphereForArea` below is the function as it was on origin/main (07cc588, before the move), literals and all; the new one
// must give the same rows for every area, for every preset, and for a few synthetic anchors and seeds.
const rawText = fs.readFileSync(new URL("../src/data/atmosphere.json", import.meta.url), "utf8");

function legacyAtmosphereForArea(area, provided) {
  return (provided ?? AREA_ATMOSPHERE[area] ?? []).map((p) => {
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

test("the variation section is pinned", () => {
  const section = JSON.stringify(JSON.parse(rawText).variation);
  assert.equal(
    crypto.createHash("sha256").update(section).digest("hex"),
    "28b9bcbf254c8c247ad922a2d65974f60abf5ffdd65e0b417f41af28d95b1be8",
  );
});

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.atmosphere.variation, {
    size: { min: 0.94, span: 0.12 },
    rise: { min: 0.93, span: 0.14 },
    noiseOffsetSpan: 7,
    defaultSmokeColor: [0.095, 0.085, 0.075],
    tint: { min: 0.97, span: 0.06 },
    fireHeight: { min: 0.96, span: 0.08 },
    opacity: { min: 0.96, span: 0.08 },
    smokePeriod: 7,
    smokeSpeed: { min: 0.92, span: 0.16 },
    wind: { east: 0.45, other: 0.3, span: 0.12 },
  });
  assert(Object.isFrozen(GAME_DATA.atmosphere.variation) && Object.isFrozen(GAME_DATA.atmosphere.variation.size));
});

test("atmosphereForArea gives the same rows as the old function, bit for bit", () => {
  for (const area of [...Object.keys(AREA_ATMOSPHERE), "north", "unknown"])
    assert.deepEqual(atmosphereForArea(area), legacyAtmosphereForArea(area), area);
  const synthetic = [];
  for (const preset of Object.keys(ATMOSPHERE_PRESETS))
    for (const seed of [0, 1, 7, 4294967295, 123456789])
      synthetic.push({ id: `s-${preset}-${seed}`, preset, x: 0.5, y: 0.5, seed, scale: 1.3, intensity: 0.8 });
  synthetic.push({
    id: "tinted",
    preset: "heavy-smoke",
    x: 0.1,
    y: 0.2,
    seed: 99,
    scale: 1,
    intensity: 1,
    smokeColor: [0.2, 0.3, 1],
  });
  for (const area of ["east", "westminster", "south", "elsewhere"])
    assert.deepEqual(atmosphereForArea(area, synthetic), legacyAtmosphereForArea(area, synthetic), area);
});

test("the loader rejects a broken variation section", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateAtmosphere(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      delete d.variation;
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.size.span = 2;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.variation.rise.min;
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.smokePeriod = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.defaultSmokeColor = [0.1, 0.1];
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.wind.east = "windy";
    }),
  );
  assert.throws(
    broken((d) => {
      d.variation.wind.extra = 1;
    }),
  );
});
