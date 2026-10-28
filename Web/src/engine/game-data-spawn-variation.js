// spawnVariation.json: the daily re-roll of where crates, stashes and hostiles stand inside an area. Each row names a pool of existing,
// hand-placed points with a weight, and the slots that draw from it without replacement. engine/spawn-variation.js runs the data; the
// pool points are checked against the real road geometry in tests/spawn-variation.test.js.
import { closed } from "./content-schema.js";
import { count, fail } from "./game-data-checks.js";

const NAME = /^[a-z0-9-]{1,48}$/;

function validateSpec(where, spec) {
  closed(spec, ["points", "slots"], ["only"]);
  const ids = Object.keys(spec.points ?? {});
  if (ids.length < 2 || ids.length > 24) fail("spawnVariation", `${where}.points must list 2 to 24`);
  for (const id of ids) {
    const weight = spec.points[id];
    if (!NAME.test(id) || !Number.isFinite(weight) || weight <= 0 || weight > 1000)
      fail("spawnVariation", `${where}.points.${id} needs a name and a weight above 0`);
  }
  if (!Array.isArray(spec.slots) || !spec.slots.length || spec.slots.length > ids.length || new Set(spec.slots).size !== spec.slots.length)
    fail("spawnVariation", `${where}.slots must be unique and no more than the points`);
  for (const slot of spec.slots) if (!ids.includes(slot)) fail("spawnVariation", `${where}.slots names ${slot}, which is not a point`);
  // `only` limits a slot to some of the points; the limited slots must come first so the rest can never be left without one.
  const limited = Object.keys(spec.only ?? {});
  closed(spec.only ?? {}, limited);
  for (const slot of limited) {
    const allowed = spec.only[slot];
    if (!spec.slots.includes(slot) || !Array.isArray(allowed) || !allowed.length || allowed.some((id) => !ids.includes(id)))
      fail("spawnVariation", `${where}.only.${slot}`);
  }
  if (limited.some((slot) => spec.slots.indexOf(slot) >= limited.length)) fail("spawnVariation", `${where}.only slots must come first`);
}

export function validateSpawnVariation(d) {
  closed(d, ["schema_version", "note", "offParam", "seedSeparator", "rng", "crates", "hostiles"]);
  if (!NAME.test(d.offParam) || typeof d.seedSeparator !== "string" || d.seedSeparator.length !== 1) fail("spawnVariation", "offParam or seedSeparator");
  closed(d.rng, ["hashOffset", "hashPrime", "multiplier", "increment", "range"]);
  for (const [field, value] of Object.entries(d.rng)) count("spawnVariation", `rng.${field}`, value, 1, 2 ** 32);
  closed(d.crates, Object.keys(d.crates));
  for (const [area, spec] of Object.entries(d.crates)) {
    if (area === "westminster" || area === "central-hub") fail("spawnVariation", `${area} keeps its hand-built layout`);
    validateSpec(`crates.${area}`, spec);
  }
  closed(d.hostiles, Object.keys(d.hostiles));
  for (const [area, row] of Object.entries(d.hostiles)) {
    if (area === "westminster" || area === "central-hub") fail("spawnVariation", `${area} keeps its hand-built layout`);
    closed(row, ["cycles"]);
    closed(row.cycles, ["A", "B"]);
    for (const [cycle, spec] of Object.entries(row.cycles)) validateSpec(`hostiles.${area}.${cycle}`, spec);
  }
}
