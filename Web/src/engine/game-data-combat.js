// combatRules.json validator, split out of game-data.js (which re-exports it) to keep the loader small. Same checks, same messages.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

// combatRules.json: the numbers combat.js used to carry inline (Dom's rule: no tuning values in code). `legacy` is the original
// non-pilot goblin game: four enemy kinds (index = kind) and the shared swing, projectile, formation and loot numbers. Seconds, metres,
// degrees; `moveSpeed` is metres per second.
const legacyKind = ["hp", "radius", "damage", "swingRadius", "swingArc", "windupSeconds", "recoverSeconds", "readySeconds", "moveSpeed"];
export function validateCombatRules(d) {
  closed(d, [
    "schema_version",
    "hitFlashSeconds",
    "player",
    "startingPistol",
    "bodyRadius",
    "safehouseBodyPadding",
    "aim",
    "movement",
    "awareness",
    "spawning",
    "enemyAI",
    "reactions",
    "legacy",
  ]);
  number("combatRules", "hitFlashSeconds", d.hitFlashSeconds, 0.01);
  number("combatRules", "bodyRadius", d.bodyRadius, 0.01);
  number("combatRules", "safehouseBodyPadding", d.safehouseBodyPadding, 0);
  const flat = (name, fields) => {
    closed(d[name], fields);
    for (const f of fields) number("combatRules", `${name}.${f}`, d[name][f], 0);
  };
  flat("aim", ["targetConeDegrees", "mobSizeReachFactor"]);
  if (d.aim.targetConeDegrees >= 90) fail("combatRules", "aim.targetConeDegrees must be below 90");
  flat("movement", ["sidestepFraction", "patrolArrive", "patrolMove", "returnArrive", "homeLeash"]);
  flat("awareness", ["ratContactDistance", "sightDistance"]);
  flat("enemyAI", [
    "goblinSpeedFactor",
    "attackSpacing",
    "knifeAimDot",
    "animalBiteAimDot",
    "animalBiteReach",
    "animalContactReach",
    "ratMoveSpeed",
    "ratLowFootHeight",
  ]);
  for (const f of ["knifeAimDot", "animalBiteAimDot"])
    if (d.enemyAI[f] >= 1) fail("combatRules", `enemyAI.${f} must be below 1`);
  closed(d.player, ["radius", "damage", "spawn"]);
  for (const f of ["radius", "damage"]) number("combatRules", `player.${f}`, d.player[f], 0.01);
  closed(d.player.spawn, ["x", "z"]);
  closed(d.startingPistol, ["x", "z"]);
  for (const point of [d.player.spawn, d.startingPistol])
    for (const f of ["x", "z"]) if (!Number.isFinite(point[f])) fail("combatRules", "spawn and pistol positions must be finite");
  closed(d.spawning, ["distances", "laterals", "clearance"]);
  number("combatRules", "spawning.clearance", d.spawning.clearance, 0);
  for (const f of ["distances", "laterals"])
    if (!Array.isArray(d.spawning[f]) || !d.spawning[f].length || !d.spawning[f].every(Number.isFinite))
      fail("combatRules", `spawning.${f} must list finite numbers`);
  closed(d.reactions, ["blockImpactTicks", "defaultStaggerSeconds", "swingAssistTicks", "droneDeath", "breathStartTicks"]);
  for (const f of ["blockImpactTicks", "swingAssistTicks", "breathStartTicks"])
    count("combatRules", `reactions.${f}`, d.reactions[f], 1, 600);
  number("combatRules", "reactions.defaultStaggerSeconds", d.reactions.defaultStaggerSeconds, 0.01);
  closed(d.reactions.droneDeath, ["clip", "ticks"]);
  if (typeof d.reactions.droneDeath.clip !== "string" || !d.reactions.droneDeath.clip) fail("combatRules", "reactions.droneDeath.clip");
  count("combatRules", "reactions.droneDeath.ticks", d.reactions.droneDeath.ticks, 1, 600);
  const l = d.legacy;
  closed(l.player, [
    "bufferSeconds",
    "guardRecoverSeconds",
    "dodge",
    "walkSpeed",
    "guardMoveScale",
    "accelerate",
    "decelerate",
    "turnRate",
    "guard",
  ]);
  for (const f of ["bufferSeconds", "guardRecoverSeconds", "walkSpeed", "guardMoveScale", "accelerate", "decelerate", "turnRate"])
    number("combatRules", `legacy.player.${f}`, l.player[f], 0.001);
  closed(l.player.dodge, ["seconds", "invulnerableSeconds", "cooldownSeconds", "speed"]);
  for (const [f, v] of Object.entries(l.player.dodge)) number("combatRules", `legacy.player.dodge.${f}`, v, 0.001);
  closed(l.player.guard, ["arc", "parryWindowSeconds", "regenPerSecond", "blockedDamageFactor", "brokenSeconds", "parryStunSeconds"]);
  for (const [f, v] of Object.entries(l.player.guard)) number("combatRules", `legacy.player.guard.${f}`, v, 0);
  number("combatRules", "legacy.waveClearHeal", l.waveClearHeal, 0);
  number("combatRules", "legacy.hitKnockback", l.hitKnockback, 0);
  closed(l, [
    "player",
    "waveClearHeal",
    "hitKnockback",
    "kinds",
    "wideSwing",
    "alertDistance",
    "rangedReach",
    "reachSlack",
    "aimDot",
    "swingSeconds",
    "boltSpeed",
    "boltHitRadius",
    "formation",
    "loot",
  ]);
  if (!Array.isArray(l.kinds) || l.kinds.length !== 4) fail("combatRules", "legacy.kinds must list the four enemy kinds");
  l.kinds.forEach((row, i) => {
    closed(row, legacyKind);
    for (const f of legacyKind) number("combatRules", `legacy.kinds[${i}].${f}`, row[f], f === "hp" || f.endsWith("Seconds") ? 0.01 : 0);
  });
  closed(l.wideSwing, ["radius", "arc"]);
  number("combatRules", "legacy.wideSwing.radius", l.wideSwing.radius, 0.01);
  number("combatRules", "legacy.wideSwing.arc", l.wideSwing.arc, 1);
  for (const f of ["alertDistance", "rangedReach", "reachSlack", "swingSeconds", "boltSpeed", "boltHitRadius"])
    number("combatRules", `legacy.${f}`, l[f], 0.001);
  number("combatRules", "legacy.aimDot", l.aimDot, 0);
  if (l.aimDot >= 1) fail("combatRules", "legacy.aimDot must be below 1");
  closed(l.formation, ["columns", "xSpacing", "zSpacing"]);
  count("combatRules", "legacy.formation.columns", l.formation.columns, 1, 20);
  number("combatRules", "legacy.formation.xSpacing", l.formation.xSpacing, 0);
  number("combatRules", "legacy.formation.zSpacing", l.formation.zSpacing, 0);
  closed(l.loot, ["pickupRadius", "blade", "armour", "tonic"]);
  number("combatRules", "legacy.loot.pickupRadius", l.loot.pickupRadius, 0.01);
  for (const kind of ["blade", "armour", "tonic"]) {
    closed(l.loot[kind], ["base", "step"]);
    number("combatRules", `legacy.loot.${kind}.base`, l.loot[kind].base, 0);
    number("combatRules", `legacy.loot.${kind}.step`, l.loot[kind].step, 0);
  }
}
