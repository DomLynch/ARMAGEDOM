// visual.json `combatImpact` (combat-impact.js): the camera kick, hit-hold and decay of the hit feel. Presentation only: the caller keeps
// gameplay time unchanged. Called from validateVisual in game-data.js. Seconds, per-second rates, screen pixels of kick.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

export function validateCombatImpact(c) {
  closed(c, ["settleBelow", "lowEnergy", "waveRate", "holdSeconds", "kick", "decayRate", "reactionHoldSeconds"]);
  number("visual", "combatImpact.settleBelow", c.settleBelow, 0.000001);
  number("visual", "combatImpact.waveRate", c.waveRate, 0.01);
  if (!(c.lowEnergy > 0 && c.lowEnergy <= 1)) fail("visual", "combatImpact.lowEnergy must be above 0 and at most 1");
  const groups = {
    holdSeconds: ["death", "pistol", "other"],
    kick: ["death", "hit", "shot", "max"],
    decayRate: ["shotPistol", "shotOther", "camera", "reaction", "reactionKilled"],
    reactionHoldSeconds: ["hit", "killed"],
  };
  for (const [group, fields] of Object.entries(groups)) {
    closed(c[group], fields);
    for (const f of fields) number("visual", `combatImpact.${group}.${f}`, c[group][f], group === "decayRate" || group === "kick" ? 0.01 : 0);
  }
  if (c.kick.max < Math.max(c.kick.death, c.kick.hit, c.kick.shot)) fail("visual", "combatImpact.kick.max must cover the largest kick");
}
