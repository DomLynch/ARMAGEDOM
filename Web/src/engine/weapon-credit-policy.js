// Exact registered attribution policies, not new proficiency families.
import { GAME_DATA } from "./game-data.js";

// The rows live in weapons.json "creditPolicies"; this is the lookup by id.
const descriptorsById = () =>
  Object.freeze(Object.fromEntries(GAME_DATA.weapons.creditPolicies.map((row) => [row.id, row])));
export const WEAPON_CREDIT_DESCRIPTORS = descriptorsById();
export function deathWeaponDescriptor(id) {
  return typeof id === "string" && Object.hasOwn(WEAPON_CREDIT_DESCRIPTORS, id) ? WEAPON_CREDIT_DESCRIPTORS[id] : null;
}
