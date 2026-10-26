// node --test ops/realtime/check-presence-layout.test.mjs
// The layout gate catches the 25-26 Oct 2026 incident: presence ran layout e7a262a1ef51b445 while the release on disk held bd8545b39aa315af and main generated aea70cec4978d2da.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { layoutProblems, releaseLayout, runningLayout } from "./check-presence-layout.mjs";

const OLD = "e7a262a1ef51b445",
  DISK = "bd8545b39aa315af",
  MAIN = "aea70cec4978d2da";
const line = (hash) => `2026-10-25T09:07:15+04:00 Brain env[2282799]: presence listening on 127.0.0.1:8894, layout ${hash}, push 15 cm`;

test("the running layout is the one in the LAST presence-listening line, and absent when presence is off", () => {
  assert.equal(runningLayout(`${line(OLD)}\nnoise\n${line(MAIN)}\n`), MAIN);
  assert.equal(runningLayout("presence: OFF (set ARMA_PRESENCE=1 to start); nothing is listening\n"), null);
  assert.equal(runningLayout(""), null);
});

test("the live incident: presence running an old layout while the release on disk is newer FAILS and says restart", () => {
  const problems = layoutProblems({ running: OLD, release: DISK });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /STALE PRESENCE.*e7a262a1ef51b445.*bd8545b39aa315af.*restart arma-presence/);
});

test("a stale release against the source tree fails, whether or not presence was restarted onto it", () => {
  assert.match(layoutProblems({ running: DISK, release: DISK, tree: MAIN }).join("\n"), /STALE RELEASE.*bd8545b39aa315af.*aea70cec4978d2da/);
  assert.match(layoutProblems({ running: OLD, release: DISK, tree: MAIN }).join("\n"), /STALE PRESENCE/);
  assert.match(layoutProblems({ running: OLD, release: DISK, tree: MAIN }).join("\n"), /STALE RELEASE/);
});

test("matching hashes pass; presence off or an unreadable release fails", () => {
  assert.deepEqual(layoutProblems({ running: MAIN, release: MAIN }), []);
  assert.deepEqual(layoutProblems({ running: MAIN, release: MAIN, tree: MAIN }), []);
  assert.match(layoutProblems({ running: null, release: MAIN })[0], /not running|OFF/);
  assert.match(layoutProblems({ running: MAIN, release: null })[0], /no readable/);
});

test("the command reads the release file and the journal line, prints both hashes, and exits 1 on a mismatch, 0 on a match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arma-layout-"));
  fs.mkdirSync(path.join(dir, "server/data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "server/data/area-presence.json"), JSON.stringify({ version: DISK }));
  assert.equal(releaseLayout(dir), DISK);
  assert.equal(releaseLayout(path.join(dir, "missing")), null);
  const script = new URL("./check-presence-layout.mjs", import.meta.url).pathname;
  const run = (hash) => spawnSync(process.execPath, [script, "--release", dir, "--line", line(hash)], { encoding: "utf8" });
  const bad = run(OLD);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /running=e7a262a1ef51b445 release=bd8545b39aa315af/);
  assert.match(bad.stderr, /FAIL STALE PRESENCE/);
  const good = run(DISK);
  assert.equal(good.status, 0);
  assert.match(good.stdout, /OK: presence serves the release layout/);
});
