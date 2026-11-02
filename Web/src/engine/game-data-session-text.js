// sessionText.json: the player-facing English of the browser session, the run notices, the expedition panel and the account control.
// One group per owner, one string per key, {placeholder} for each value filled in at the call.
// The validator lives here so the loader (engine/game-data.js) stays small; game-data.js re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

/** The placeholder names a string uses, in order ({name}); a stray brace is an error. */
export function placeholders(text) {
  const names = [...text.matchAll(/\{([A-Za-z]+)\}/g)].map((match) => match[1]);
  if (text.replace(/\{[A-Za-z]+\}/g, "").match(/[{}]/)) fail("sessionText", `a stray brace in "${text}"`);
  return names;
}

export function validateSessionText(d) {
  const groups = ["browser", "run", "expedition", "areaObjective", "account"];
  closed(d, ["schema_version", ...groups]);
  for (const group of groups) {
    const rows = d[group];
    if (!rows || typeof rows !== "object" || Array.isArray(rows) || !Object.keys(rows).length) fail("sessionText", `${group} must be a non-empty object`);
    for (const [key, text] of Object.entries(rows)) {
      if (!/^[a-z][A-Za-z0-9-]*$/.test(key)) fail("sessionText", `${group}.${key} is not a plain key`);
      if (typeof text !== "string" || !text) fail("sessionText", `${group}.${key} must be a non-empty string`);
      placeholders(text);
    }
  }
}
