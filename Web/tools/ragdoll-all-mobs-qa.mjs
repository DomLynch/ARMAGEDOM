// Ragdoll-all-mobs QA harness (dev tool, never shipped). Kills 65-bone humanoids in the REAL game with physics ON and checks the body.
//   node tools/ragdoll-all-mobs-qa.mjs [--web <Web dir to serve>] [--only crowd,bosses,cap] [--weapons pistol,knife,shotgun]
//        [--models hollow-scavenger,boss-warden,...] [--force-live 1] [--shots /tmp/ragdoll-qa] [--probe 1]
// --web          the Web/ checkout to serve (default: the one this file lives in). Run it on a SCRATCH checkout of the branch under test.
// --force-live   flips every `live:false` model row of data/physicsRigs.json to true IN MEMORY (vite transform), the file is never written.
// Per kill it samples every frame and reports: ragdoll engaged (vs baked fallback), max/min bone-to-parent length ratio against the
// pre-kill rest length (stretch/explode), NaN, lowest bone under the ground, seconds to settle, JS ms of the worst frame, console errors,
// and whether the original model still renders (pixel diff of the actor region with the actor hidden). Cap scenario: N simultaneous deaths.
// Stills: 375 wide strips per scenario in --shots. Needs a Chromium (CHROME=<exe>; REAL_GPU=1 for the Mac GPU) and playwright-core.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  WEB = resolve(arg("web", resolve(dirname(fileURLToPath(import.meta.url)), ".."))),
  SHOTS = arg("shots", "/tmp/ragdoll-qa"),
  ONLY = arg("only", "crowd,bosses,cap").split(","),
  WEAPONS = arg("weapons", "pistol,knife,shotgun").split(","),
  MODELS = arg("models", ""),
  FORCE_LIVE = arg("force-live", "0") === "1",
  PROBE = arg("probe", "0") === "1",
  CAP_N = Number(arg("capN", 5)),
  PORT = Number(arg("port", 38795)),
  SETTLE_LIMIT_S = Number(arg("settleLimit", 8)),
  STRETCH_MAX = Number(arg("stretchMax", 1.25)), // bone-to-parent length / rest length
  STRETCH_MIN = Number(arg("stretchMin", 0.75)),
  UNDERGROUND_M = Number(arg("underground", 0.06)), // lowest bone may sit this far below the ground the actor stood on
  FRAME_STALL_MS = Number(arg("stallMs", 120));
mkdirSync(SHOTS, { recursive: true });
const require = createRequire(resolve(WEB, "package.json"));
const need = (name, spec) => {
  try { return require(name); } catch {
    execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", spec], { cwd: WEB, stdio: "inherit" });
    return require(name);
  }
};
const { chromium } = need("playwright-core", "playwright-core@1.62.1");
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);

