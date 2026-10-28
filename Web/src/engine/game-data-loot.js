// loot.json: rare drops and the inventory strip. The server rolls the loot (it comes back with the kill credit); this file holds only how the
// client shows it: toast text, glint ring, the strip's slot count, and a local fallback look for each known item id (the server's item
// table, when it answers, overrides name, kind, rarity and prices). engine/loot.js runs it, engine/inventory-view.js draws it.
import { closed } from "./content-schema.js";
import { checkTemplate } from "./text-template.js";
import { count, fail, number } from "./game-data-checks.js";

const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("loot", `${field} must be six hex digits`);
};
export function validateLoot(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "ops",
    "badgeChars",
    "slots",
    "toastSeconds",
    "kinds",
    "glint",
    "rarities",
    "defaultRarity",
    "defaultKind",
    "items",
    "text",
  ]);
  if (typeof d.enabled !== "boolean") fail("loot", "enabled must be true or false");
  if (!/^[a-z]{3,16}$/.test(d.offSwitch)) fail("loot", "offSwitch must be a short lowercase word");
  closed(d.ops, ["inventory", "items"]);
  for (const [k, v] of Object.entries(d.ops)) if (!/^[a-z_]{3,32}$/.test(v)) fail("loot", `ops.${k}`);
  count("loot", "slots", d.slots, 1, 12);
  number("loot", "toastSeconds", d.toastSeconds, 0.5);
  if (!Array.isArray(d.kinds) || !d.kinds.length) fail("loot", "kinds must be a list");
  closed(d.glint, ["seconds", "radiusFrom", "radiusTo", "width", "lift", "segments", "tilt", "colour", "opacity"]);
  for (const k of ["seconds", "radiusFrom", "radiusTo", "width", "lift", "opacity"]) number("loot", `glint.${k}`, d.glint[k], 0);
  number("loot", "glint.tilt", d.glint.tilt, -Infinity);
  count("loot", "badgeChars", d.badgeChars, 1, 4);
  count("loot", "glint.segments", d.glint.segments, 8, 128);
  hex("glint.colour", d.glint.colour);
  for (const [k, v] of Object.entries(d.rarities)) hex(`rarities.${k}`, v);
  if (!Object.hasOwn(d.rarities, d.defaultRarity)) fail("loot", "defaultRarity must be a rarity");
  if (!d.kinds.includes(d.defaultKind)) fail("loot", "defaultKind must be a kind");
  for (const [itemId, row] of Object.entries(d.items)) {
    closed(row, ["name", "badge", "colour", "rarity", "kind", "flavour"]);
    if (!/^[a-z0-9-]{1,32}$/.test(itemId)) fail("loot", `item id ${itemId}`);
    if (!row.name || !row.flavour || !/^[A-Z]{2}$/.test(row.badge)) fail("loot", `items.${itemId} text`);
    hex(`items.${itemId}.colour`, row.colour);
    if (!Object.hasOwn(d.rarities, row.rarity) || !d.kinds.includes(row.kind)) fail("loot", `items.${itemId} rarity or kind`);
  }
  const bad = (why) => fail("loot", why),
    shapes = { toast: ["name", "qty"], slotAria: ["name", "qty"], qty: ["qty"], more: ["count"], sellValue: ["value"], kindRarity: ["kind", "rarity"] };
  for (const [k, v] of Object.entries(d.text)) checkTemplate(`text.${k}`, v, shapes[k] ?? [], bad, shapes[k] ?? []);
}
