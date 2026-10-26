// Number-literal ratchet (part of the as-data gate): no tuning values in code. Every numeric literal in Web/src that is not a unit
// conversion, a validator bound, a save version or pure geometry counts toward a per-file legacy total in
// scripts/as-data-baseline.json `numberLiterals`. A file's count may only go down: move the number into data (Web/src/data/*.json
// read through engine/game-data.js, or a rig row) and lower the entry; a new file starts at 0.
//
// What does NOT count:
// - the unit scalers and angle/time conversions in NUMBER_ALLOWED (0, 1, 60, 90, 180, 360, 255, 100, 1000), signs ignored, and any
//   epsilon below 1e-6. 2, 3, 4, 10 and 0.5 count; a top-level `const UPPER_CASE = <number>` counts too;
// - an array index (`a[7]`), a comparison against a `.length`, a comparison against or a property named like `version`;
// - anything inside a function named validate*/check*/assert*/ensure* (bounds on data, not values);
// - a line that ends with `// tuning-ok: <reason>` (listed so the reasons can be reviewed);
// - files that are pure model geometry, listed with a reason in Web/src/data/keep-in-code.json (NUMBER_EXEMPT_FILES).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative } from "node:path";

export const NUMBER_ALLOWED = new Set([0, 1, 60, 90, 180, 360, 255, 100, 1000]);
export const NUMBER_EPSILON = 1e-6;
// The temporary shrink tolerance (Strategy, 26 Oct 2026) ended with the burn-down: the numberLiterals table is empty and the gate is strict,
// so any tuning number in Web/src fails. The option stays only so the ratchet test can still exercise both paths.
export const NUMBER_SHRINK_TOLERANCE = false;
// The single exemption file (Web/src/data/keep-in-code.json): which files stay outside the counter, and which JSON imports are allowed.
export const KEEP_IN_CODE_FILE = "Web/src/data/keep-in-code.json";
export const KEEP_IN_CODE = JSON.parse(
  readFileSync(new URL(`../${KEEP_IN_CODE_FILE}`, import.meta.url), "utf8"),
);
export const NUMBER_EXEMPT_FILES = KEEP_IN_CODE.numberExemptFiles.map(
  (entry) => new RegExp(entry.pattern),
);
const VALIDATOR_NAME = /^(validate|check|assert|ensure)/i;
const VERSION_NAME = /version/i;

let parse = null;
// The AST comes from rollup's parser (a dependency of vite, installed with Web by `npm ci`), so no extra package is added.
function parser() {
  parse ??= createRequire(new URL("../Web/package.json", import.meta.url))(
    "rollup/parseAst",
  ).parseAst;
  return parse;
}

const nameOf = (node) =>
  node?.type === "Identifier"
    ? node.name
    : node?.type === "Literal"
      ? String(node.value)
      : null;
const memberName = (node) =>
  node?.type === "MemberExpression" && !node.computed
    ? nameOf(node.property)
    : nameOf(node);
const isFunction = (node) =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression";

// The name a function is known by: its own, the variable or property it is assigned to, or the method key.
function functionName(node, parent) {
  if (node.id) return node.id.name;
  if (parent?.type === "VariableDeclarator") return nameOf(parent.id);
  if (parent?.type === "Property" || parent?.type === "MethodDefinition")
    return nameOf(parent.key);
  if (parent?.type === "AssignmentExpression") return memberName(parent.left);
  return null;
}

// `ancestors` is nearest-first. Returns true when the literal is exempt.
function exempt(literal, ancestors, signed) {
  const abs = Math.abs(literal.value);
  if (NUMBER_ALLOWED.has(abs) || (abs > 0 && abs < NUMBER_EPSILON)) return true;
  const parent = ancestors[signed ? 1 : 0];
  const self = signed ? ancestors[0] : literal;
  if (
    parent?.type === "MemberExpression" &&
    parent.computed &&
    parent.property === self
  )
    return true;
  if (parent?.type === "BinaryExpression") {
    const other = parent.left === self ? parent.right : parent.left;
    if (
      memberName(other) === "length" ||
      VERSION_NAME.test(memberName(other) ?? "")
    )
      return true;
  }
  if (
    parent?.type === "Property" &&
    parent.value === self &&
    VERSION_NAME.test(nameOf(parent.key) ?? "")
  )
    return true;
  for (let i = 0; i < ancestors.length; i++)
    if (
      isFunction(ancestors[i]) &&
      VALIDATOR_NAME.test(functionName(ancestors[i], ancestors[i + 1]) ?? "")
    )
      return true;
  return false;
}

// Count the numeric literals in a source text. Returns { count, items: [{ line, value }], reasons: [text] }.
export function countNumberLiterals(text) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const lines = text.split("\n"),
    items = [],
    reasons = [];
  const walk = (node, ancestors) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Literal" && typeof node.value === "number") {
      const signed =
        ancestors[0]?.type === "UnaryExpression" &&
        ancestors[0].operator === "-";
      if (exempt(node, ancestors, signed)) return;
      const line = lineOf(node.start),
        mark = /\/\/\s*tuning-ok:\s*(\S.*)$/.exec(lines[line - 1] ?? "");
      if (mark) reasons.push(`${line}: ${mark[1].trim()}`);
      else items.push({ line, value: signed ? -node.value : node.value });
      return;
    }
    const next = [node, ...ancestors];
    for (const [key, child] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      if (Array.isArray(child)) for (const c of child) walk(c, next);
      else if (child && typeof child === "object") walk(child, next);
    }
  };
  walk(parser()(text), []);
  return { count: items.length, items, reasons };
}

export const isNumberExempt = (key) =>
  NUMBER_EXEMPT_FILES.some((pattern) => pattern.test(key));

export function numberLiteralProblems(paths, baseline = {}, sourceRoot = "", { shrinkTolerance = NUMBER_SHRINK_TOLERANCE } = {}) {
  const problems = [];
  for (const path of paths) {
    const key = (sourceRoot ? relative(sourceRoot, path) : path)
      .split("\\")
      .join("/");
    if (isNumberExempt(key)) continue;
    const allowed = baseline.numberLiterals?.[key] ?? 0;
    let found;
    try {
      found = countNumberLiterals(readFileSync(path, "utf8")).count;
    } catch (error) {
      // A file that does not parse is the syntax gate's finding, not this one's.
      if (
        error?.code === "PARSE_ERROR" ||
        /RollupError/.test(String(error?.name ?? error))
      )
        continue;
      throw error;
    }
    if (found > allowed)
      problems.push(
        `${path}: ${found} tuning number literal(s), limit ${allowed}. Put the number in a data file (Web/src/data/*.json read through engine/game-data.js) or end the line with "// tuning-ok: <reason>".`,
      );
    else if (found < allowed && !shrinkTolerance)
      problems.push(
        `${path}: ${found} tuning number literal(s), baseline says ${allowed}. Lower it to ${found} in scripts/as-data-baseline.json.`,
      );
  }
  return problems;
}
