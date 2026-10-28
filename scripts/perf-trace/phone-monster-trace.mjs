// Perf gate trace (dev tool, never shipped). Run from Web/ (it needs Web's vite + playwright-core):
//   node ../scripts/perf-trace/phone-monster-trace.mjs [--physics 0|1|default] [--seconds 8] [--hostiles 10] [--out result.json]
// Builds on Web/tools/physics-pilot-game.mjs (same server, same hunter-arrival and kill calls) and adds what that row lacks:
// the six new monsters in the scene, wall-clock frame time (rAF delta), draw calls and triangles per frame (counted at the WebGL
// draw calls, every pass), and the JS time per frame. Viewport 375x812 @2x. Physics step cost = the JS-per-frame difference between a
// physics=default run and a physics=0 run (the Jolt step runs inside the frame; it is not timed on its own).
// NOT real GPU time: on a CPU box Chromium renders with SwiftShader (software), so frame ms here is a CPU-raster ceiling, not a phone.
// Needs a Chromium (CHROME=<exe>, or the Playwright image's own); playwright-core is installed when missing.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  PHYSICS = arg("physics", "default"), SECONDS = Number(arg("seconds", 8)), HOSTILES = Number(arg("hostiles", 10)), OUT = arg("out", null), PORT = 38795;
const require = createRequire(`${process.cwd()}/`); // resolve vite and playwright-core from Web/ (the cwd), not from this folder
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
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
  args: process.env.REAL_GPU ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio", "--disable-dev-shm-usage"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.addInitScript(() => {
  // draw calls and triangles per frame, counted at the GL draw entry points (every pass: shadow, main, post)
  const acc = { calls: 0, tris: 0 }, tri = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  for (const [name, inst] of [["drawElements", false], ["drawArrays", false], ["drawElementsInstanced", true], ["drawArraysInstanced", true], ["drawRangeElements", false]]) {
    const proto = WebGL2RenderingContext.prototype, orig = proto[name];
    proto[name] = function (...a) {
      acc.calls++;
      const count = name === "drawRangeElements" ? a[4] : name === "drawArrays" || name === "drawArraysInstanced" ? a[2] : a[1];
      acc.tris += tri(a[0], count) * (inst ? a[a.length - 1] : 1);
      return orig.apply(this, a);
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.__f = { dt: [], js: [], calls: [], tris: [], on: false };
  let last = 0;
  window.requestAnimationFrame = (cb) => raf((t) => {
    const f = window.__f;
    if (f.on && last) { f.dt.push(t - last); f.calls.push(acc.calls); f.tris.push(acc.tris); }
    last = t; acc.calls = 0; acc.tris = 0;
    const a = performance.now();
    try { cb(t); } finally { if (f.on) f.js.push(performance.now() - a); }
  });
});
const url = `http://127.0.0.1:${PORT}/?qa=1${PHYSICS === "default" ? "" : `&physics=${PHYSICS}`}`;
await page.goto(url);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 240000 });
const q = (fn, ...a) => page.evaluate(fn, ...a);
const note = (k, v) => console.error(`[trace] ${k}`, JSON.stringify(v));
await q(() => { const p = window.__qa.game.player; p.hp = p.maxHP = 1e9; }); // the scene is measured, not survived

