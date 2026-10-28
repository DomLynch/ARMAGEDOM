// Flag-off ?zones=1 zone damage, 360 degrees: every hit lands. An impact zone (head / torso / legs) sets the multiplier and the target's
// facing only adds a bonus on top (front x1, flank and back more); the product is capped. All numbers live in zoneDamage.json.
// Bosses are skipped (x1, no zone) and will use per-part hit boxes through the TODO hook named in the row: bossZoneHook (not built).
import { GAME_DATA } from "./game-data.js";

const CFG = GAME_DATA.zoneDamage;
const RAD = Math.PI / 180;
const FB = CFG.facingBonus;
const FRONT_COS = Math.cos(FB.arcs.frontHalfDeg * RAD); // shooter inside this cone around the target's facing = front
const BACK_COS = -Math.cos(FB.arcs.backHalfDeg * RAD); // shooter inside the opposite cone = back
const ZONES = Object.keys(CFG.zones);
// Per weight key: the zone names with a weight, in row order, plus their total, built once so a roll allocates nothing.
const TABLES = new Map(
  Object.entries(CFG.weights).map(([key, w]) => [
    key,
    { w: ZONES.map((z) => w[z]), total: ZONES.reduce((n, z) => n + w[z], 0) },
  ]),
);

let flag = null; // read once: the off path allocates nothing per hit
export const zoneDamageEnabled = (search) =>
  search === undefined
    ? (flag ??= new URLSearchParams(globalThis.location?.search ?? "").get(CFG.flagParam) === CFG.flagValue)
    : new URLSearchParams(search).get(CFG.flagParam) === CFG.flagValue;

// Deterministic unit roll in [0, 1): a stateless integer hash of the row seed, the game tick and the target id (no Math.random, no hidden state).
// The game has no shared rng, so the tick and id are the repeatable key; the same fight replays the same zones.
export function zoneRoll(seed, tick, id) {
  let t = (seed + Math.imul(tick | 0, 0x9e3779b1) + Math.imul(id | 0, 0x85ebca6b)) >>> 0; // tuning-ok: integer hash constants
  t = Math.imul(t ^ (t >>> 15), t | 1); // tuning-ok: mulberry32 mix
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // tuning-ok: mulberry32 mix
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // tuning-ok: 2^32
}

// The zone a hit lands in, or null when the flag is off or the target is a boss (no zone, damage stays x1).
// supplied = shot.aimZone ?? shot.impact?.zone when the shot knows where it hit; weaponKey/classKey/(swing kind) pick the weight row.
export function pickZone(g, target, weaponKey, classKey, supplied, enabled = flag ?? zoneDamageEnabled()) {
  if (!enabled || CFG.bosses.includes(target.kind)) return null;
  if (supplied !== undefined && supplied !== null && CFG.zones[supplied]) return supplied;
  const table = TABLES.get(weaponKey) ?? TABLES.get(classKey) ?? TABLES.get("default");
  if (!(table.total > 0)) return ZONES[0];
  let r = zoneRoll(CFG.seed, g.tick ?? Math.round(g.time * 1000), target.id) * table.total; // tuning-ok: seconds to ms key
  for (let i = 0; i < ZONES.length; i++) {
    r -= table.w[i];
    if (r < 0) return ZONES[i];
  }
  return ZONES[ZONES.length - 1];
}

// Damage multiplier for a picked zone: zone multiplier x facingBonus, capped. Never 0 for a valid zone; a null zone (flag off, boss) is 1.
// targetFacing and shotDirection are {x, z} (shot direction = the way the hit travels). Missing or zero vectors give no facing bonus.
export function zoneMultiplier(targetFacing, shotDirection, zone) {
  if (zone === null || zone === undefined) return 1;
  let m = CFG.zones[zone].multiplier;
  if (targetFacing && shotDirection) {
    const fl = Math.hypot(targetFacing.x, targetFacing.z),
      sl = Math.hypot(shotDirection.x, shotDirection.z);
    if (fl > 0 && sl > 0) {
      // Cosine between the target's facing and the direction from the target back toward the shooter.
      const c = -(targetFacing.x * shotDirection.x + targetFacing.z * shotDirection.z) / (fl * sl);
      m *= c >= FRONT_COS ? FB.front : c <= BACK_COS ? FB.back : FB.flank;
    }
  }
  return m > CFG.cap ? CFG.cap : m;
}
