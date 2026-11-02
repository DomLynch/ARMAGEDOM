// In-game proof (dev tool, never shipped): node tools/physics-pilot-game.mjs [--physics 0|1] [--hostiles 10] [--shots /tmp/game]
// Starts vite on 38794, enters the REAL game at 375x812@2x with ?qa=1, makes the marked hunter arrive, adds N copies of a living resident
// as extra hostiles, measures JS ms per rAF callback, kills the hunter with the game's own rangedHit (lethal, goes through kill()),
// and measures the same through the death. Prints one JSON line. A Chromium is needed (CHROME=<exe>; playwright-core is installed when missing).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  PHYSICS = arg("physics", "0") === "1", CROWD = Number(arg("crowd", 1)), BURST_MS = Number(arg("burstMs", 2000)), HOSTILES = Number(arg("hostiles", 10)), SHOTS = arg("shots", "/tmp/game"), PORT = 38794;
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
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
const fetched = [];
page.on("request", (r) => { if (/physics-death-impl|jolt-physics|hunter-pitborn/.test(r.url())) fetched.push(r.url().split("/").pop().split("?")[0]); });
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.addInitScript(() => { // JS time per rAF callback: the game's own frame work, GPU excluded
  const raf = window.requestAnimationFrame.bind(window);
  window.__jsMs = [];
  window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); try { cb(t); } finally { window.__jsMs.push(performance.now() - a); } });
});
await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=${PHYSICS ? "1" : "0"}`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
const q = (fn, ...a) => page.evaluate(fn, ...a);
await page.waitForTimeout(PHYSICS ? 9000 : 2000); // idle preload of the lazy chunk
// the hunter: skip the 60 s arrival delay (data row arrivalDelay) by moving the run's arrival clock back, then wait for the spawn
await q(() => { const s = window.__qa.game.markedHunt; if (s) { s.arrivedAt = -1e6; s.nextSpawnAt = 0; s.nextAttemptAt = 0; } });
const hunterSeen = await page.waitForFunction(() => window.__qa.game.enemies.some((e) => e.markedHunter && e.hp > 0), null, { timeout: 90000 }).then(() => true, () => false);
await page.waitForTimeout(8000); // the hunter's own model streams in after it spawns (deferred)
const info = await q(([n, CROWD]) => {
  const g = window.__qa.game, hunter = g.enemies.find((e) => e.markedHunter),
    res = g.enemies.filter((e) => !e.markedHunter && e.hp > 0);
  const base = res[0] ?? null;
  if (hunter) { hunter.pos = { x: g.player.pos.x, z: g.player.pos.z + 3.5 }; hunter.home = { ...hunter.pos }; hunter.moveSpeed = 0; } // in view, standing still
  let added = 0;
  for (let i = 0; base && i < n; i++, added++) {
    const a = (i / n) * Math.PI * 2;
    g.enemies.push({ ...base, id: 90000 + i, placementKey: `qa-${i}`, pos: { x: g.player.pos.x + Math.cos(a) * 6, z: g.player.pos.z + Math.sin(a) * 6 }, swing: null });
  }
  for (let i = 0; hunter && i < CROWD - 1; i++) // crowd mode: more marked hunters (same rig) in a ring, killed in a burst below
    g.enemies.push({ ...hunter, id: 91000 + i, placementKey: `qa-hunter-${i}`, hp: hunter.hp, pos: { x: g.player.pos.x + Math.cos(i) * 3, z: g.player.pos.z + 3.5 + Math.sin(i) * 2 }, swing: null });
  return { hunter: !!hunter, enemiesBefore: g.enemies.length - added, residentRig: base?.rig ?? null, added, player: g.player.pos };
}, [HOSTILES, CROWD]);
const frames = async (ms) => q((t) => new Promise((resolve) => { window.__jsMs.length = 0; setTimeout(() => resolve([...window.__jsMs]), t); }), ms);
const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s.at(-1).toFixed(2) }; };
const idle = stat(await frames(4000));
await page.screenshot({ path: `${SHOTS}/alive-${PHYSICS ? "physics" : "baked"}.png` });
// the kill: the game's own lethal ranged hit (rangedHit -> kill -> response Death), through the exported function of the running module
const kill = await q(async () => {
  const { rangedHit } = await import("/src/combat.js"), g = window.__qa.game, h = g.enemies.find((e) => e.markedHunter && e.hp > 0);
  if (!h) return { killed: false };
  const where = { ...h.pos };
  window.__jsMs.length = 0;
  rangedHit(g, { targetId: h.id, direction: { x: 0, z: -1 } }, "pistol", "pistol", 1e9);
  return { killed: h.hp <= 0, where, response: h.response?.clip, corpses: (g.corpses ?? []).length, atMs: performance.now() };
});
if (CROWD > 1) // the rest of the crowd dies spread over BURST_MS (the first already died above)
  await q(async ([ms]) => {
    const { rangedHit } = await import("/src/combat.js"), g = window.__qa.game, rest = g.enemies.filter((e) => e.markedHunter && e.hp > 0);
    rest.forEach((h, i) => setTimeout(() => rangedHit(g, { targetId: h.id, direction: { x: 0, z: -1 } }, "pistol", "pistol", 1e9), (i / rest.length) * ms));
  }, [BURST_MS]);
const out = [];
const LAST = Number(arg("last", 0)); // --last <ms>: one more shot this long after the 3.0 s one (the settled body)
for (const [label, wait] of [["0.3s", 300], ["0.6s", 300], ["1.2s", 600], ["3.0s", 1800], ...(LAST ? [["settled", LAST]] : [])]) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${SHOTS}/death-${PHYSICS ? "physics" : "baked"}-${label}.png` });
  out.push(label);
}
const death = await q(() => [...window.__jsMs]), deathStat = stat(death);
const corpse = await q(() => {
  const g = window.__qa.game, h = (g.corpses ?? []).find((e) => e.markedHunter) ?? g.enemies.find((e) => e.markedHunter);
  return h ? { hp: h.hp, pos: h.pos } : null;
});
const deathStats = await q(() => ({ ...globalThis.__physicsDeathStats }));
console.log(JSON.stringify({ deathStats, physics: PHYSICS, crowd: CROWD, burstMs: BURST_MS, hunterSeen, info, idleJsMsPerFrame: idle, kill, deathWindowJsMsPerFrame: deathStat, worst3Frames: death.sort((a, b) => b - a).slice(0, 3).map((x) => +x.toFixed(1)), corpse, shots: out, fetched: [...new Set(fetched)],
  errors: logs.filter((l) => /PAGEERROR|error/i.test(l)).slice(0, 6) }, null, 1));
await browser.close();
await server.close();