// vite's json plugin runs after "pre" plugins, so this sees the raw JSON text and hands JSON text back
const plugins = FORCE_LIVE ? [{
  name: "force-live",
  enforce: "pre",
  transform(code, id) {
    if (!/physicsRigs\.json$/.test(id.split("?")[0])) return null;
    const j = JSON.parse(code);
    for (const m of Object.values(j.models ?? {})) m.live = true;
    return { code: JSON.stringify(j), map: null };
  },
}] : [];
// The actor views are private to createActors(); expose the map to the page without touching the source file (vite transform only).
plugins.push({
  name: "expose-views",
  enforce: "pre",
  transform(code, id) {
    if (!/\/src\/actors\.js$/.test(id.split("?")[0])) return null;
    const hook = /\n  return \{\n    views,/;
    if (!hook.test(code)) throw new Error("harness: createActors() return shape changed, update the expose-views hook");
    return { code: code.replace(hook, "\n  globalThis.__qaViews = views;\n  globalThis.__qaLib = library;\n  return {\n    views,"), map: null };
  },
});
const server = await createServer({ root: WEB, plugins, server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: process.env.REAL_GPU ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, hasTouch: true })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__jsMs = [];
  window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); try { cb(t); } finally { window.__jsMs.push(performance.now() - a); } });
});
await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=1`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
await page.waitForTimeout(9000); // idle preload of the lazy physics chunk
const q = (fn, ...a) => page.evaluate(fn, ...a);

const world = await q(async () => {
  const qa = window.__qa, g = qa.game, w = qa.world;
  const { GAME_DATA } = await import("/src/engine/game-data.js");
  return {
    area: w.areaId,
    residents: [...new Set(g.enemies.map((e) => e.rig))],
    bossProfiles: Object.entries(w.bossData?.profiles ?? {}).map(([k, p]) => ({ k, modelRef: p.modelRef, hp: p.health })),
    rigs: Object.fromEntries(Object.entries(GAME_DATA.physicsRigs?.models ?? {}).map(([k, m]) => [k, { live: m.live, rig: m.rig, body: m.body }])),
    cap: GAME_DATA.physicsDeath.maxActive,
    poolSize: GAME_DATA.physicsDeath.poolSize,
    settleSeconds: GAME_DATA.physicsDeath.settleSeconds,
  };
});
if (PROBE) {
  console.log(JSON.stringify({ world, logs: logs.slice(0, 20) }, null, 1));
  await browser.close(); await server.close(); process.exit(0);
}
const rigRows = Object.entries(world.rigs).filter(([k]) => k !== "marked-hunter");
const wantModel = (m) => !MODELS || MODELS.split(",").includes(m);
const bossModels = world.bossProfiles; // profile -> modelRef, resolved in the page

// ---- in-page helpers (installed once) ----
await q(() => {
  const qa = window.__qa;
  const viewOf = (id) => globalThis.__qaViews?.get(id);
  const bonesOf = (view) => { const b = []; view.root.traverse((o) => { if (o.isBone) b.push(o); }); return b; };
  const wp = (o) => { const v = new o.position.constructor(); o.getWorldPosition(v); return v; };
  window.__qaH = {
    viewOf, bonesOf,
    // rest lengths: bone-to-parent world distance of every bone whose parent is a bone, taken while alive
    rest(view) {
      view.root.updateWorldMatrix(true, true);
      const m = new Map();
      for (const b of bonesOf(view)) if (b.parent?.isBone) m.set(b, wp(b).distanceTo(wp(b.parent)));
      return m;
    },
    // one reading of the dead body: stretch ratios, NaN, lowest y
    read(view, rest) {
      view.root.updateWorldMatrix(true, true);
      let maxR = 0, minR = Infinity, nan = false, minY = Infinity, worstBone = "", maxH = 0;
      for (const b of bonesOf(view)) {
        const p = wp(b);
        if (![p.x, p.y, p.z].every(Number.isFinite)) nan = true;
        minY = Math.min(minY, p.y);
        const r0 = rest.get(b);
        if (r0 > 0.02) { // ignore near-zero helper bones: a ratio of a few millimetres is noise
          const r = wp(b).distanceTo(wp(b.parent)) / r0;
          if (r > maxR) { maxR = r; worstBone = b.name; }
          minR = Math.min(minR, r);
        }
      }
      return { maxR, minR, nan, minY, worstBone };
    },
    state(view) {
      const s = view.physicsDeath;
      return { engaged: !!s && !s.failed, failed: !!s?.failed, frozen: !!s?.frozen, age: s?.age ?? null, awake: s?.rd ? s.rd.awake : null, hasBody: !!s?.rd };
    },
    rendered(view) { // original model still drawn: every skinned mesh and its ancestors visible, material not hidden
      let meshes = 0, hidden = 0;
      view.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        meshes++;
        let vis = true;
        for (let n = o; n; n = n.parent) if (n.visible === false) vis = false;
        const mats = [].concat(o.material);
        if (!vis || mats.every((m) => m.visible === false || m.opacity === 0)) hidden++;
      });
      return { meshes, hidden };
    },
  };
});

const stat = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? { n: s.length, p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s.at(-1).toFixed(1) } : { n: 0 }; };
const isErr = (l) => /^error|PAGEERROR/i.test(l) && !/status of 503/.test(l); // the harness answers the account API with 503 on purpose
const results = [];
let seq = 0;

// Put a fresh actor in view: a clone of a living resident, retargeted to `rigName` (and a boss profile when given), standing still.
async function spawn({ rig, profile, dx = 0, dz = 3.5 }) {
  const id = 95000 + seq++;
  await q(async ([rig, profile]) => { // deferred models (bosses) load on demand
    const p = profile ? window.__qa.world.bossData.profiles[profile].modelRef : rig;
    const lib = globalThis.__qaLib;
    if (!lib) throw Error("QA: no model library on the session");
    await lib.ensureModels([p]);
    if (!lib.models.has(p)) throw Error(`QA: ${p} did not load`);
  }, [rig, profile ?? null]);
  const ok = await q(([rig, profile, dx, dz, id]) => {
    const g = window.__qa.game, w = window.__qa.world;
    const base = g.enemies.find((e) => e.hp > 0 && !e.markedHunter && e.kind >= 0 && !e.bossProfile && e.rig === "hollow-scavenger") ?? g.enemies.find((e) => e.hp > 0 && !e.markedHunter && e.kind >= 0 && !e.bossProfile);
    if (!base) return false;
    const a = { ...base, id, placementKey: `qa-${id}`, rig, hp: base.maxHP, pos: { x: g.player.pos.x + dx, z: g.player.pos.z + dz }, swing: null, moveSpeed: 0, alerted: false, response: null, deathImpact: undefined };
    a.home = { ...a.pos };
    a.patrol = [{ ...a.pos }, { ...a.pos }];
    if (profile) {
      const p = w.bossData.profiles[profile];
      Object.assign(a, { rig: p.modelRef, bossProfile: p, bossName: p.name, hp: p.health, maxHP: p.health, radius: p.radius, mobSize: 1 });
    }
    g.enemies.push(a);
    return true;
  }, [rig, profile ?? null, dx, dz, id]);
  if (!ok) return null;
  const ready = await page.waitForFunction((id) => { const v = window.__qaH.viewOf(id); return v && window.__qaH.bonesOf(v).length > 20; }, id, { timeout: 60000 }).then(() => true, () => false);
  return ready ? id : null;
}

// Kill with a weapon through the game's own rangedHit (knife = the knife impulse row; the melee swing path is not driven here).
const killScript = ([id, weapon, dir]) => import("/src/combat.js").then(({ rangedHit }) => {
  const g = window.__qa.game, t = g.enemies.find((e) => e.id === id && e.hp > 0);
  if (!t) return false;
  rangedHit(g, { targetId: id, direction: dir }, weapon, weapon, 1e9, weapon === "knife" ? "melee" : "bullet");
  return t.hp <= 0;
});

// Sample the dying actors every animation frame in the page, return the series summary.
async function watch(ids, seconds) {
  return q(([ids, seconds]) => new Promise((resolve) => {
    const H = window.__qaH, rest = new Map(), out = new Map();
    for (const id of ids) out.set(id, { maxR: 0, minR: Infinity, nan: false, minY: Infinity, worstBone: "", settleAt: null, frames: 0, engagedEver: false, failedEver: false, maxLive: 0 });
    for (const id of ids) rest.set(id, window.__qaH.__rest?.get(id));
    const t0 = performance.now();
    const tick = () => {
      const now = (performance.now() - t0) / 1000;
      let live = 0;
      for (const id of ids) {
        const v = H.viewOf(id), o = out.get(id);
        if (!v) continue;
        const st = H.state(v), r = H.read(v, rest.get(id));
        o.frames++;
        o.maxR = Math.max(o.maxR, r.maxR); o.minR = Math.min(o.minR, r.minR); o.nan ||= r.nan; o.minY = Math.min(o.minY, r.minY);
        if (r.maxR >= o.maxR) o.worstBone = r.worstBone;
        o.engagedEver ||= st.engaged; o.failedEver ||= st.failed;
        if (st.engaged && !st.frozen && st.hasBody) live++;
        if (o.settleAt === null && st.engaged && (st.frozen || st.awake === false)) o.settleAt = now;
      }
      window.__qaH.maxLiveNow = Math.max(window.__qaH.maxLiveNow ?? 0, live);
      if (now >= seconds) return resolve([...out].map(([id, o]) => ({ id, ...o })));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [ids, seconds]);
}

const strip = async (files, out) => {
  const imgs = files.map((f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`);
  const p2 = await page.context().newPage();
  const url = await p2.evaluate(async (imgs) => {
    const els = await Promise.all(imgs.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
    const c = document.createElement("canvas"); c.width = els.reduce((a, i) => a + i.width, 0); c.height = els[0].height;
    const x = c.getContext("2d"); let o = 0; for (const i of els) { x.drawImage(i, o, 0); o += i.width; }
    return c.toDataURL("image/png");
  }, imgs);
  writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  await p2.close();
};

