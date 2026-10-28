// shops.json (engine/shop.js): the hub NPC shop rows, the market rpc names and the words. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { checkTemplate } from "./text-template.js";
import { count, fail, id, number } from "./game-data-checks.js";

export function validateShops(d) {
  const NAMES = ["offParam", "offValue", "area", "buyTabId", "sellTabId", "keySeparator", "closeKey"];
  closed(d, ["schema_version", "note", "enabled", ...NAMES, "inventorySlots", "maxOrder", "api", "hotspot", "shops", "textVars", "text"]);
  if (typeof d.enabled !== "boolean") fail("shops", "enabled must be true or false");
  for (const name of NAMES) if (typeof d[name] !== "string" || !d[name]) fail("shops", `${name} must be a nonempty string`);
  count("shops", "inventorySlots", d.inventorySlots, 1, 12);
  count("shops", "maxOrder", d.maxOrder, 1, 999);
  closed(d.api, ["rpcPath", "timeoutMs", "authStatuses", "serverErrorFrom", "calls"]);
  if (typeof d.api.rpcPath !== "string" || !d.api.rpcPath.startsWith("/")) fail("shops", "api.rpcPath must start with /");
  number("shops", "api.timeoutMs", d.api.timeoutMs, 1);
  number("shops", "api.serverErrorFrom", d.api.serverErrorFrom, 1);
  if (!Array.isArray(d.api.authStatuses) || !d.api.authStatuses.every(Number.isInteger)) fail("shops", "api.authStatuses must be integers");
  closed(d.api.calls, ["inventory", "stock", "buy", "sell"]);
  for (const [name, value] of Object.entries(d.api.calls))
    if (!/^[a-z_]+$/.test(value)) fail("shops", `api.calls.${name} must be an rpc name`);
  closed(d.hotspot, ["heightUnits", "widthRatio", "minPx", "half"]);
  for (const [name, value] of Object.entries(d.hotspot)) number("shops", `hotspot.${name}`, value, 0);
  if (!Array.isArray(d.shops) || !d.shops.length) fail("shops", "shops must be a nonempty list");
  const seen = new Set();
  for (const row of d.shops) {
    closed(row, ["shopId", "npcId", "title", "stallLabel", "radius"]);
    id("shops", "shopId", row.shopId);
    if (seen.has(row.shopId)) fail("shops", `${row.shopId}: duplicate shopId`);
    seen.add(row.shopId);
    for (const name of ["npcId", "title", "stallLabel"])
      if (typeof row[name] !== "string" || !row[name]) fail("shops", `${row.shopId}: ${name} must be text`);
    number("shops", `${row.shopId}.radius`, row.radius, 1);
  }
  // textVars names the {placeholders} each templated line must use; every other line is plain text.
  const bad = (why) => fail("shops", why),
    { text, textVars } = d;
  for (const name of Object.keys(textVars)) if (!Object.hasOwn(text, name)) bad(`textVars.${name} has no text`);
  for (const [name, line] of Object.entries(text)) {
    if (name === "errors") continue;
    if (Object.hasOwn(textVars, name)) checkTemplate(`text.${name}`, line, textVars[name], bad, textVars[name]);
    else if (typeof line !== "string" || !line.trim()) bad(`text.${name} must be text`);
  }
  if (typeof text.errors?.refused !== "string" || typeof text.errors.offline !== "string") bad("text.errors needs refused and offline");
  for (const [code, line] of Object.entries(text.errors)) if (typeof line !== "string" || !line) bad(`text.errors.${code} must be text`);
}
