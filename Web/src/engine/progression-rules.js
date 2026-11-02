// Pure shared pilot rules. Core owns durable awards; combat owns physical eligibility.
export const ATTRIBUTE_IDS = Object.freeze(["vitality", "strength", "dexterity", "endurance", "intelligence"]);
// Every attribute starts at, and bonuses count from, this baseline: the server's arma_record_caps floor for progression.attributes.*
// (migration 000007), so it stays in code beside the shared rules (the writer imports this file); a test pins both.
export const ATTRIBUTE_BASELINE = 10; // tuning-ok: mirrors the server's record-cap floor for attributes
export const DEFAULT_ATTRIBUTES = Object.freeze(Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, ATTRIBUTE_BASELINE])));
export const DEFAULT_PROFICIENCY = Object.freeze({ knife: 0, "westminster-start-pistol-v1": 0 });
const own = (o, k) => Object.hasOwn(o, k);
const plain = (o) => o && Object.getPrototypeOf(o) === Object.prototype;
const closed = (o, keys) =>
  plain(o) &&
  Reflect.ownKeys(o).length === keys.length &&
  keys.every((k) => own(o, k)) &&
  Object.values(Object.getOwnPropertyDescriptors(o)).every((d) => "value" in d);
const bounded = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const fail = () => {
  throw new TypeError("Invalid progression pilot data");
};
export function validateProgressionPilot(input) {
  if (
    !closed(input, [
      "version",
      "killScore",
      "scoreCap",
      "damagePerPoint",
      "hpPerVitality",
      "staminaPerEndurance",
      "damagePerAttribute",
      "weapons",
    ]) ||
    input.version !== 1
  )
    fail();
  if (
    !Number.isInteger(input.killScore) ||
    !bounded(input.killScore, 1, 20) ||
    input.scoreCap !== 100 ||
    !bounded(input.damagePerPoint, 0, 0.001) ||
    !bounded(input.hpPerVitality, 0, 2) ||
    !bounded(input.staminaPerEndurance, 0, 1) ||
    !bounded(input.damagePerAttribute, 0, 0.01)
  )
    fail();
  if (!closed(input.weapons, Object.keys(DEFAULT_PROFICIENCY))) fail();
  for (const [id, row] of Object.entries(input.weapons)) {
    if (!closed(row, ["damageAttribute"]) || row.damageAttribute !== (id === "knife" ? "strength" : "dexterity"))
      fail();
  }
  return Object.freeze({
    ...input,
    weapons: Object.freeze(
      Object.fromEntries(Object.entries(input.weapons).map(([id, row]) => [id, Object.freeze({ ...row })])),
    ),
  });
}
function checkedAttributes(attributes) {
  if (
    !closed(attributes, ATTRIBUTE_IDS) ||
    !ATTRIBUTE_IDS.every((id) => Number.isInteger(attributes[id]) && bounded(attributes[id], 10, 20))
  )
    fail();
  return attributes;
}
function checkedScore(score, data) {
  if (!Number.isInteger(score) || !bounded(score, 0, data.scoreCap)) fail();
  return score;
}
export function pilotBonuses(data, attributes, weaponId, score) {
  checkedAttributes(attributes);
  checkedScore(score, data);
  if (typeof weaponId !== "string" || !own(data.weapons, weaponId)) fail();
  const attribute = attributes[data.weapons[weaponId].damageAttribute] - ATTRIBUTE_BASELINE;
  return Object.freeze({
    healthBonus: (attributes.vitality - ATTRIBUTE_BASELINE) * data.hpPerVitality,
    staminaBonus: (attributes.endurance - ATTRIBUTE_BASELINE) * data.staminaPerEndurance,
    damageMultiplier: (1 + attribute * data.damagePerAttribute) * (1 + score * data.damagePerPoint),
  });
}
// Core calls only after a real eligible positive-damage kill. It must atomically
// commit this score with the stable per-run victim ledger and whole run DTO.
// Attack eligibility, hit probability, rewards and IO are deliberately not here.
export function nextProficiencyScore(data, score) {
  checkedScore(score, data);
  return Math.min(data.scoreCap, score + data.killScore);
}