// One kill scenario: spawn, record rest lengths, kill, watch, measure, still strip, actor-render check.
async function scenario({ label, rig, profile, weapon }) {
  const slug = label.replace(/[^a-z0-9]+/gi, "-");
  const res = { label, rig, profile: profile ?? null, weapon, verdict: "PASS", notes: [] };
  console.error(`[qa] ${label}`);
  const id = await spawn({ rig, profile });
  if (id === null) { res.verdict = "SKIP"; res.notes.push("actor view never built (model not loaded or rig not spawnable by clone)"); results.push(res); return; }
  await page.waitForTimeout(1500);
  await q((id) => { window.__qaH.__rest ??= new Map(); window.__qaH.__rest.set(id, window.__qaH.rest(window.__qaH.viewOf(id))); }, id);
  const pre = await q((id) => ({ ...window.__qaH.rendered(window.__qaH.viewOf(id)), ground: window.__qaH.viewOf(id).root.position.y }), id);
  // Scale proof: world y of the pelvis and of the foot/hand/toe bones above the ground the actor stands on (alive, 2 frames after the kill, settled)
  const probe = (id) => {
    const v = window.__qaH.viewOf(id), by = {}; v.root.updateWorldMatrix(true, true);
    for (const b of window.__qaH.bonesOf(v)) by[b.name] = b.getWorldPosition(new b.position.constructor()).y - v.root.position.y;
    const ext = ["foot_l", "foot_r", "ball_l", "ball_r", "hand_l", "hand_r"].map((n) => by[n]);
    const pel = window.__qaH.bonesOf(v).filter((b) => b.name === "pelvis").map((b) => +(b.getWorldPosition(new b.position.constructor()).y - v.root.position.y).toFixed(3));
    return { pelvisNodes: pel, modelScale: +v.model?.scale.y.toFixed(3), rootScale: +v.root.scale.y.toFixed(3), hips: +by.pelvis?.toFixed(3), lowestEnd: +Math.min(...ext).toFixed(3), lowestAny: +Math.min(...Object.values(by)).toFixed(3) };
  };
  const hipsAlive = await q(probe, id);
  const errsBefore = logs.length;
  await q(() => { window.__jsMs.length = 0; window.__qaH.maxLiveNow = 0; });
  const shots = [`${SHOTS}/${slug}-0-alive.png`];
  await page.screenshot({ path: shots[0] });
  const killed = await q(killScript, [id, weapon, { x: 0, z: -1 }]);
  if (!killed) { res.verdict = "FAIL"; res.notes.push("lethal hit did not kill"); results.push(res); return; }
  const watching = watch([id], SETTLE_LIMIT_S + 1.5);
  await q(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const hipsStart = await q(probe, id);
  for (const [t, wait] of [["0.3s", 300], ["0.6s", 300], ["1.2s", 600], ["3.0s", 1800]]) {
    await page.waitForTimeout(wait);
    const f = `${SHOTS}/${slug}-${t}.png`;
    await page.screenshot({ path: f });
    shots.push(f);
  }
  const [r] = await watching;
  const js = await q(() => [...window.__jsMs]), hipsSettled = await q(probe, id);
  const st = await q((id) => window.__qaH.state(window.__qaH.viewOf(id)), id);
  const post = await q((id) => window.__qaH.rendered(window.__qaH.viewOf(id)), id);
  // does the actor still draw: screenshot with the actor hidden vs shown, the pixels must differ
  const a = `${SHOTS}/${slug}-shown.png`, b = `${SHOTS}/${slug}-hidden.png`;
  await page.screenshot({ path: a });
  await q((id) => { const v = window.__qaH.viewOf(id); v.root.visible = false; if (v.shadow) v.shadow.visible = false; }, id);
  await page.waitForTimeout(150);
  await page.screenshot({ path: b });
  await q((id) => { const v = window.__qaH.viewOf(id); v.root.visible = true; if (v.shadow) v.shadow.visible = true; }, id);
  const diff = await page.evaluate(async ([A, B]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const px = (i) => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const da = px(ia), db = px(ib); let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) n++;
    return n;
  }, [`data:image/png;base64,${readFileSync(a).toString("base64")}`, `data:image/png;base64,${readFileSync(b).toString("base64")}`]);
  shots.push(a);
  await strip(shots, `${SHOTS}/strip-${slug}.png`);

  const m = { scaleProof: { alive: hipsAlive, deathStart: hipsStart, settled: hipsSettled, hipsStartVsAlivePct: +(((hipsStart.hips / hipsAlive.hips) - 1) * 100).toFixed(1) },
    ragdoll: r.engagedEver && !r.failedEver, failedFallback: r.failedEver, maxStretch: +r.maxR.toFixed(3), minStretch: +r.minR.toFixed(3), worstBone: r.worstBone, nan: r.nan,
    lowestBoneBelowGround: +Math.max(0, pre.ground - r.minY).toFixed(3), settleSeconds: r.settleAt === null ? null : +r.settleAt.toFixed(2), worstFrameJsMs: stat(js).max, p95JsMs: stat(js).p95,
    visibleSkinnedMeshes: `${post.meshes - post.hidden}/${post.meshes} (alive ${pre.meshes - pre.hidden}/${pre.meshes})`, actorPixelsDrawn: diff,
    newConsoleErrors: logs.slice(errsBefore).filter(isErr).slice(0, 4), physicsAfter: st };
  res.metrics = m; res.strip = `${SHOTS}/strip-${slug}.png`;
  const bad = (why) => { res.verdict = "FAIL"; res.notes.push(why); };
  if (!m.ragdoll) { res.verdict = "BAKED"; res.notes.push(m.failedFallback ? "ragdoll threw, baked clip fallback" : "ragdoll never engaged (row not live or chunk missing): baked clip played"); }
  if (m.ragdoll && (m.maxStretch > STRETCH_MAX || m.minStretch < STRETCH_MIN)) bad(`bone length ratio ${m.minStretch}..${m.maxStretch} (bone ${m.worstBone})`);
  if (m.nan) bad("NaN in bone positions");
  if (m.lowestBoneBelowGround > UNDERGROUND_M) bad(`a bone ${m.lowestBoneBelowGround} m under the ground`);
  if (m.ragdoll && (m.settleSeconds === null || m.settleSeconds > SETTLE_LIMIT_S)) bad(`did not settle within ${SETTLE_LIMIT_S}s`);
  if (m.worstFrameJsMs > FRAME_STALL_MS) bad(`frame stall ${m.worstFrameJsMs} ms`);
  if (m.actorPixelsDrawn < 200 || post.meshes - post.hidden < Math.max(1, pre.meshes - pre.hidden)) bad(`original model not drawn (pixels ${m.actorPixelsDrawn}, meshes ${m.visibleSkinnedMeshes})`);
  if (m.newConsoleErrors.length) bad("console errors");
  results.push(res);
  // clear the corpse so the next scenario has the room
  await q((id) => { const g = window.__qa.game; g.enemies = g.enemies.filter((e) => e.id !== id); g.corpses = (g.corpses ?? []).filter((e) => e.id !== id); }, id);
  await page.waitForTimeout(500);
}

