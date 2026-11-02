// Turns Combat's exports (Web/src/engine/world-events.js: worldSpawnRows(content), weaponRules()) into what the Backend consumes:
//   spawns.json   { [instance]: { kind, area, maxHp } }       read by the writer (spawnRowsFrom)
//   weapon rows   [weapon, maxDamagePerHit, maxHitsPerS]       inserted into arma_weapon_rules
// It never invents a value. A null, a non-finite number, a duplicate or a name the database would reject throws, so a gap in the
// game data stops the load instead of becoming a default the referee then trusts. Pure: no file or database access.
import { ATTRIBUTE_IDS, pilotBonuses } from "../../Web/src/engine/progression-rules.js";

const INSTANCE = /^[a-z0-9._:-]{1,96}$/;
const KIND = /^[a-z0-9._:-]{1,64}$/;
const AREA = /^[a-z][a-z0-9.-]{0,31}$/;
const WEAPON = /^[a-z0-9._:-]{1,64}$/;
const ITEM = /^[a-z0-9._:-]{1,120}$/;

const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

export function buildSpawns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("spawn rows: expected a non-empty array");
  const spawns = Object.create(null);
  for (const row of rows) {
    const { instance, kind, area, maxHp } = row ?? {};
    const where = `spawn row ${JSON.stringify(instance)}`;
    if (typeof instance !== "string" || !INSTANCE.test(instance)) throw new Error(`${where}: bad instance`);
    if (typeof kind !== "string" || !KIND.test(kind)) throw new Error(`${where}: bad kind ${JSON.stringify(kind)}`);
    if (typeof area !== "string" || !AREA.test(area)) throw new Error(`${where}: bad area ${JSON.stringify(area)}`);
    if (!positive(maxHp)) throw new Error(`${where}: maxHp must be a positive number, got ${JSON.stringify(maxHp)}`);
    if (instance in spawns) throw new Error(`${where}: duplicate instance`);
    spawns[instance] = { kind, area, maxHp };
  }
  return Object.fromEntries(Object.entries(spawns).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function buildWeaponRows(rules) {
  if (!Array.isArray(rules) || rules.length === 0) throw new Error("weapon rules: expected a non-empty array");
  const seen = new Set();
  return rules.map((rule) => {
    const { weaponId, maxDamagePerHit, maxHitsPerS } = rule ?? {};
    const where = `weapon rule ${JSON.stringify(weaponId)}`;
    if (typeof weaponId !== "string" || !WEAPON.test(weaponId)) throw new Error(`${where}: bad weapon id`);
    if (seen.has(weaponId)) throw new Error(`${where}: duplicate weapon`);
    seen.add(weaponId);
    if (!positive(maxDamagePerHit)) throw new Error(`${where}: maxDamagePerHit must be a positive number, got ${JSON.stringify(maxDamagePerHit)}`);
    if (!positive(maxHitsPerS)) throw new Error(`${where}: maxHitsPerS must be a positive number, got ${JSON.stringify(maxHitsPerS)}`);
    return [weaponId, maxDamagePerHit, maxHitsPerS];
  });
}

/** Every weapon id a `hit` can carry must have a rule row, or the database could not clamp that weapon. */
export function checkWeaponCoverage(weaponIds, weaponRows) {
  const have = new Set(weaponRows.map(([weapon]) => weapon));
  const missing = weaponIds.filter((id) => !have.has(id));
  if (missing.length) throw new Error(`no weapon rule for: ${missing.join(", ")}`);
}

// The weapon tables hold BASE damage; effectiveWeaponDamage multiplies a hit by the progression bonus at hit time. A cap that ignores
// that bonus would refuse a fully mastered hit, so each cap is base x the largest multiplier the progression rows allow.
// The progression rules name the starting pistol by item id; the weapon table calls it "pistol".
const PROGRESSION_WEAPON_ID = Object.freeze({ pistol: "westminster-start-pistol-v1" });
// pilotBonuses accepts attributes 10..20 and a score up to data.scoreCap; the largest multiplier is every attribute at 20 and a full score.
const MAX_ATTRIBUTES = Object.freeze(Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 20])));

/** The largest damage multiplier the progression rows can give this weapon-table id (1 for weapons with no mastery). */
export function maxProgressionMultiplier(progression, weaponId) {
  const id = PROGRESSION_WEAPON_ID[weaponId] ?? weaponId;
  if (!Object.hasOwn(progression.weapons, id)) return 1;
  return pilotBonuses(progression, MAX_ATTRIBUTES, id, progression.scoreCap).damageMultiplier;
}

