// Source-only browser gate. Packaging/browser/device acceptance is separate.
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

export function verifyWeb(root, { quiet = false } = {}) {
  const source = files(join(root, "Web/src"), ".js");
  const tests = files(join(root, "Web/tests"), ".test.js");
  if (!source.length) throw Error("No Web source files found");
  if (!tests.length) throw Error("No Web tests found");
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
  run("tests", ["--test", ...tests]);
  return true;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    verifyWeb(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
