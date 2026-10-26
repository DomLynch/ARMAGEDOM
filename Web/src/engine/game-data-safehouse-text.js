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

// A name table: id -> non-empty text. Its id set is not listed here; checkSafehouseNameIds compares it with the data that owns
// the ids once that data is loaded.
const names = (field, table) => {
  if (!table || typeof table !== "object" || Array.isArray(table) || !Object.keys(table).length)
    fail("safehouseText", `${field} must be an object of names`);
  for (const [id, name] of Object.entries(table)) text(`${field}.${id}`, name);
};

// One section: each text key with its {placeholders}, then each name table.
const section = (field, row, keys, tables) => {
  closed(row, [...Object.keys(keys), ...tables]);
  for (const [k, placeholders] of Object.entries(keys)) text(`${field}.${k}`, row[k], placeholders);
  for (const table of tables) names(`${field}.${table}`, row[table]);
};

export function validateSafehouseText(d) {
  closed(d, ["schema_version", "safehouse", "marked"]);
  // Each key with the {placeholders} its text must use.
  const safehouse = {
    interactAria: [], interactLabel: [], statusUnavailable: [], statusReady: [], saveUnavailable: [], transferUnavailable: [],
    amountUnavailable: [], weaponRow: ["name", "state"], stored: [], equipped: [], carried: [], store: [], retrieve: [],
    resourceRow: ["title", "carried", "stored"], amountAria: ["title"],
  };
  section("safehouse", d.safehouse, safehouse, ["weaponNames", "resourceNames"]);
  const marked = {
    saveUnavailable: [], purchaseUnavailable: [], title: [], bank: [], hint: [], summary: ["carried", "bank"],
    bountySuffix: ["bounty"], shopButton: ["name", "amount", "unit", "price"], healUnit: [], roundsUnit: [],
    statusUnavailable: [], statusReady: [],
  };
  section("marked", d.marked, marked, ["shopNames"]);
}

// Cross-reference: a name table must name exactly the ids its owner lists (locker.json resourceCaps for supplies, the locker's
// weapon ids for weapons), so a new locker id needs only its data row plus its name here.
export function checkSafehouseNameIds(table, ids, field) {
  const keys = Object.keys(table);
  if (keys.length !== ids.length || ids.some((id) => !Object.hasOwn(table, id)))
    fail("safehouseText", `${field} must name exactly ${ids.join(", ")}`);
}
