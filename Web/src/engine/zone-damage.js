// Flag-off ?zones=1 zone damage for trash mobs, facing-driven: a hit from behind or the flank scales damage, a hit from the front is x1.
// Bosses are skipped (x1) and will use per-part hit boxes through the TODO hook named in the row: bossZoneHook (not built).
import { GAME_DATA } from "./game-data.js";

const CFG = GAME_DATA.zoneDamage;
const RAD = Math.PI / 180;
const FRONT_COS = Math.cos(CFG.arcs.frontHalfDeg * RAD); // shooter inside this cone around the target's facing = front
const BACK_COS = -Math.cos(CFG.arcs.backHalfDeg * RAD); // shooter inside the opposite cone = back

let flag = null; // read once: the off path allocates nothing per hit
export const zoneDamageEnabled = (search) =>
  search === undefined
    ? (flag ??= new URLSearchParams(globalThis.location?.search ?? "").get(CFG.flagParam) === CFG.flagValue)
    : new URLSearchParams(search).get(CFG.flagParam) === CFG.flagValue;

// targetFacing and shotDirection are {x, z} (shot direction = the way the hit travels); kind is the enemy kind.
// Returns the damage multiplier: 1 when the flag is off, for a boss kind, or for a degenerate vector.
export function zoneMultiplier(targetFacing, shotDirection, kind, enabled = flag ?? zoneDamageEnabled()) {
  if (!enabled || !targetFacing || !shotDirection || CFG.bosses.includes(kind)) return 1;
  const fl = Math.hypot(targetFacing.x, targetFacing.z),
    sl = Math.hypot(shotDirection.x, shotDirection.z);
  if (!(fl > 0) || !(sl > 0)) return 1;
  // Cosine between the target's facing and the direction from the target back toward the shooter.
  const c = -(targetFacing.x * shotDirection.x + targetFacing.z * shotDirection.z) / (fl * sl);
  const m = c >= FRONT_COS ? CFG.multiplier.front : c <= BACK_COS ? CFG.multiplier.back : CFG.multiplier.flank;
  return m > CFG.cap ? CFG.cap : m;
}