if (ONLY.includes("crowd"))
  for (const [model] of rigRows.filter(([k]) => !k.startsWith("boss-") && wantModel(k)))
    for (const weapon of WEAPONS) await scenario({ label: `${model}-${weapon}`, rig: model, weapon });
if (ONLY.includes("bosses"))
  for (const bp of bossModels.filter((b) => wantModel(b.modelRef) || wantModel(b.k)))
    for (const weapon of WEAPONS.slice(0, 1).concat(WEAPONS.includes("shotgun") ? ["shotgun"] : [])) // pistol + shotgun per boss; knife via --weapons on demand
      await scenario({ label: `boss-${bp.k}-${weapon}`, rig: bp.modelRef, profile: bp.k, weapon });

if (ONLY.includes("cap")) {
  const res = { label: `cap-${CAP_N}-simultaneous`, rig: "hollow-scavenger", weapon: "pistol", verdict: "PASS", notes: [] };
  const ids = [];
  for (let i = 0; i < CAP_N; i++) { const id = await spawn({ rig: "hollow-scavenger", dx: (i - (CAP_N - 1) / 2) * 0.9, dz: 3 + (i % 2) * 0.8 }); if (id !== null) ids.push(id); }
  if (ids.length < CAP_N) { res.verdict = "SKIP"; res.notes.push(`only ${ids.length} actors spawned`); }
  else {
    await page.waitForTimeout(1500);
    await q((ids) => { window.__qaH.__rest ??= new Map(); for (const id of ids) window.__qaH.__rest.set(id, window.__qaH.rest(window.__qaH.viewOf(id))); }, ids);
    const ground = await q((id) => window.__qaH.viewOf(id).root.position.y, ids[0]);
    const errsBefore = logs.length;
    await q(() => { window.__jsMs.length = 0; window.__qaH.maxLiveNow = 0; });
    await page.screenshot({ path: `${SHOTS}/cap-0-alive.png` });
    const watching = watch(ids, SETTLE_LIMIT_S + 1.5);
    await q(async (ids) => { const { rangedHit } = await import("/src/combat.js"), g = window.__qa.game; for (const id of ids) rangedHit(g, { targetId: id, direction: { x: 0, z: -1 } }, "pistol", "pistol", 1e9); }, ids); // same frame: simultaneous
    const files = [`${SHOTS}/cap-0-alive.png`];
    for (const [t, wait] of [["0.3s", 300], ["0.6s", 300], ["1.2s", 600], ["3.0s", 1800]]) { await page.waitForTimeout(wait); const f = `${SHOTS}/cap-${t}.png`; await page.screenshot({ path: f }); files.push(f); }
    const per = await watching, js = await q(() => [...window.__jsMs]), peak = await q(() => window.__qaH.maxLiveNow);
    const states = await q((ids) => ids.map((id) => window.__qaH.state(window.__qaH.viewOf(id))), ids);
    const stats = await q(() => ({ ...globalThis.__physicsDeathStats }));
    await strip(files, `${SHOTS}/strip-cap.png`);
    const engaged = per.filter((p) => p.engagedEver && !p.failedEver).length;
    res.metrics = { cap: world.cap, deaths: ids.length, peakSimultaneousLiveRagdolls: peak, ragdolledAtAll: engaged, bakedFallbacks: per.length - engaged, stats,
      perBody: per.map((p) => ({ id: p.id, ragdoll: p.engagedEver && !p.failedEver, maxStretch: +p.maxR.toFixed(2), nan: p.nan, belowGround: +Math.max(0, ground - p.minY).toFixed(2), settle: p.settleAt === null ? null : +p.settleAt.toFixed(1) })),
      worstFrameJsMs: stat(js).max, p95JsMs: stat(js).p95, newConsoleErrors: logs.slice(errsBefore).filter(isErr).slice(0, 4), states };
    res.strip = `${SHOTS}/strip-cap.png`;
    const bad = (why) => { res.verdict = "FAIL"; res.notes.push(why); };
    if (peak > world.cap) bad(`${peak} live ragdolls at once, cap ${world.cap}`);
    if (engaged === 0) { res.verdict = "BAKED"; res.notes.push("no ragdoll engaged"); }
    if (stat(js).max > FRAME_STALL_MS) bad(`frame stall ${stat(js).max} ms`);
    if (per.some((p) => p.nan)) bad("NaN");
    if (per.some((p) => p.maxR > STRETCH_MAX)) bad("stretch over limit");
    if (per.some((p) => ground - p.minY > UNDERGROUND_M)) bad("a body under the ground");
    if (res.metrics.newConsoleErrors.length) bad("console errors");
  }
  results.push(res);
}

const qaErrors = await q(() => window.__qa.errors);
console.log(JSON.stringify({ web: WEB, forceLive: FORCE_LIVE, world: { cap: world.cap, rigs: world.rigs }, results, qaErrors, allConsoleErrors: logs.filter(isErr).slice(0, 10) }, null, 1));
await browser.close();
await server.close();
