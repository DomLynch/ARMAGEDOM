// Turns Combat's exports (Web/src/engine/world-events.js: worldSpawnRows(content), weaponRules()) into what the Backend consumes:
//   spawns.json   { [instance]: { kind, area, maxHp } }       read by the writer (spawnRowsFrom)
//   weapon rows   [weapon, maxDamagePerHit, maxHitsPerS]       inserted into arma_weapon_rules
// It never invents a value. A null, a non-finite number, a duplicate or a name the database would reject throws, so a gap in the
// game data stops the load instead of becoming a default the referee then trusts. Pure: no file or database access.
const INSTANCE = /^[a-z0-9._:-]{1,96}$/;
const KIND = /^[a-z0-9._:-]{1,64}$/;
const AREA = /^[a-z][a-z0-9.-]{0,31}$/;
const WEAPON = /^[a-z0-9._:-]{1,64}$/;

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
