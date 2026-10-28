// Browser proof (dev tool, never shipped): node tools/chained-pitborn-target-still.mjs [--out /tmp/cpt] [--tag after]  (CHROME=<exe>; playwright-core is
// installed when missing). Enters the REAL game at 375x812@2x with ?qa=1 and --mute-audio, equips the pistol, stands the player on open Westminster
// ground in front of the lion statue with the chained Pitborn behind it, aims a few degrees off, and writes <out>/<tag>.png plus one JSON line:
// the ordinary reticle cue (pistolCue: the locked target id, or null). Run it on a checkout before and after the change for the pair of stills.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  OUT = arg("out", "/tmp/cpt"), TAG = arg("tag", "after"), PORT = Number(arg("port", 38796)), OFF_DEGREES = Number(arg("off", 8)), DISTANCE = Number(arg("distance", 5));
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright-core")); } catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = require("playwright-core"));
}
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.goto(`http://127.0.0.1:${PORT}/?qa=1`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
await page.waitForTimeout(6000); // the Pitborn model streams in
const setup = await page.evaluate(async ([distance, off]) => {
  const { chainedPitbornTarget, sightPastStatue } = await import("/src/engine/chain-break.js");
  const g = window.__qa.game, w = g.world, stand = chainedPitbornTarget(g);
  if (!stand) return { error: "no stand-in: not Westminster or not chained" };
  const at = stand.pos;
  let spot = null;
  for (let d = distance; d < distance + 8 && !spot; d += 0.5)
    for (let k = 0; k < 72 && !spot; k++) {
      const a = (k / 72) * Math.PI * 2, o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (w.lineClear(o, o) && sightPastStatue(w, at, o)) spot = o;
    }
  if (!spot) return { error: "no open ground with sight to it" };
  g.enemies = g.enemies.filter((e) => Math.hypot(e.pos.x - spot.x, e.pos.z - spot.z) > 30);
  Object.assign(g.pistol, { collected: true, equipped: true, magazine: 6, reserve: 24 });
  g.player.weapon = "pistol";
  g.player.pos = spot;
  const base = Math.atan2(at.z - spot.z, at.x - spot.x) + (off * Math.PI) / 180;
  g.player.facing = { x: Math.cos(base), z: Math.sin(base) };
  g.pistolUserFacing = { ...g.player.facing };
  return { spot, at, distance: Math.hypot(at.x - spot.x, at.z - spot.z) };
}, [DISTANCE, OFF_DEGREES]);
if (setup.error) throw Error(setup.error);
await page.waitForTimeout(2500);
const cue = await page.evaluate(async () => {
  const { pistolCue } = await import("/src/pistol-targeting.js"), g = window.__qa.game, c = pistolCue(g);
  return c ? { targetId: c.targetId, position: c.position, ready: c.ready } : null;
});
await page.screenshot({ path: `${OUT}/${TAG}.png` });
console.log(JSON.stringify({ tag: TAG, setup, cue, errors: logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3) }));
await browser.close();
await server.close();
