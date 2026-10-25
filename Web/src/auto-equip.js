import { GAME_DATA } from "./engine/game-data.js";

// Dom, 25 Oct 2026: "anytime you pick up a new weapon, it replaces the weapon you have, because newbies won't know to change their
// weapon". A weapon the player did not carry becomes the active one the moment it is collected; the old weapon stays carried (equipping
// never drops anything). The switch is the weapon's own Equip action, so asset loading, ammo and the saved selection behave exactly as
// when the player presses Equip in Gear. Ammo pickups for a weapon already carried never come through here. Rule in weapons.json
// `autoEquipOnFirstPickup`. Emits {type: "auto-equip", itemId} on g.events once the weapon is active, for the HUD (tile flash, prompt).
export async function autoEquipAfterClaim(g, { equip, active, itemId }) {
  if (GAME_DATA.weapons.autoEquipOnFirstPickup !== true) return false;
  await equip();
  if (!active()) return false;
  g.events.push({ type: "auto-equip", itemId });
  return true;
}
