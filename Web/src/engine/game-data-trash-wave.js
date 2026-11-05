// data/trashWave.json (engine/trash-wave.js, engine/kill-drops.js): the opt-in timed trash-mob waves. The validator lives here so the
// loader stays small. Every tier row named by qualityTier.json must be present in `tiers` and in every group's `sizes`.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

const NAME = /^[a-z0-9-]{1,24}$/;
// The tier rows of qualityTier.json and the two mob kinds (tests pin the tiers against qualityTier.json).
const tierNames = () => ["full", "mid", "low"];
const kindNames = () => ["trash", "elite"];
const bool = (field, v) => {
  if (typeof v !== "boolean") fail("trashWave", `${field} must be true or false`);
};
const text = (field, v) => {
  if (typeof v !== "string" || !NAME.test(v)) fail("trashWave", `${field} must be a lowercase name`);
};

function checkGroup(g) {
  closed(g, ["id", "kind", "begin", "spacing", "unitGrowth", "unitStep", "sizes"]);
  text("group.id", g.id);
  if (!kindNames().includes(g.kind)) fail("trashWave", "group.kind must be trash or elite");
  count("trashWave", "group.begin", g.begin, 1, 1000);
  count("trashWave", "group.spacing", g.spacing, 1, 1000);
  number("trashWave", "group.unitGrowth", g.unitGrowth, 0);
  count("trashWave", "group.unitStep", g.unitStep, 0, 16);
  closed(g.sizes, tierNames());
  for (const tier of tierNames()) {
    closed(g.sizes[tier], ["unitAmount", "max"]);
    count("trashWave", `${g.id}.${tier}.unitAmount`, g.sizes[tier].unitAmount, 1, 64);
    count("trashWave", `${g.id}.${tier}.max`, g.sizes[tier].max, g.sizes[tier].unitAmount, 64);
  }
}

function checkSpawn(s, caps) {
  closed(s, [
    "perFrame",
    "packMin",
    "packMax",
    "followerRadius",
    "minPlayerMetres",
    "ringInnerMetres",
    "ringOuterMetres",
    "headlessViewMetres",
    "tries",
    "viewMargin",
    "angleJitterTurns",
    "bodyRadius",
    "safehouseRadius",
    "occupiedGap",
    "graceSeconds",
    "retrySeconds",
    "giveUpSeconds",
    "stuckSeconds",
    "stuckProgressMetres",
    "stuckMinMetres",
    "corpseKeep",
  ]);
  count("trashWave", "spawn.perFrame", s.perFrame, 1, 4); // the design's hard ceiling: four spawns a frame
  count("trashWave", "spawn.packMin", s.packMin, 1, 16);
  count("trashWave", "spawn.packMax", s.packMax, s.packMin, 16);
  count("trashWave", "spawn.tries", s.tries, 1, 200);
  count("trashWave", "spawn.corpseKeep", s.corpseKeep, 0, 64);
  for (const f of [
    "followerRadius",
    "minPlayerMetres",
    "ringInnerMetres",
    "headlessViewMetres",
    "bodyRadius",
    "safehouseRadius",
  ])
    number("trashWave", `spawn.${f}`, s[f], 0.01);
  number("trashWave", "spawn.ringOuterMetres", s.ringOuterMetres, s.ringInnerMetres);
  if (s.ringInnerMetres < s.minPlayerMetres)
    fail("trashWave", "spawn.ringInnerMetres may not be inside minPlayerMetres");
  for (const f of ["viewMargin", "angleJitterTurns", "occupiedGap", "graceSeconds"])
    number("trashWave", `spawn.${f}`, s[f], 0);
  number("trashWave", "spawn.retrySeconds", s.retrySeconds, 0);
  number("trashWave", "spawn.giveUpSeconds", s.giveUpSeconds, s.retrySeconds);
  number("trashWave", "spawn.stuckSeconds", s.stuckSeconds, 1);
  number("trashWave", "spawn.stuckProgressMetres", s.stuckProgressMetres, 0.01);
  number("trashWave", "spawn.stuckMinMetres", s.stuckMinMetres, 0.01);
  if (Object.values(caps).some((c) => c.liveCap < s.packMax))
    fail("trashWave", "a tier live cap must hold a whole pack");
}

