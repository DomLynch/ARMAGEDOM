import { closed } from "./content-schema.js";
// Player-facing text lives in data (visual.json) as plain strings with {placeholders}. fillText swaps each {name} for its value;
// checkTemplate is what the data validators call, so a typo or a missing placeholder fails at load instead of showing "{ara}" on screen.
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;
export function fillText(template, values) {
  return template.replace(PLACEHOLDER, (_, name) => String(values[name]));
}
export function checkTemplate(field, template, allowed, fail, required = []) {
  if (typeof template !== "string" || !template.trim()) fail(`${field} must be a non-empty string`);
  const used = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
  for (const name of used) if (!allowed.includes(name)) fail(`${field} uses {${name}}, allowed: ${allowed.join(", ") || "none"}`);
  for (const name of required) if (!used.includes(name)) fail(`${field} must contain {${name}}`);
  if (template.replace(PLACEHOLDER, "").match(/[{}]/)) fail(`${field} has a stray brace`);
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