// Load the monsters' models the way the game does: enter the areas that hold them (area entry loads both cycles' deferred models).
// Templates are the real resident entities each area builds; the cycle is set per visit so the slot holds the wanted monster.
const WANT = { eel: "giant-eel", crow: "original-crow", elephant: "original-elephant", spider: "original-spider", centipede: "giant-centipede", ratking: "original-rat" };
// area7 is entered twice: cycle A holds the Rat King (loads the rat-king model), then its parked state is dropped and cycle B builds the spider.
const TOUR = [["east", "B", "eel"], ["lambeth", "B", "crow"], ["elephant-and-castle", "A", "elephant"], ["area7", "A", "ratking"], ["area8", "B", "centipede"], ["area7", "B", "spider", true]];
const visits = [];
for (const [areaId, cycle, name, fresh] of TOUR) {
  const r = await q(async ([areaId, cycle, name, rigName, fresh]) => {
    const qa = window.__qa, g = qa.game;
    g.animalCycle = cycle;
    if (fresh) { delete g.areaFights[areaId]; qa.world.unmarkAreaReady?.(areaId); } // so the next entry prepares (and loads the models of) the new cycle
    window.__tpl ??= {};
    const t0 = performance.now();
    let ok = null, err = null;
    try { ok = await qa.session.activateArea({ areaId, entryPoint: qa.world.manifest.entries[areaId] }); } catch (e) { err = String(e.message ?? e); }
    await new Promise((s) => setTimeout(s, 2500));
    const e = qa.game.enemies.find((x) => x.rig === rigName && x.hp > 0);
    if (e) window.__tpl[name] = { ...e };
    return { areaId, cycle, ok, err, ms: Math.round(performance.now() - t0), area: qa.world.areaId, rigs: qa.game.enemies.map((x) => x.rig), got: !!e };
  }, [areaId, cycle, name, WANT[name], !!fresh]);
  visits.push(r);
  note("visit", r);
}

// The scene is built up in steps, each measured, so the cost of each addition is a difference (the last area entered holds it all):
// the area's own residents (baseline) -> + hostiles -> + each monster in turn -> + two marked hunters that die as ragdolls.
const setup = await q(() => {
  const g = window.__qa.game, px = g.player.pos.x, pz = g.player.pos.z;
  const base = g.enemies.find((e) => e.hp > 0 && !e.markedHunter && e.rig === "hollow-scavenger") ?? g.enemies.find((e) => e.hp > 0 && !e.markedHunter);
  window.__put = (src, id, key, r, a) => {
    const pos = { x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r };
    g.enemies.push({ ...src, id, placementKey: key, pos, home: { ...pos }, swing: null, hp: src.maxHP ?? src.hp });
  };
  window.__base = base;
  return { enemies: g.enemies.length, area: window.__qa.world.areaId, baseRig: base?.rig, templates: Object.keys(window.__tpl ?? {}) };
});
note("setup", setup);
await page.waitForTimeout(PHYSICS === "0" ? 3000 : 9000); // the lazy physics chunk preloads on idle
const errs0 = logs.filter((l) => /PAGEERROR|error/i.test(l)).slice(0, 8);

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2) : null; };
const summary = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1) });
const measure = async (ms) => {
  await q(() => { const f = window.__f; f.dt.length = f.js.length = f.calls.length = f.tris.length = 0; f.on = true; });
  await page.waitForTimeout(ms);
  const f = await q(() => { const f = window.__f; f.on = false; return { dt: [...f.dt], js: [...f.js], calls: [...f.calls], tris: [...f.tris] }; });
  const alive = await q(() => window.__qa.game.enemies.filter((e) => e.hp > 0).length);
  return { alive, frameMs: summary(f.dt), jsMs: summary(f.js), drawCalls: summary(f.calls), triangles: summary(f.tris) };
};
const steps = [];
const stepWindow = async (label, ms) => { const m = await measure(ms); steps.push({ label, enemies: await q(() => window.__qa.game.enemies.filter((e) => e.hp > 0).length), ...m }); note("step", steps.at(-1)); return m; };
await stepWindow("area residents only", SECONDS * 1000);
await q((n) => { for (let i = 0; window.__base && i < n; i++) window.__put(window.__base, 90000 + i, `qa-h-${i}`, 6, (i / n) * Math.PI * 2); }, HOSTILES);
await page.waitForTimeout(2500); // views build
const idle = await stepWindow(`+${HOSTILES} hostiles`, SECONDS * 1000);
const MONSTERS = ["eel", "elephant", "ratking", "spider", "centipede", "crow"];
for (const [i, name] of MONSTERS.entries()) {
  const added = await q(([name, i, total]) => { const src = window.__tpl?.[name]; if (!src) return false; window.__put(src, 92000 + i, `qa-m-${name}`, 9, (i / total) * Math.PI * 2 + 0.3); return true; }, [name, i, MONSTERS.length]);
  await page.waitForTimeout(2500);
  if (added) await stepWindow(`+${name}`, Math.max(3000, SECONDS * 600));
  else steps.push({ label: `+${name}`, missing: true });
}
const withMonsters = steps.at(-1);

