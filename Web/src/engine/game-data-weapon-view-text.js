// weaponViewText.json: the English the weapon gear views show (unique reward cleaver, flamethrower, boss equipment, rifle, reaper drone):
// status lines, buttons, loading notices and pickup labels. `{name}` style placeholders are filled by fillText. The validator lives here
// so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const text = (field, v, placeholders = []) => {
  if (typeof v !== "string" || !v.trim()) fail("weaponViewText", `${field} must be non-empty text`);
  const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (used.length !== placeholders.length || placeholders.some((p) => !used.includes(p)))
    fail("weaponViewText", `${field} must use exactly the placeholders ${placeholders.map((p) => `{${p}}`).join(" ") || "(none)"}`);
};

// Each section, each key with the {placeholders} its text must use; a nested object is a closed group of keys. A function, not a
// table, so this module adds nothing to the constant-table baseline.
const spec = () => ({
  shared: { storedInSafehouse: [], pickupCollect: ["name"] },
  uniqueReward: {
    equipped: ["name"], cleaverLoadFailed: [], weaponLoadFailed: [], fallbackName: [], stateRetry: [], statePending: [],
    stateLegacyDead: [], stateOwned: ["name", "status"], storedForMelee: [], ownedEquipped: [], stateLocked: [],
    buttonStored: ["name"], button: ["action", "name"],
    actions: { loading: [], retryLoading: [], loadWeapon: [], equipped: [], equip: [], locked: [] },
    comparison: ["name", "slash", "heavy", "slashCost", "heavyCost"],
  },
  flame: {
    name: [], outOfFuel: [], loadFailed: [], ready: [], benefit: ["damage", "interval", "range"], stateLocked: ["benefit"],
    stateEmpty: [], stateOwned: ["status", "benefit", "fuel", "seconds"], statusEquipped: [], statusStored: [],
    buttonLoading: [], buttonLower: [], buttonRetry: [], buttonEmpty: [], buttonEquip: [],
  },
  bossEquipment: {
    loadFailed: [], equipped: ["name"], returned: [],
    railgunStats: ["damage", "range", "spread", "cadence", "magazine", "capacity", "reserve", "reload"],
    sawStats: ["damage", "interval"],
    shotgunStats: ["pellets", "pelletDamage", "range", "magazine", "capacity", "reserve"],
    launcherStats: ["damage", "radius", "magazine", "capacity", "reserve", "range", "speed", "reload"],
    grenadeStats: ["magazine", "range", "fuse", "radius", "throwRanges"],
    pistolStats: ["damage", "reload", "magazine", "capacity", "reserve"],
    flameStats: ["damage", "interval", "range", "fuel"],
    throwRangeSeparator: [],
    legacyPending: [], legacyUnclaimed: [], statePending: ["boss"], stateLegacyDead: ["boss"],
    stateLocked: ["boss"], buttonLoading: [], buttonRetry: [], buttonLower: [], buttonEquip: ["name"],
  },
  rifle: {
    name: [], loadFailed: [], equipped: [], returned: [], stateOwned: ["name", "damage", "magazine", "capacity", "reserve"],
    statePending: [], stateLegacyDead: [], stateLocked: [], buttonLoading: [], buttonRetry: [], buttonLower: [],
    buttonEquip: [],
  },
  reaper: { stateOwned: ["damage", "range", "cadence"], stateLocked: [], buttonRecall: [], buttonDeploy: [] },
});

const check = (path, row, spec) => {
  closed(row, Object.keys(spec));
  for (const [k, rule] of Object.entries(spec))
    if (Array.isArray(rule)) text(`${path}.${k}`, row[k], rule);
    else check(`${path}.${k}`, row[k], rule);
};

export function validateWeaponViewText(d) {
  const sections = spec();
  closed(d, ["schema_version", ...Object.keys(sections)]);
  for (const [section, rules] of Object.entries(sections)) check(section, d[section], rules);
}
