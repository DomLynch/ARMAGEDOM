// safehouseText.json: the English the safehouse locker panel and the marked cash-and-supplies panel show (labels, buttons,
// status lines, aria-labels, weapon and supply names). `{name}` style placeholders are filled by fillText. The validator lives
// here so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const text = (field, v, placeholders = []) => {
  if (typeof v !== "string" || !v.trim()) fail("safehouseText", `${field} must be non-empty text`);
  const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (used.length !== placeholders.length || placeholders.some((p) => !used.includes(p)))
    fail("safehouseText", `${field} must use exactly the placeholders ${placeholders.map((p) => `{${p}}`).join(" ") || "(none)"}`);
};

// One section: each text key with its {placeholders}, then each name table with its closed id list.
const section = (field, row, keys, tables) => {
  closed(row, [...Object.keys(keys), ...Object.keys(tables)]);
  for (const [k, placeholders] of Object.entries(keys)) text(`${field}.${k}`, row[k], placeholders);
  for (const [table, ids] of Object.entries(tables)) {
    closed(row[table], ids);
    for (const id of ids) text(`${field}.${table}.${id}`, row[table][id]);
  }
};

export function validateSafehouseText(d) {
  closed(d, ["schema_version", "safehouse", "marked"]);
  // Each key with the {placeholders} its text must use.
  const safehouse = {
    interactAria: [], interactLabel: [], statusUnavailable: [], statusReady: [], saveUnavailable: [], transferUnavailable: [],
    amountUnavailable: [], weaponRow: ["name", "state"], stored: [], equipped: [], carried: [], store: [], retrieve: [],
    resourceRow: ["title", "carried", "stored"], amountAria: ["title"],
  };
  const weaponNames = [
    "westminster-start-pistol-v1", "bridge-warden-rifle-v1", "flamethrower-area8-v1", "hale-pitborn-cleaver-v1",
    "south-stalker-shotgun-v1", "standard-grenade-v1", "surgeons-knife-v1", "borough-butchers-rocket-launcher-v1",
    "watchmans-pistol-v1", "borough-marshals-pistol-v1",
  ];
  const resourceNames = [
    "railgun-reserve", "pistol-reserve", "rifle-reserve", "shotgun-reserve", "rocket-reserve", "grenade-charges", "flame-fuel",
  ];
  section("safehouse", d.safehouse, safehouse, { weaponNames, resourceNames });
  const marked = {
    saveUnavailable: [], purchaseUnavailable: [], title: [], bank: [], hint: [], summary: ["carried", "bank"],
    bountySuffix: ["bounty"], shopButton: ["name", "amount", "unit", "price"], healUnit: [], roundsUnit: [],
    statusUnavailable: [], statusReady: [],
  };
  section("marked", d.marked, marked, { shopNames: ["pistol", "rifle", "dressing"] });
}
