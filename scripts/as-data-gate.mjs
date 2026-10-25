// As-data gate: per-rig behaviour lives in Web/src/rig-capabilities.js, not in engine code.
// A quoted rig name that has a capability row may not appear in any other Web/src file beyond
// the legacy count recorded in scripts/as-data-baseline.json. A file's count may only go down:
// lower or delete its entry when you replace a comparison with `rigCapability(rig, name)`.
import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";

export const AS_DATA_OWNER = "rig-capabilities.js";
export const DATA_FOLDER = "Web/public/world/";
export const GAME_DATA_LOADER = "engine/game-data.js";

// Constant tables: a top-level `const UPPER_CASE = {...}`, `[...]` or `Object.freeze(...)`, and any top-level lower-case
// `const x = Object.freeze(...)`, with or without `export`. Legacy counts live in scripts/as-data-baseline.json (`constantTables`).
const TABLE =
  /^(?:export )?const (?:([A-Z][A-Z0-9_]*)\s*=\s*(?:Object\.freeze\(|[[{])|([a-z]\w*)\s*=\s*Object\.freeze\()/gm;
export const tableNames = (text) => [...text.matchAll(TABLE)].map((m) => m[1] ?? m[2]);
export const countConstantTables = (text) => tableNames(text).length;

// A table that must stay in code (a wire protocol the server trusts, a saved-era enum) is recorded in the baseline's `keepInCode`
// as { "<file>": [{ "name": "WEAPON_IDS", "reason": "..." }] }. The remaining DATA debt of a file is its constant tables minus these.
// A kept name must still be a top-level table in the file, once, with a reason.
export function keepInCodeProblems(paths, baseline = {}, sourceRoot = "") {
  const problems = [],
    keep = baseline.keepInCode ?? {},
    keys = new Set(paths.map((path) => (sourceRoot ? relative(sourceRoot, path) : path)));
  for (const file of Object.keys(keep))
    if (!keys.has(file)) problems.push(`${file}: keepInCode names a file that is not in Web/src.`);
  for (const path of paths) {
    const key = sourceRoot ? relative(sourceRoot, path) : path;
    if (!keep[key]) continue;
    const present = new Set(tableNames(readFileSync(path, "utf8"))),
      seen = new Set();
    for (const row of keep[key]) {
      if (typeof row?.name !== "string" || typeof row.reason !== "string" || !row.reason.trim())
        problems.push(`${key}: every keepInCode entry needs a name and a reason.`);
      else if (seen.has(row.name)) problems.push(`${key}: keepInCode lists ${row.name} twice.`);
      else if (!present.has(row.name))
        problems.push(`${key}: keepInCode names ${row.name}, which is no longer a top-level constant table here. Remove the entry.`);
      seen.add(row?.name);
    }
  }
  return problems;
}

// Per file: { tables, kept, debt } for every file with at least one constant table, plus the totals.
export function dataDebt(paths, baseline = {}, sourceRoot = "") {
  const files = {};
  let tables = 0,
    kept = 0;
  for (const path of paths) {
    const key = sourceRoot ? relative(sourceRoot, path) : path,
      found = countConstantTables(readFileSync(path, "utf8")),
      keptHere = Math.min(found, baseline.keepInCode?.[key]?.length ?? 0);
    if (!found) continue;
    files[key] = { tables: found, kept: keptHere, debt: found - keptHere };
    tables += found;
    kept += keptHere;
  }
  return { files, tables, kept, debt: tables - kept };
}

export function constantTableProblems(paths, baseline = {}, sourceRoot = "") {
  const problems = keepInCodeProblems(paths, baseline, sourceRoot);
  for (const path of paths) {
    const key = sourceRoot ? relative(sourceRoot, path) : path;
    const allowed = baseline.constantTables?.[key] ?? 0;
    const found = countConstantTables(readFileSync(path, "utf8"));
    if (found > allowed)
      problems.push(
        `${path}: ${found} top-level constant table(s), limit ${allowed}. Put the table in a data file (Web/src/data/*.json read through ${GAME_DATA_LOADER}, or ${DATA_FOLDER}) instead.`,
      );
    else if (found < allowed)
      problems.push(
        `${path}: ${found} top-level constant table(s), baseline says ${allowed}. Lower it to ${found} in scripts/as-data-baseline.json.`,
      );
  }
  return problems;
}

// Only engine/game-data.js may import Web/src/data/*.json: it validates and freezes each file once, and every reader goes through it.
const DATA_IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)["'][^"']*\/data\/[^"']+\.json["']/;
export function dataImportProblems(paths, sourceRoot = "") {
  return paths
    .filter((path) => (sourceRoot ? relative(sourceRoot, path) : path) !== GAME_DATA_LOADER)
    .filter((path) => DATA_IMPORT.test(readFileSync(path, "utf8")))
    .map((path) => `${path}: imports a data/*.json file directly. Read it through ${GAME_DATA_LOADER} instead.`);
}

export function countRigLiterals(text, rigNames) {
  let count = 0;
  for (const rig of rigNames) {
    const quoted = new RegExp(`(["'\`])${rig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g");
    count += (text.match(quoted) ?? []).length;
  }
  return count;
}

export function asDataProblems(paths, rigNames, baseline = {}, sourceRoot = "") {
  const problems = [];
  for (const path of paths) {
    if (basename(path) === AS_DATA_OWNER) continue;
    const key = sourceRoot ? relative(sourceRoot, path) : path;
    const allowed = baseline.rigLiterals?.[key] ?? 0;
    const found = countRigLiterals(readFileSync(path, "utf8"), rigNames);
    if (found > allowed)
      problems.push(
        `${path}: ${found} rig-name literal(s), limit ${allowed}. Add a capability row in src/${AS_DATA_OWNER} and read it with rigCapability() instead.`,
      );
    else if (found < allowed)
      problems.push(`${path}: ${found} rig-name literal(s), baseline says ${allowed}. Lower it to ${found} in scripts/as-data-baseline.json.`);
  }
  return problems;
}
