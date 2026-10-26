import { GAME_DATA } from "./engine/game-data.js";

// Dom, 25 Oct 2026: "anytime you pick up a new weapon, it replaces the weapon you have, because newbies won't know to change their
// weapon". A weapon the player did not carry becomes the active one the moment it is collected; the old weapon stays carried (equipping
// never drops anything). The switch is the weapon's own Equip action, so asset loading, ammo and the saved selection behave exactly as
// when the player presses Equip in Gear. Ammo pickups for a weapon already carried never come through here. Rule in weapons.json
// `autoEquipOnFirstPickup`. Emits {type: "auto-equip", itemId} on g.events once the weapon is active, for the HUD (tile flash, prompt).
const autoEquip = () => GAME_DATA.weapons.autoEquipOnFirstPickup === true;

// What the claim says: with auto-equip the player is not told to go to Gear (the equipped line follows once the weapon is in hand).
export const collectedMessage = (name) => (autoEquip() ? `${name} collected.` : `${name} collected. Equip it in Gear.`);

// The Gear Equip handlers are toggles (a second press lowers the weapon, and the Ember Projector hands over to the legacy flamethrower
// handler while that is up), so the switch is asked to be raise-only: it may raise this weapon and never lowers anything.
export async function autoEquipAfterClaim(g, { equip, active, itemId, name }) {
  if (!autoEquip()) return false;
  await equip({ raiseOnly: true });
  if (!active()) return false;
  g.events.push({ type: "auto-equip", itemId });
  if (name) {
    g.message = `${name} equipped.`;
    g.messageUntil = g.time + GAME_DATA.creatures.runTimings.equipMessageSeconds;
  }
  return true;
}
