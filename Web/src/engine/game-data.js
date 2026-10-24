// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";

export const SUPPORTED_SCHEMA_VERSION = 1;
const fail = (file, why) => {
  throw TypeError(`Invalid game data ${file}: ${why}`);
};
const count = (file, field, value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(file, `${field} must be an integer from ${min} to ${max}`);
};

export function validateDiagnostics(d) {
  closed(d, ["schema_version", "statsFramesPerLine"]);
  count("diagnostics", "statsFramesPerLine", d.statsFramesPerLine, 1, 100000);
}

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({ diagnostics: [diagnostics, validateDiagnostics] });

/**
 * Validates and freezes each source. Every file must declare the supported `schema_version`; a validator throws on anything else
 * (unknown or missing fields included). Returns a frozen object keyed by file name; the raw imports are never exposed.
 */
export function buildGameData(files = sources()) {
  const out = {};
  for (const [name, [raw, validate]] of Object.entries(files)) {
    const data = structuredClone(raw);
    if (data?.schema_version !== SUPPORTED_SCHEMA_VERSION)
      fail(name, `schema_version must be ${SUPPORTED_SCHEMA_VERSION}`);
    validate(data);
    out[name] = data;
  }
  return freeze(out);
}

export const GAME_DATA = buildGameData();
