// data/airdrop.json (engine/airdrop.js, airdrop-effects.js, airdrop-view.js): the supply-plane schedule, landing rules, crate timings,
// boss convergence, the loot bundle, the HUD text and the effect styling. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

const OUTCOMES = ["ammo-refill", "medkit", "cash", "golden-weapon", "none"];
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("airdrop", `${field} must be a 6-digit hex colour`);
};
const share = (field, v) => {
  if (!(v >= 0 && v <= 1)) fail("airdrop", `${field} must be 0 to 1`);
};

export function validateAirdrop(d) {
  closed(d, ["schema_version", "enabled", "excludedAreas", "schedule", "plane", "landing", "crate", "convergence", "loot", "view"]);
  if (typeof d.enabled !== "boolean") fail("airdrop", "enabled must be a boolean");
  if (!Array.isArray(d.excludedAreas) || d.excludedAreas.some((a) => typeof a !== "string" || !a)) fail("airdrop", "excludedAreas must list area ids");
  closed(d.schedule, ["intervalSeconds", "firstDelayMin", "firstDelayMax", "retrySeconds", "toastSeconds"]);
  for (const f of ["intervalSeconds", "firstDelayMin", "firstDelayMax", "retrySeconds", "toastSeconds"])
    number("airdrop", `schedule.${f}`, d.schedule[f], 1);
  if (d.schedule.firstDelayMax < d.schedule.firstDelayMin) fail("airdrop", "schedule.firstDelayMax must not be below firstDelayMin");
  closed(d.plane, ["seconds", "halfSpan", "dropFraction"]);
  number("airdrop", "plane.seconds", d.plane.seconds, 1);
  number("airdrop", "plane.halfSpan", d.plane.halfSpan, 1);
  share("plane.dropFraction", d.plane.dropFraction);
  closed(d.landing, ["minDistance", "maxDistance", "attempts", "bodyRadius", "exitClearance", "exitSamples"]);
  for (const f of ["minDistance", "bodyRadius", "exitClearance"]) number("airdrop", `landing.${f}`, d.landing[f], 0);
  number("airdrop", "landing.maxDistance", d.landing.maxDistance, d.landing.minDistance);
  count("airdrop", "landing.attempts", d.landing.attempts, 1, 1000);
  count("airdrop", "landing.exitSamples", d.landing.exitSamples, 3, 64);
  closed(d.crate, ["fallSeconds", "lifetimeSeconds", "openRadius", "holdSeconds", "holdDecayPerSecond"]);
  for (const f of ["fallSeconds", "lifetimeSeconds", "openRadius", "holdSeconds"]) number("airdrop", `crate.${f}`, d.crate[f], 0.1);
  number("airdrop", "crate.holdDecayPerSecond", d.crate.holdDecayPerSecond, 0);
  closed(d.convergence, ["enabled", "engageRadius", "arriveRadius"]);
  if (typeof d.convergence.enabled !== "boolean") fail("airdrop", "convergence.enabled must be a boolean");
  for (const f of ["engageRadius", "arriveRadius"]) number("airdrop", `convergence.${f}`, d.convergence[f], 0);
  closed(d.loot, ["bundle", "bonus"]);
  if (!Array.isArray(d.loot.bundle) || !Array.isArray(d.loot.bonus) || d.loot.bonus.length < 1) fail("airdrop", "loot needs a bundle and a bonus table");
  for (const row of d.loot.bundle) {
    closed(row, ["id"], ["amount", "fraction"]);
    if (!OUTCOMES.includes(row.id) || row.id === "none") fail("airdrop", "loot.bundle holds an unknown outcome");
    if (row.amount !== undefined) count("airdrop", "loot.bundle.amount", row.amount, 0, 1000000);
    if (row.fraction !== undefined) share("loot.bundle.fraction", row.fraction);
  }
  for (const row of d.loot.bonus) {
    closed(row, ["id", "weight"]);
    if (!OUTCOMES.includes(row.id)) fail("airdrop", "loot.bonus holds an unknown outcome");
    number("airdrop", "loot.bonus.weight", row.weight, 0);
  }
  const colours = ["shadowColour", "flareColour", "crateColour", "crateTrimColour", "canopyColour"],
    shares = ["shadowOpacity", "flareOpacity", "shadowBodyShare", "shadowWingChord", "crateTrimShare"],
    sizes = [
      "shadowLength",
      "shadowWidth",
      "groundLift",
      "flareHeight",
      "flareRadius",
      "flareCoreRadius",
      "flareRiseSeconds",
      "flareSway",
      "flareGlowRadius",
      "swayRate",
      "crateSize",
      "crateLift",
      "canopyRadius",
      "canopyHeight",
      "dropHeight",
      "pulseSeconds",
    ];
  closed(d.view, [...colours, ...shares, ...sizes, "flarePuffs", "segments"]);
  for (const f of colours) hex(`view.${f}`, d.view[f]);
  for (const f of shares) share(`view.${f}`, d.view[f]);
  count("airdrop", "view.flarePuffs", d.view.flarePuffs, 1, 64);
  count("airdrop", "view.segments", d.view.segments, 3, 64);
  for (const f of sizes)
    number("airdrop", `view.${f}`, d.view[f], 0.01);
}
