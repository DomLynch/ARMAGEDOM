// Keyboard weapon switch order: the carried weapon after the active one in tile order, wrapping. The Reaper
// companion is a deploy/recall toggle, not a weapon, so the cycle skips it. Null when there is nothing to switch to.
export function nextCarriedWeapon(rows) {
  const weapons = rows.filter((row) => !row.companion);
  if (weapons.length < 2) return null;
  return weapons[(weapons.findIndex((row) => row.active) + 1) % weapons.length];
}
