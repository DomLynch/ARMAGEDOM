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
  closed(d, ["schema_version", "enabled", "schedule", "plane", "landing", "crate", "convergence", "loot", "text", "view"]);
  if (typeof d.enabled !== "boolean") fail("airdrop", "enabled must be a boolean");
  closed(d.schedule, ["intervalSeconds", "firstDelayMin", "firstDelayMax", "retrySeconds"]);
  for (const f of ["intervalSeconds", "firstDelayMin", "firstDelayMax", "retrySeconds"]) number("airdrop", `schedule.${f}`, d.schedule[f], 1);
  if (d.schedule.firstDelayMax < d.schedule.firstDelayMin) fail("airdrop", "schedule.firstDelayMax must not be below firstDelayMin");
  closed(d.plane, ["seconds", "halfSpan", "dropFraction"]);
  number("airdrop", "plane.seconds", d.plane.seconds, 1);
  number("airdrop", "plane.halfSpan", d.plane.halfSpan, 1);
  share("plane.dropFraction", d.plane.dropFraction);
  closed(d.landing, [
    "minDistance",
    "maxDistance",
    "attempts",
    "bodyRadius",
    "exitClearance",
    "exitSamples",
    "arrivalClearance",
    "bossPocketPadding",
    "safehouseRadius",
  ]);
  for (const f of ["minDistance", "bodyRadius", "exitClearance", "arrivalClearance", "bossPocketPadding", "safehouseRadius"])
    number("airdrop", `landing.${f}`, d.landing[f], 0);
  number("airdrop", "landing.maxDistance", d.landing.maxDistance, d.landing.minDistance);
  count("airdrop", "landing.attempts", d.landing.attempts, 1, 1000);
  count("airdrop", "landing.exitSamples", d.landing.exitSamples, 3, 64);
  closed(d.crate, ["fallSeconds", "lifetimeSeconds", "openRadius", "holdSeconds", "holdDecayPerSecond"]);
  for (const f of ["fallSeconds", "lifetimeSeconds", "openRadius", "holdSeconds"]) number("airdrop", `crate.${f}`, d.crate[f], 0.1);
  number("airdrop", "crate.holdDecayPerSecond", d.crate.holdDecayPerSecond, 0);
  closed(d.convergence, ["enabled", "bossLeashBonus", "hostileRadius", "maxHostiles", "arriveRadius"]);
  if (typeof d.convergence.enabled !== "boolean") fail("airdrop", "convergence.enabled must be a boolean");
  for (const f of ["bossLeashBonus", "hostileRadius", "arriveRadius"]) number("airdrop", `convergence.${f}`, d.convergence[f], 0);
  count("airdrop", "convergence.maxHostiles", d.convergence.maxHostiles, 0, 64);
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
  closed(d.text, ["incoming", "hud", "hudFalling", "hudOpening", "opened", "openedGolden", "lost"]);
  for (const [key, value] of Object.entries(d.text)) if (typeof value !== "string" || !value) fail("airdrop", `text.${key} must be text`);
  closed(d.view, [
    "shadowColour",
    "shadowOpacity",
    "shadowLength",
    "shadowWidth",
    "flareColour",
    "flareHeight",
    "flareRadius",
    "flarePuffs",
    "flareRiseSeconds",
    "flareSway",
    "flareOpacity",
    "flareGlowRadius",
    "crateSize",
    "crateColour",
    "crateTrimColour",
    "canopyColour",
    "canopyRadius",
    "canopyHeight",
    "dropHeight",
    "pulseSeconds",
  ]);
  for (const f of ["shadowColour", "flareColour", "crateColour", "crateTrimColour", "canopyColour"]) hex(`view.${f}`, d.view[f]);
  for (const f of ["shadowOpacity", "flareOpacity"]) share(`view.${f}`, d.view[f]);
  count("airdrop", "view.flarePuffs", d.view.flarePuffs, 1, 64);
  for (const f of [
    "shadowLength",
    "shadowWidth",
    "flareHeight",
    "flareRadius",
    "flareRiseSeconds",
    "flareSway",
    "flareGlowRadius",
    "crateSize",
    "canopyRadius",
    "canopyHeight",
    "dropHeight",
    "pulseSeconds",
  ])
    number("airdrop", `view.${f}`, d.view[f], 0.01);
}
