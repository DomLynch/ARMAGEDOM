// Player ragdoll proof (dev tool, never shipped): node tools/ragdoll-player-still.mjs [--shots /tmp/pl] [--deaths 2]
// Real game at 375x812@2x with ?qa=1 (headless; REAL_GPU=1 for the Mac GPU, CHROME=<exe>), kills the player the way combat does (hp 0, a Death
// response, finished), takes stills while the body falls, then presses the death screen's retry and checks the pooled body came back, N times.
// Prints one JSON line: __physicsDeathStats after each death and each retry, plus page errors.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  SHOTS = arg("shots", "/tmp/pl"), DEATHS = Number(arg("deaths", 2)), PORT = 38795, PHYSICS = arg("physics", "1");
mkdirSync(SHOTS, { recursive: true });
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
  args: process.env.REAL_GPU ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })).newPage(),
  logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text()); });
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=${PHYSICS}`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
await page.waitForTimeout(PHYSICS === "1" ? 9000 : 2000); // idle preload of the lazy chunk
const q = (fn, ...a) => page.evaluate(fn, ...a);
const stats = () => q(() => ({ ...globalThis.__physicsDeathStats, hp: window.__qa.game.player.hp, finished: window.__qa.game.finished }));
const out = { physics: PHYSICS, rounds: [] };
for (let n = 0; n < DEATHS; n++) {
  const round = { before: await stats() };
  await q(() => {
    const g = window.__qa.game, p = g.player;
    g.enemies = []; // nobody else in the frame
    p.hp = 0;
    p.response = { clip: "Death", start: g.time, ticks: 90 };
    g.finished = true;
    g.won = false;
  });
  for (const [label, ms] of [["a", 250], ["b", 700], ["c", 2500], ["d", 4500]]) {
    await page.waitForTimeout(ms - (label === "a" ? 0 : { b: 250, c: 700, d: 2500 }[label]));
    await page.screenshot({ path: `${SHOTS}/death${n + 1}-${label}.png` });
  }
  round.dead = await stats();
  await q(() => document.getElementById("again")?.click());
  await page.waitForFunction(() => window.__qa.game.player.hp > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  round.afterRetry = await stats();
  await page.screenshot({ path: `${SHOTS}/retry${n + 1}.png` });
  out.rounds.push(round);
}
out.errors = logs.slice(0, 8);
console.log(JSON.stringify(out));
await browser.close();
await server.close();