// Two marked hunters arrive in view and die at once (the game's own lethal ranged hit): the boss ragdoll cost.
// The simulation is stepped (session.step) to the arrival, because a software-rendered page runs at a frame or two a second.
await q(() => { const s = window.__qa.game.markedHunt; if (s) { s.arrivedAt = -1e6; s.nextSpawnAt = 0; s.nextAttemptAt = 0; } });
await q(() => { const g = window.__qa.game; g.marked ??= { version: 1, carried: 0, bank: 0, bounty: 0 }; }); // no Marked state = no hunter (huntBlocked)
// (markedHunt is created by the first hunter step in this area, so the arrival clock is moved back on every poll, not once)
const hunterSeen = await page.waitForFunction(() => {
  const g = window.__qa.game, s = g.markedHunt;
  if (s) { s.arrivedAt = -1e6; s.nextSpawnAt = 0; s.nextAttemptAt = 0; }
  return g.enemies.some((e) => e.markedHunter && e.hp > 0);
}, null, { timeout: 240000, polling: 500 }).then(() => true, () => false);
note("hunter wait", await q(() => { const g = window.__qa.game; return { seen: g.enemies.some((e) => e.markedHunter), enemies: g.enemies.length, qa: g.enemies.filter((e) => String(e.placementKey).startsWith("qa-")).length, markedHunt: !!g.markedHunt, areaId: g.markedHunt?.areaId, area: window.__qa.world.areaId, finished: g.finished, time: g.time }; }));
await page.waitForTimeout(8000); // the hunter's own model streams in
const hunters = await q(() => {
  const g = window.__qa.game, h = g.enemies.find((e) => e.markedHunter && e.hp > 0);
  if (!h) return 0;
  h.pos = { x: g.player.pos.x - 1.5, z: g.player.pos.z + 3.5 }; h.home = { ...h.pos }; h.moveSpeed = 0;
  const p2 = { x: g.player.pos.x + 1.5, z: g.player.pos.z + 3.5 };
  g.enemies.push({ ...h, id: 91000, placementKey: "qa-hunter-1", pos: p2, home: { ...p2 }, swing: null });
  return g.enemies.filter((e) => e.markedHunter && e.hp > 0).length;
});
await page.waitForTimeout(1500);
const withHuntersAlive = await measure(4000);
await q(async () => {
  const { rangedHit } = await import("/src/combat.js"), g = window.__qa.game;
  for (const h of g.enemies.filter((e) => e.markedHunter && e.hp > 0)) rangedHit(g, { targetId: h.id, direction: { x: 0, z: -1 } }, "pistol", "pistol", 1e9);
});
const ragdollDeathWindow = await measure(4000); // both bodies fall
const ragdollSettled = await measure(3000);
const deathStats = await q(() => ({ ...globalThis.__physicsDeathStats }));
const gpu = await q(() => { const gl = document.createElement("canvas").getContext("webgl2"), e = gl?.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown"; });
const result = {
  physics: PHYSICS, viewport: "375x812@2", gpu, cores: await q(() => navigator.hardwareConcurrency),
  visits: visits.map((v) => ({ area: v.areaId, ok: v.ok, got: v.got, err: v.err, ms: v.ms })), setup, hunterSeen, hunters,
  steps, hostilesOnly: idle, withMonsters, withHuntersAlive, ragdollDeathWindow, ragdollSettled, deathStats,
  errors: [...errs0, ...logs.filter((l) => /PAGEERROR|ARMAGEDOM_LOAD_FAILED|error/i.test(l)).slice(0, 8)],
};
console.log("TRACE_RESULT " + JSON.stringify(result));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
await browser.close();
await server.close();
