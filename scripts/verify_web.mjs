// Source-only browser gate. Packaging/browser/device acceptance is separate.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function files(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? files(path, suffix)
        : entry.isFile() && entry.name.endsWith(suffix)
          ? [path]
          : [];
    })
    .sort();
}

// Density guard: source stays readable (run `npm run format` in Web/). No source line may
// pass MAX_LINE_LENGTH and no file MAX_FILE_BYTES, except the legacy entries recorded in
// scripts/web-density-baseline.json (keyed by path under Web/src). A legacy entry may only
// go down: lower or delete it when the file is fixed. Data files can be allowlisted by name.
export const MAX_LINE_LENGTH = 160;
export const MAX_FILE_BYTES = 80 * 1024;
export const DENSITY_ALLOWLIST = new Set();

export function densityProblems(paths, baseline = {}, sourceRoot = "") {
  const problems = [];
  for (const path of paths) {
    if (DENSITY_ALLOWLIST.has(basename(path))) continue;
    const key = sourceRoot ? relative(sourceRoot, path) : path;
    const legacyLines = baseline.longLines?.[key] ?? 0;
    const legacyBytes = baseline.bytes?.[key] ?? MAX_FILE_BYTES;
    const text = readFileSync(path, "utf8");
    const bytes = Buffer.byteLength(text);
    if (bytes > legacyBytes)
      problems.push(`${path}: ${bytes} bytes, limit ${legacyBytes}`);
    const long = text
      .split("\n")
      .flatMap((line, index) => (line.length > MAX_LINE_LENGTH ? [index + 1] : []));
    if (long.length > legacyLines)
      problems.push(
        `${path}:${long[0]}: ${long.length} line(s) over ${MAX_LINE_LENGTH} characters, limit ${legacyLines}`,
      );
  }
  return problems;
}

export function verifyWeb(root, { quiet = false } = {}) {
  const source = files(join(root, "Web/src"), ".js");
  const tests = files(join(root, "Web/tests"), ".test.js");
  if (!source.length) throw Error("No Web source files found");
  if (!tests.length) throw Error("No Web tests found");
  const dense = densityProblems(
    source,
    JSON.parse(
      readFileSync(join(root, "scripts/web-density-baseline.json"), "utf8"),
    ),
    join(root, "Web/src"),
  );
  if (dense.length)
    throw Error(`Web source density guard failed:\n${dense.join("\n")}`);
  // A gate invoked by a test must still start a fresh test runner.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  function run(label, args) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      stdio: quiet ? "pipe" : "inherit",
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw Error(`Web ${label} failed (${result.signal ?? result.status})`);
  }
  for (const path of source) run("syntax", ["--check", path]);
  // Asset integration tests decode full rigs; bound workers on shared runners.
  run("tests", ["--test", "--test-concurrency=2", ...tests]);
  return true;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const tooling = spawnSync(process.execPath, [join(root, "scripts/deploy/verify_tooling.mjs")], {
      cwd: root,
      stdio: "inherit",
    });
    if (tooling.error) throw tooling.error;
    if (tooling.status !== 0)
      throw Error(`Tooling gate failed (${tooling.signal ?? tooling.status})`);
    verifyWeb(root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
