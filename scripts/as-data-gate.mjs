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
const TABLE = /^(?:export )?const (?:[A-Z][A-Z0-9_]*\s*=\s*(?:Object\.freeze\(|[[{])|[a-z]\w*\s*=\s*Object\.freeze\()/gm;
export const countConstantTables = (text) => (text.match(TABLE) ?? []).length;

export function constantTableProblems(paths, baseline = {}, sourceRoot = "") {
  const problems = [];
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
