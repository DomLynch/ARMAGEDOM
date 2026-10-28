import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Drift between data/webText.json and the code that reads it: an id with no caller is dead text, and a webText() call that names an id
// the file does not hold would throw the first time that line renders. Every call is read from Web/src; the id may be a string literal,
// a ternary of literals, or (rarely) a template with a computed tail, which must be listed in DYNAMIC_PREFIXES with its reason.
const SRC = new URL("../src/", import.meta.url).pathname;
const IDS = Object.keys(JSON.parse(fs.readFileSync(new URL("../src/data/webText.json", import.meta.url))).texts);

// A call whose id is built at run time lists the id prefix it can produce; every id under the prefix counts as used.
const DYNAMIC_PREFIXES = [
  { prefix: "runCore.refusal.", reason: "run-core.js picks the supply refusal line by the collectSupply reason (pistol-required, reserve-full, health-full)" },
  { prefix: "hud.keys.", reason: "engine/input-keymap.js builds each key-hint label from the hint row's text in data/inputKeys.json" },
];

// An id read by something other than a webText() call counts as used; each names who reads it and which test keeps the copy in step.
const EXTERNAL_READERS = [
  { id: "boot.failed", reason: "copied into index.html data-boot-failed for the inline boot-failure script; web-text-boot-card.test.js keeps them equal" },
  { id: "boot.retry", reason: "copied into index.html data-boot-retry for the inline boot-failure script; web-text-boot-card.test.js keeps them equal" },
];

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : [],
  );

// The text of the first argument of the webText( call that starts at `open` (the index just after the paren).
function firstArgument(source, open) {
  let depth = 0,
    quote = null;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return source.slice(open, i);
      depth--;
    } else if (c === "," && depth === 0) return source.slice(open, i);
  }
  return source.slice(open);
}

// The index of the first `?` outside any string or bracket in an argument, or -1 (a ternary's test ends there).
function topLevelQuestion(arg) {
  let depth = 0,
    quote = null;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "?" && depth === 0 && arg[i + 1] !== "." && arg[i + 1] !== "?") return i;
  }
  return -1;
}

// Every webText( call in the source: { file, literals: [id], prefixes: [string], unresolved: boolean }.
export function readCalls(files, root = SRC) {
  const calls = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    if (rel === path.join("engine", "web-text.js")) continue; // the reader itself
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bwebText\(/g)) {
      const lineStart = source.lastIndexOf("\n", match.index) + 1,
        line = source.slice(lineStart, source.indexOf("\n", match.index));
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // a comment that mentions the call
      // In `cond ? "a" : "b"` only the branches are ids; a literal in the condition (`kind === "knife" ? …`) is not.
      const whole = firstArgument(source, match.index + match[0].length),
        arg = topLevelQuestion(whole) >= 0 ? whole.slice(topLevelQuestion(whole) + 1) : whole,
        literals = [],
        prefixes = [];
      for (const lit of arg.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)) {
        const text = lit[1] ?? lit[2] ?? lit[3];
        if (lit[3] !== undefined && text.includes("${")) prefixes.push(text.slice(0, text.indexOf("${")));
        else literals.push(text);
      }
      calls.push({ file: rel, literals, prefixes, unresolved: !literals.length && !prefixes.length });
    }
  }
  return calls;
}

// The findings for a set of calls against a set of ids: dead ids, calls to missing ids, and calls whose id cannot be read.
export function driftProblems(calls, ids, dynamic = DYNAMIC_PREFIXES, external = EXTERNAL_READERS) {
  const problems = [],
    used = new Set();
  for (const call of calls) {
    if (call.unresolved) problems.push(`${call.file}: a webText() call whose id is not a literal; pass a literal or list its prefix in DYNAMIC_PREFIXES`);
    for (const id of call.literals) {
      if (!ids.includes(id)) problems.push(`${call.file}: webText("${id}") names an id that is not in webText.json`);
      used.add(id);
    }
    for (const prefix of call.prefixes) {
      if (!dynamic.some((row) => row.prefix === prefix))
        problems.push(`${call.file}: webText(\`${prefix}\${…}\`) builds an id at run time; list "${prefix}" in DYNAMIC_PREFIXES with a reason`);
    }
  }
  for (const { prefix, reason } of dynamic) {
    if (!reason?.trim()) problems.push(`DYNAMIC_PREFIXES "${prefix}" needs a reason`);
    const under = ids.filter((id) => id.startsWith(prefix));
    if (!under.length) problems.push(`DYNAMIC_PREFIXES "${prefix}" matches no id in webText.json; remove it`);
    for (const id of under) used.add(id);
  }
  for (const { id, reason } of external) {
    if (!reason?.trim()) problems.push(`EXTERNAL_READERS "${id}" needs a reason`);
    if (!ids.includes(id)) problems.push(`EXTERNAL_READERS "${id}" is not in webText.json; remove it`);
    used.add(id);
  }
  for (const id of ids) if (!used.has(id)) problems.push(`webText.json "${id}" has no caller in Web/src (dead text); remove it`);
  return problems;
}

test("every webText.json id has a caller and every webText() call names an id that exists", () => {
  assert.deepEqual(driftProblems(readCalls(walk(SRC)), IDS), []);
});

test("the drift check goes red for a dead id, a call to a missing id and an id it cannot read", () => {
  const calls = readCalls(walk(SRC));
  assert.match(driftProblems(calls, [...IDS, "fake.deadId"]).join("\n"), /"fake\.deadId" has no caller/);
  const fakeCall = { file: "fake.js", literals: ["fake.missingId"], prefixes: [], unresolved: false };
  assert.match(driftProblems([...calls, fakeCall], IDS).join("\n"), /fake\.js: webText\("fake\.missingId"\) names an id that is not in webText\.json/);
  const unreadable = { file: "fake.js", literals: [], prefixes: [], unresolved: true };
  assert.match(driftProblems([...calls, unreadable], IDS).join("\n"), /fake\.js: a webText\(\) call whose id is not a literal/);
  const dynamic = { file: "fake.js", literals: [], prefixes: ["fake."], unresolved: false };
  assert.match(driftProblems([...calls, dynamic], IDS).join("\n"), /builds an id at run time/);
  assert.match(driftProblems(calls, IDS, [{ prefix: "nope.", reason: "x" }]).join("\n"), /matches no id/);
});

test("the call reader sees literals, ternaries and template prefixes, and skips comments", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "webtext-drift-"));
  try {
    const file = path.join(dir, "a.js");
    fs.writeFileSync(
      file,
      [
        '// webText("in.comment") is only mentioned here',
        'const a = webText("one.id", { x: f(1, 2) });',
        'const b = webText(kind === "knife" ? "two.yes" : "two.no");',
        "const c = webText(`three.${reason}`);",
        "const d = webText(someId);",
      ].join("\n"),
    );
    const calls = readCalls([file], dir);
    assert.deepEqual(calls.map((c) => [c.literals, c.prefixes, c.unresolved]), [
      [["one.id"], [], false],
      [["two.yes", "two.no"], [], false],
      [[], ["three."], false],
      [[], [], true],
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
