import { GAME_DATA } from "./engine/game-data.js";
// Optional source preset. Art supplies bodyScale and the matched donor path rig;
// this file does not approve an asset or silently substitute Goblin proportions.
// The numbers live in Web/src/data/creatures.json `hollowTuning`.
export const HOLLOW_TUNING = GAME_DATA.creatures.hollowTuning;
const BOUNDS = GAME_DATA.creatures.hollowBounds; // creatures.json hollowBounds: the ranges an encounter's values must stay inside
export function createHollowEncounter(character, tuning = {}) {
  if (
    character?.rig !== "hollow-scavenger" ||
    character.weapon !== "knife" ||
    !["hero", "goblin"].includes(character.contactRig) ||
    !Number.isFinite(character.bodyScale) ||
    character.bodyScale <= 0 ||
    character.bodyScale > BOUNDS.bodyScaleMax
  )
    throw Error("Hollow requires a matched knife character descriptor with source bodyScale/contactRig");
  const values = Object.fromEntries(
    Object.entries(HOLLOW_TUNING).map(([key, value]) => [key, tuning[key] === undefined ? value : tuning[key]]),
  );
  if (!Number.isInteger(values.count) || values.count < BOUNDS.count[0] || values.count > BOUNDS.count[1])
    throw Error("Hollow encounter supports3–5 copies");
  for (const [key, [min, max]] of Object.entries(BOUNDS.ranges))
    if (!Number.isFinite(values[key]) || values[key] < min || values[key] > max) throw Error(`Invalid Hollow ${key}`);
  return Object.freeze({ id: "hollow-scavengers", character: Object.freeze({ ...character }), ...values });
}
