import { GAME_DATA } from "../game-data.js";
import { closed } from "../content-schema.js";
// The Commander match's placement, search, hit-reaction and wave numbers (engine/commander/match.js), from data/commander.json `match`.
// They are checked when this module loads; the rules beside them are checked by game-data.js. Points are fractions (0 to 1) of the
// Westminster layout; distances are metres, times seconds, `*Ticks` are 60 Hz ticks.
const fail = (why) => {
  throw TypeError(`Invalid game data commander: match.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const whole = (field, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${field} must be an integer from ${min} to ${max}`);
};
const ensurePoint = (field, p) => {
  closed(p, ["x", "y"]);
  for (const f of ["x", "y"]) if (!(p[f] >= 0 && p[f] <= 1)) fail(`${field}.${f} must be from 0 to 1`);
};
const ensureSearch = (field, s) => {
  closed(s, ["maxRing", "perRing", "ringStep", "gap"]);
  whole(`${field}.maxRing`, s.maxRing, 1, 32);
  whole(`${field}.perRing`, s.perRing, 3, 64);
  number(`${field}.ringStep`, s.ringStep, 0.001);
  number(`${field}.gap`, s.gap, 0);
};
export function validateCommanderMatch(m) {
  closed(m, [
    "spawnPoint",
    "objectivePoint",
    "wavePoint",
    "biologicalRadius",
    "spawnSearch",
    "formationSearch",
    "flashSeconds",
    "hitTicks",
    "deathTicks",
    "moveProgress",
    "bodyGap",
    "arriveDistance",
    "aggroDistance",
    "swingAfterWindup",
    "firstWaveDelay",
    "waveGap",
    "startMachines",
    "defenders",
    "defenderOffset",
    "waveCount",
    "waveSize",
  ]);
  ensurePoint("spawnPoint", m.spawnPoint);
  ensurePoint("objectivePoint", m.objectivePoint);
  ensurePoint("wavePoint", m.wavePoint);
  ensureSearch("spawnSearch", m.spawnSearch);
  ensureSearch("formationSearch", m.formationSearch);
  for (const f of ["biologicalRadius", "flashSeconds", "arriveDistance", "aggroDistance", "swingAfterWindup", "firstWaveDelay", "waveGap"])
    number(f, m[f], 0.001);
  for (const f of ["moveProgress", "bodyGap"]) number(f, m[f], 0);
  if (!(m.moveProgress <= 1)) fail("moveProgress must be at most 1");
  for (const f of ["startMachines", "defenders", "waveCount", "waveSize"]) whole(f, m[f], 0, 16);
  closed(m.defenderOffset, ["x", "z"]);
  for (const f of ["x", "z"]) if (!Number.isFinite(m.defenderOffset[f])) fail(`defenderOffset.${f} must be a finite number`);
  whole("hitTicks", m.hitTicks, 1, 3600);
  whole("deathTicks", m.deathTicks, 1, 3600);
}
validateCommanderMatch(GAME_DATA.commander.match);
export const COMMANDER_MATCH = GAME_DATA.commander.match;
