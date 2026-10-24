// As-data gate: per-rig behaviour lives in Web/src/rig-capabilities.js, not in engine code.
// A quoted rig name that has a capability row may not appear in any other Web/src file beyond
// the legacy count recorded in scripts/as-data-baseline.json. A file's count may only go down:
// lower or delete its entry when you replace a comparison with `rigCapability(rig, name)`.
import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";

export const AS_DATA_OWNER = "rig-capabilities.js";

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
