import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));

test("default gate runs Web only with no retired engine comparator", async () => {
  const gate = JSON.parse(await readFile(join(root, ".quality-gate.json"), "utf8"));
  assert.deepEqual(gate.commands, [["node", "scripts/verify_web.mjs"]]);
  assert.deepEqual(gate.completion_commands, []);
  await assert.rejects(readFile(join(root, ".quality-gate.unity.json")), { code: "ENOENT" });
});

async function fixture(
  t,
  source = "export const value = 1;",
  assertion = "assert.equal(value, 1);",
) {
  const dir = await mkdtemp(join(tmpdir(), "armagedom-web-gate-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "Web/src"), { recursive: true });
  await mkdir(join(dir, "Web/tests"), { recursive: true });
  await writeFile(join(dir, "Web/package.json"), '{"type":"module"}');
  await writeFile(join(dir, "Web/src/value.js"), source);
  await writeFile(
    join(dir, "Web/tests/value.test.js"),
    `import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from '../src/value.js'; test('real assertion', () => {${assertion}});`,
  );
  return dir;
}

test("Web gate executes valid source and real tests", async (t) => {
  const { verifyWeb } = await import("../../scripts/verify_web.mjs");
  assert.equal(verifyWeb(await fixture(t), { quiet: true }), true);
});

test("Web gate rejects invalid syntax and failing assertions", async (t) => {
  const { verifyWeb } = await import("../../scripts/verify_web.mjs");
  const syntax = await fixture(t, "export const value = ;");
  assert.throws(() => verifyWeb(syntax, { quiet: true }), /syntax failed/);
  const assertion = await fixture(t, "export const value = 2;");
  assert.throws(() => verifyWeb(assertion, { quiet: true }), /tests failed/);
});

test("Web gate rejects a missing test suite", async (t) => {
  const { verifyWeb } = await import("../../scripts/verify_web.mjs");
  const dir = await fixture(t);
  await rm(join(dir, "Web/tests/value.test.js"));
  assert.throws(() => verifyWeb(dir, { quiet: true }), /No Web tests/);
});
