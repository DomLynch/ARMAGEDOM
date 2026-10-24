// Const-table gate (Dom, 24 Oct 2026: "everything possible should be on the data"): tuning tables live in Web/public/world/ (or a
// JSON beside the module), not as top-level constant tables in engine code. A top-level `const UPPER_CASE = {...}`, `[...]` or
// `Object.freeze(...)` is counted per file. Legacy files keep their current count (scripts/const-table-baseline.json), a count may
// never grow, and it must be lowered when a table moves to data. A new table in engine code fails with a pointer to the data folder.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const TABLE = /^(?:export )?const [A-Z][A-Z0-9_]*\s*=\s*(?:Object\.freeze\(|[[{])/gm;
export const DATA_FOLDER = "Web/public/world/";

export const countConstTables = (text) => (text.match(TABLE) ?? []).length;

export function constTableProblems(paths, baseline = {}, sourceRoot = "") {
  const problems = [];
  for (const path of paths) {
    const key = sourceRoot ? relative(sourceRoot, path) : path;
    const allowed = baseline.constTables?.[key] ?? 0;
    const found = countConstTables(readFileSync(path, "utf8"));
    if (found > allowed)
      problems.push(
        `${path}: ${found} top-level constant table(s), limit ${allowed}. Put the table in ${DATA_FOLDER} (or a JSON next to the module) and read it from there.`,
      );
    else if (found < allowed)
      problems.push(
        `${path}: ${found} top-level constant table(s), baseline says ${allowed}. Lower it to ${found} in scripts/const-table-baseline.json.`,
      );
  }
  return problems;
}
