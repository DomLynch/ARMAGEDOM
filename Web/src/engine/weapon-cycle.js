// Keyboard weapon switch order: the carried weapon after the active one in tile order, wrapping. The Reaper
// companion is a deploy/recall toggle, not a weapon, so the cycle skips it. Null when there is nothing to switch to.
export function nextCarriedWeapon(rows, step = 1) {
  const weapons = rows.filter((row) => !row.companion);
  if (weapons.length < 2) return null;
  return weapons[(weapons.findIndex((row) => row.active) + step + weapons.length) % weapons.length];
}
// The nth carried weapon (1-based, tile order, companion skipped), or null when you do not carry that many or it is already active.
export function carriedWeaponAt(rows, slot) {
  const weapon = rows.filter((row) => !row.companion)[slot - 1];
  return weapon && !weapon.active ? weapon : null;
}
