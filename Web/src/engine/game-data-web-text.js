// webText.json: the player-facing lines the Web client shows (notices, labels, button text), keyed by id, with {placeholders} for the
// changing parts. Read with webText(id, vars) from engine/web-text.js. The validator lives here so the loader (engine/game-data.js)
// stays under its size limit; game-data.js re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const ID = /^[A-Za-z][A-Za-z0-9.-]*$/;
const PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9]*\}/g;

export function validateWebText(d) {
  closed(d, ["schema_version", "texts"]);
  if (!d.texts || typeof d.texts !== "object" || Array.isArray(d.texts)) fail("webText", "texts must be an object");
  for (const [id, text] of Object.entries(d.texts)) {
    if (!ID.test(id)) fail("webText", `${id} is not a valid text id`);
    if (typeof text !== "string" || !text.trim()) fail("webText", `${id} must be a non-empty string`);
    if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) fail("webText", `${id} has a stray brace; placeholders look like {name}`);
  }
}
