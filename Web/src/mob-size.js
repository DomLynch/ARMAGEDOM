import { GAME_DATA } from "./engine/game-data.js";
// The approved size factors are creatures.json `mobSize.factors`.
const factors = GAME_DATA.creatures.mobSize.factors;

// Derive once from the unmodified spawn profile, never from a resized actor.
// Native blades use combatScale; capsules use combatScale * bodyScale.
// Scaling bodyScale too would double-size the capsule but not the blade.
export function mobSizeProfile(base, factor) {
  if (
    !factors.includes(factor) ||
    !base ||
    !["bodyScale", "combatScale", "radius"].every((key) => Number.isFinite(base[key]) && base[key] > 0)
  )
    throw RangeError("Mob size requires a positive baseline and approved factor");
  const profile = { bodyScale: base.bodyScale, combatScale: base.combatScale * factor, radius: base.radius * factor };
  if (!Object.values(profile).every(Number.isFinite)) throw RangeError("Mob size overflow");
  return profile;
}