export function validateTrashWave(d) {
  closed(d, [
    "schema_version",
    "note",
    "note2",
    "note3",
    "note4",
    "enabled",
    "wavesEnabledDefault",
    "startSwitch",
    "excludedAreas",
    "seed",
    "clockSeconds",
    "firstWaveSeconds",
    "messageSeconds",
    "pacing",
    "tiers",
    "groups",
    "bossMarker",
    "mobs",
    "spawn",
    "rewards",
    "drops",
  ]);
  bool("enabled", d.enabled);
  bool("wavesEnabledDefault", d.wavesEnabledDefault);
  closed(d.startSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.startSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.startSwitch[k]))
      fail("trashWave", `startSwitch.${k}`);
  if (!Array.isArray(d.excludedAreas) || d.excludedAreas.some((a) => typeof a !== "string" || !a))
    fail("trashWave", "excludedAreas must list area ids");
  closed(d.seed, ["fallbackDay", "separator", "salt"]);
  for (const k of ["fallbackDay", "separator", "salt"])
    if (typeof d.seed[k] !== "string" || !d.seed[k]) fail("trashWave", `seed.${k}`);
  for (const f of ["clockSeconds", "firstWaveSeconds", "messageSeconds"]) number("trashWave", f, d[f], 0.1);
  closed(d.pacing, ["pauseAboveLive", "earlyAtMostLive", "earlyMinGapSeconds", "breatherSeconds"]);
  count("trashWave", "pacing.pauseAboveLive", d.pacing.pauseAboveLive, 1, 64);
  count("trashWave", "pacing.earlyAtMostLive", d.pacing.earlyAtMostLive, 0, d.pacing.pauseAboveLive);
  number("trashWave", "pacing.earlyMinGapSeconds", d.pacing.earlyMinGapSeconds, 0);
  number("trashWave", "pacing.breatherSeconds", d.pacing.breatherSeconds, 0);
  closed(d.tiers, tierNames());
  for (const tier of tierNames()) {
    closed(d.tiers[tier], ["liveCap"]);
    count("trashWave", `tiers.${tier}.liveCap`, d.tiers[tier].liveCap, 1, 64);
  }
  if (!(d.tiers.full.liveCap >= d.tiers.mid.liveCap && d.tiers.mid.liveCap >= d.tiers.low.liveCap))
    fail("trashWave", "live caps must not rise on weaker tiers");
  if (!Array.isArray(d.groups) || !d.groups.length) fail("trashWave", "groups needs at least one group");
  d.groups.forEach(checkGroup);
  if (new Set(d.groups.map((g) => g.id)).size !== d.groups.length) fail("trashWave", "group ids must be unique");
  if (!d.groups.some((g) => g.kind === "trash")) fail("trashWave", "a trash group is required");
  closed(d.bossMarker, ["begin", "spacing"]);
  count("trashWave", "bossMarker.begin", d.bossMarker.begin, 1, 1000);
  count("trashWave", "bossMarker.spacing", d.bossMarker.spacing, 1, 1000);
  closed(d.mobs, ["pursuit", "trash", "elite"]);
  closed(d.mobs.pursuit, [
    "pursuitScope",
    "wakeDistance",
    "homeLeash",
    "holdUntilWake",
    "retreatSeconds",
    "companionDistance",
    "isolationDistance",
    "burstSeconds",
    "pauseSeconds",
  ]);
  if (d.mobs.pursuit.pursuitScope !== "area") fail("trashWave", "mobs.pursuit.pursuitScope must be area");
  closed(d.mobs.trash, ["healthScale", "speedScale"]);
  closed(d.mobs.elite, ["healthScale", "speedScale", "stars"]);
  for (const kind of ["trash", "elite"]) {
    number("trashWave", `${kind}.healthScale`, d.mobs[kind].healthScale, 0.1);
    number("trashWave", `${kind}.speedScale`, d.mobs[kind].speedScale, 0.1);
  }
  count("trashWave", "mobs.elite.stars", d.mobs.elite.stars, 0, 9);
  checkSpawn(d.spawn, d.tiers);
  closed(d.rewards, ["refillAmmo", "score"]);
  bool("rewards.refillAmmo", d.rewards.refillAmmo);
  closed(d.rewards.score, ["perKill", "perEliteKill", "clearBase", "clearPerWave"]);
  for (const k of Object.keys(d.rewards.score)) count("trashWave", `rewards.score.${k}`, d.rewards.score[k], 0, 100000);
  closed(d.drops, ["enabled", "tier", "maxPerWave", "despawnSeconds", "minSecondsBetween"]);
  bool("drops.enabled", d.drops.enabled);
  text("drops.tier", d.drops.tier);
  count("trashWave", "drops.maxPerWave", d.drops.maxPerWave, 0, 2); // the Lead's ceiling: no more than two paying mobs a wave
  number("trashWave", "drops.despawnSeconds", d.drops.despawnSeconds, 1);
  number("trashWave", "drops.minSecondsBetween", d.drops.minSecondsBetween, 0);
}
