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
  uniqueReward: {
    equipped: ["name"], cleaverLoadFailed: [], weaponLoadFailed: [], fallbackName: [], stateRetry: [], statePending: [],
    stateLegacyDead: [], stateOwned: ["name", "status"], storedForMelee: [], ownedEquipped: [], stateLocked: [],
    buttonStored: ["name"], button: ["action", "name"],
    actions: { loading: [], retryLoading: [], loadWeapon: [], equipped: [], equip: [], locked: [] },
    comparison: ["name", "slash", "heavy", "slashCost", "heavyCost"], collectLabel: [],
  },
  flame: {
    name: [], outOfFuel: [], loadFailed: [], ready: [], benefit: ["damage", "interval", "range"], stateLocked: ["benefit"],
    stateEmpty: [], stateOwned: ["status", "benefit", "fuel", "seconds"], statusEquipped: [], statusStored: [], buttonStored: [],
    buttonLoading: [], buttonLower: [], buttonRetry: [], buttonEmpty: [], buttonEquip: [], collectLabel: [],
  },
  bossEquipment: {
    loadFailed: [], equipped: ["name"], returned: [],
    railgunStats: ["damage", "jumps", "range", "charge", "cadence", "magazine", "capacity", "reserve", "reload"],
    sawStats: ["damage", "interval"], legacyPending: [], legacyUnclaimed: [], statePending: ["boss"], stateLegacyDead: ["boss"],
    stateLocked: ["boss"], buttonStored: [], buttonLoading: [], buttonRetry: [], buttonLower: [], buttonEquip: ["name"],
  },
  rifle: {
    name: [], loadFailed: [], equipped: [], returned: [], stateOwned: ["name", "damage", "magazine", "capacity", "reserve"],
    statePending: [], stateLegacyDead: [], stateLocked: [], buttonStored: [], buttonLoading: [], buttonRetry: [], buttonLower: [],
    buttonEquip: [],
  },
  reaper: { stateOwned: ["damage", "range", "cadence"], stateLocked: [], buttonStored: [], buttonRecall: [], buttonDeploy: [] },
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
