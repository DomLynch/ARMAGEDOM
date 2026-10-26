import { closed } from "./content-schema.js";
import { PLACEHOLDER } from "../text-fill.js";
// checkTemplate is what the data validators call (the words are filled by ../text-fill.js): a typo or a missing placeholder fails at
// load instead of showing "{ara}" on screen.
export function checkTemplate(field, template, allowed, fail, required = []) {
  if (typeof template !== "string" || !template.trim()) fail(`${field} must be a non-empty string`);
  const used = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
  for (const name of used) if (!allowed.includes(name)) fail(`${field} uses {${name}}, allowed: ${allowed.join(", ") || "none"}`);
  for (const name of required) if (!used.includes(name)) fail(`${field} must contain {${name}}`);
  if (template.replace(PLACEHOLDER, "").match(/[{}]/)) fail(`${field} has a stray brace`);
}
// visual.json `areaNames`: names that differ from the id's own words, and the form an areaN id takes (area-registry.js).
export function validateAreaNames(n) {
  const fail = (why) => {
    throw TypeError(`Invalid game data visual: areaNames.${why}`);
  };
  closed(n, ["overrides", "numbered"]);
  checkTemplate("numbered", n.numbered, ["number"], fail, ["number"]);
  if (!n.overrides || typeof n.overrides !== "object" || Array.isArray(n.overrides)) fail("overrides must be an object");
  for (const [id, name] of Object.entries(n.overrides)) {
    if (!/^[a-z0-9-]+$/.test(id)) fail(`overrides key ${id} must be an area id`);
    checkTemplate(`overrides.${id}`, name, [], fail);
  }
}
// visual.json `travelText`: what the player reads while an area change runs, fails or is locked (engine/areas.js).
export function validateTravelText(t) {
  const fail = (why) => {
    throw TypeError(`Invalid game data visual: travelText.${why}`);
  };
  closed(t, ["travelling", "recoveryFailed", "loadFailed"]);
  checkTemplate("travelling", t.travelling, ["area"], fail, ["area"]);
  checkTemplate("recoveryFailed", t.recoveryFailed, [], fail);
  checkTemplate("loadFailed", t.loadFailed, [], fail);
}
