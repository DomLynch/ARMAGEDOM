// node --test ops/realtime/build-release.test.mjs
// The bundle is complete (every relative import resolves INSIDE it), immutable, manifest-checked, and its entry points start in the OFF state with the flags unset.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { build, trace } from "./build-release.mjs";

const out = fs.mkdtempSync(path.join(os.tmpdir(), "arma-release-test-"));
const stubArea = path.join(out, "area.json");
fs.writeFileSync(stubArea, JSON.stringify({ stub: true })); // a real file is validated by presence's own loader (below)
const result = build({ out, name: "t1", install: false, areaData: stubArea, validate: false });

test("the bundle holds every file the entries import, and nothing imports outside it", () => {
  const { files } = trace(result.dir, ["server/writer/main.js", "server/presence/main.js"]); // throws on a missing relative import
  assert.ok(files.length > 50, "the presence service's Web imports are in");
  assert.ok(files.includes("Web/src/engine/world-events.js") && files.includes("server/writer/writer.js"));
  assert.deepEqual(result.bare, ["pg", "three"]);
  assert.ok(fs.existsSync(path.join(result.dir, "server/data/spawns.json")), "the generated spawn rows ship with the writer");
});

test("package.json is ESM with exactly the two runtime packages pinned; the manifest matches the files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(result.dir, "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.deepEqual(Object.keys(pkg.dependencies), ["pg", "three"]);
  assert.ok(Object.values(pkg.dependencies).every((v) => /^\d+\.\d+\.\d+$/.test(v)), "exact versions");
  const lock = JSON.parse(fs.readFileSync(path.join(result.dir, "package-lock.json"), "utf8"));
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} is locked at the pinned version`);
  for (const line of fs.readFileSync(path.join(result.dir, "MANIFEST"), "utf8").trim().split("\n")) {
    const [sha, rel] = line.split("  ");
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(result.dir, rel))).digest("hex"), sha, rel);
  }
});

test("a release is immutable: building the same name again is refused", () => {
  assert.throws(() => build({ out, name: "t1", install: false, areaData: stubArea, validate: false }), /already exists/);
});

test("the area data is required and is checked by presence's own loader: a stub or edited file does not build", () => {
  assert.throws(() => build({ out, name: "t2", install: false }), /--area-data/);
  assert.throws(() => build({ out, name: "t3", install: false, areaData: stubArea }), /areas|data|expected/i);
  assert.ok(!fs.existsSync(path.join(out, "t3")), "a refused build leaves no half release behind");
  assert.ok(fs.existsSync(path.join(result.dir, "server/data/area-presence.json")) && fs.existsSync(path.join(result.dir, "Web/public/world/area-content.json")));
});

test("the writer starts OFF with the flag unset: it says so and exits 0 without importing any package", () => {
  const run = spawnSync(process.execPath, ["server/writer/main.js"], { cwd: result.dir, env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /OFF/);
});
