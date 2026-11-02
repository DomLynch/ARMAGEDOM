// Leaf module: the enemy record, the shared id counter and the direction test that combat.js, area-residents.js and
// mobile-control.js all need. It imports data only, never combat.js, so those modules do not form an import cycle.
import { GAME_DATA } from "./game-data.js";
// The original goblin game's numbers: data/combatRules.json `legacy`.
const LEGACY = GAME_DATA.combatRules.legacy;
export const legacyKind =(kind) => LEGACY.kinds[kind] ?? LEGACY.kinds[0];
export const mag = (v) => Math.hypot(v.x, v.z);
// Numerical dead zone, not tuning: below this a direction counts as nothing.
export const NEGLIGIBLE_DISTANCE = 0.001; // tuning-ok: numerical dead zone for a direction
export const validDirection = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.z) && mag(v) > NEGLIGIBLE_DISTANCE;
// One id sequence for enemies, loot and bolts, so every record in a run has a distinct id.
let serial = 0;
export const nextSerial = () => ++serial;
export function enemy(kind, pos) {
  const hp = LEGACY.kinds[kind]?.hp;
  return {
    id: nextSerial(),
    kind,
    pos: { ...pos },
    facing: { x: 0, z: -1 },
    hp,
    maxHP: hp,
    radius: legacyKind(kind).radius,
    ready: 0,
    recoverUntil: 0,
    staggerUntil: 0,
    alerted: false,
    pattern: 0,
    swing: null,
    flashUntil: 0,
  };
}