/**
 * The weapons a PLAYER can use. The rules table also lists creature attacks ("teeth", "bolt"); those get no row in the database, so a
 * phone that claims one has its hit refused ("weapon") instead of being clamped to a creature's damage.
 */
export const PLAYER_WEAPONS = Object.freeze(["knife", "bone-saw", "pistol", "rifle", "shotgun", "grenade", "rocket", "railgun", "flamethrower"]);

/** The rows the database is seeded with: player weapons only, each damage cap raised to base x the max progression multiplier. */
export function seedWeaponRows(rules, progression) {
  const rows = buildWeaponRows(rules).filter(([weapon]) => PLAYER_WEAPONS.includes(weapon));
  const missing = PLAYER_WEAPONS.filter((id) => !rows.some(([weapon]) => weapon === id));
  if (missing.length) throw new Error(`no weapon rule for player weapon: ${missing.join(", ")}`);
  return applyProgressionCeiling(rows, progression);
}

/**
 * [kind, cash] for every creature kind the game spawns: a boss's model pays marked.bossCash, every other kind marked.cashPerKill.
 * `bossKinds` is the set of boss modelRefs (a spawn row's kind is the boss's modelRef). The bounty is cut: it has no row.
 */
export function seedPayoutRows(spawnRows, bossKinds, marked) {
  for (const key of ["cashPerKill", "bossCash"])
    if (!Number.isSafeInteger(marked?.[key]) || marked[key] < 0) throw new Error(`marked.${key} is not a whole number of cash`);
  const kinds = [...new Set(spawnRows.map((row) => row.kind))].sort();
  if (!kinds.length) throw new Error("payout rows: no spawn rows");
  for (const kind of kinds) if (typeof kind !== "string" || !KIND.test(kind)) throw new Error(`payout rows: bad kind ${JSON.stringify(kind)}`);
  return kinds.map((kind) => [kind, bossKinds.has(kind) ? marked.bossCash : marked.cashPerKill]);
}

/**
 * The always-drop weapon rows the settle rolls: [lootKey, slot, item, chance]. The loot key is the spawn INSTANCE ("area:placement"), because the game
 * names unique drops by (area, placement) and one creature kind ("hollow-scavenger") is shared by placements with different drops. `sources` is
 * [{ areaId, placementKey, itemId }] taken from the game's data (boss equipment, rifle, unique reward); every source must name a real spawn row, so a
 * typo or a moved placement stops the load instead of becoming a drop nobody can earn. Consumables (rounds, dressing, vest) are not seeded.
 */
export function seedLootRows(spawnRows, sources) {
  const instances = new Set(spawnRows.map((row) => row.instance));
  const slots = new Map(),
    rows = [];
  for (const { areaId, placementKey, itemId } of sources) {
    const lootKey = `${areaId}:${placementKey}`;
    if (!instances.has(lootKey)) throw new Error(`loot source ${lootKey} is not a spawn row`);
    if (typeof itemId !== "string" || !ITEM.test(itemId)) throw new Error(`loot source ${lootKey}: bad item ${JSON.stringify(itemId)}`);
    const slot = slots.get(lootKey) ?? 0;
    slots.set(lootKey, slot + 1);
    rows.push([lootKey, slot, itemId, 1]);
  }
  return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
}

/** [recordPath, item] for every always-drop weapon: where a save record keeps it and the loot item that is its receipt. Each path and item appears once. */
export function seedItemSources(sources) {
  const seen = new Set(),
    items = new Set();
  return sources
    .map(({ path, itemId }) => {
      if (typeof path !== "string" || !/^[A-Za-z]+(\.[A-Za-z]+)?$/.test(path)) throw new Error(`item source: bad record path ${JSON.stringify(path)}`);
      if (typeof itemId !== "string" || !ITEM.test(itemId)) throw new Error(`item source ${path}: bad item ${JSON.stringify(itemId)}`);
      if (seen.has(path) || items.has(itemId)) throw new Error(`item source ${path}: duplicate path or item`);
      seen.add(path);
      items.add(itemId);
      return [path, itemId];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Weapon rows ([weapon, maxDamagePerHit, maxHitsPerS]) with each damage cap raised to base x the max progression multiplier. */
export function applyProgressionCeiling(weaponRows, progression) {
  for (const id of Object.keys(progression.weapons))
    if (!weaponRows.some(([weapon]) => (PROGRESSION_WEAPON_ID[weapon] ?? weapon) === id)) throw new Error(`progression weapon ${id} has no weapon rule`);
  return weaponRows.map(([weapon, damage, rate]) => [weapon, damage * maxProgressionMultiplier(progression, weapon), rate]);
}
