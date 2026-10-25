// Two-finger (and three-finger) touch probe (dev tool, never shipped): drives the production build in headless Chrome with real touch
// points over the DevTools protocol (Input.dispatchTouchEvent, which turns into pointer events with separate pointer ids), at 375x812
// portrait, and checks that the move pad and every on-screen action work at the same time. Emulation only: it cannot prove a phone.
//   node scripts/multitouch-probe.mjs --dist dist [--json out.json] [--shots <dir>]
// Needs playwright-core (PLAYWRIGHT_CORE=<index.mjs>) and a Chrome (CHROME=<executable>). The page is opened with ?qa=1 on loopback; the
// probe reads the game through window.__qa (read-only). Setup only: the pistol is marked collected through __qa.game so the pistol
// controls (Fire, Reload, weapon tiles) exist; nothing else is changed.
import http from "node:http";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const dist = normalize(arg("dist", "dist")),
  shots = arg("shots", null);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".m4a": "audio/mp4" };
const server = http.createServer((req, res) => {
  const p = normalize(join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  try {
    const f = statSync(p).isDirectory() ? join(p, "index.html") : p;
    res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(readFileSync(f));
  } catch {
    res.writeHead(404).end("{}");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE ?? "playwright-core").href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME, args: ["--mute-audio", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- touch driver: the set of fingers currently down; every event sends the whole set, as the protocol expects.
const down = new Map(); // id -> {x, y}
const send = (type) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [...down].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
const finger = {
  async down(id, at) {
    down.set(id, { ...at });
    await send("touchStart");
  },
  async move(id, at) {
    down.set(id, { ...at });
    await send("touchMove");
  },
  async up(id) {
    // A finger is released by a touchEnd that lists THAT finger (what Puppeteer's TouchHandle.end does); the others stay down.
    const at = down.get(id);
    if (!at) return;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: at.x, y: at.y, id }] });
    down.delete(id);
  },
  async cancelAll() {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    down.clear();
  },
};

// ---- page helpers
await page.goto(`http://127.0.0.1:${server.address().port}/?qa=1&world=0`);
await page.waitForSelector("#enter");
await page.waitForTimeout(1200);
await page.tap("#enter");
await page.waitForFunction(() => globalThis.__qa?.state?.().loaded === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  globalThis.__events = [];
  globalThis.__qa.session.events((e) => globalThis.__events.push(e.type));
});
const centre = async (selector) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height } : null;
  }, selector);
const read = () =>
  page.evaluate(() => {
    const g = __qa.game,
      p = g.player,
      cls = (id) => document.getElementById(id)?.classList.contains("pressed") ?? null;
    const move = document.getElementById("move");
    return {
      t: +g.time.toFixed(2),
      pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) },
      stamina: +p.stamina.toFixed(1),
      hp: p.hp,
      weapon: p.weapon,
      swing: !!p.swing,
      guarding: !!p.guarding,
      dodgeUntil: +(p.dodgeUntil ?? 0).toFixed(2),
      pistol: g.pistol ? { equipped: !!g.pistol.equipped, collected: !!g.pistol.collected, magazine: g.pistol.magazine, reloadingUntil: g.pistol.reloadingUntil ?? 0 } : null,
      pressed: { move: cls("move"), slash: cls("slash"), stab: cls("stab"), heavy: cls("heavy"), dodge: cls("dodge"), guard: cls("guard") },
      knob: { x: parseFloat(move.style.getPropertyValue("--knob-x")) || 0, y: parseFloat(move.style.getPropertyValue("--knob-y")) || 0 },
      events: globalThis.__events.slice(),
    };
  });
const clearEvents = () => page.evaluate(() => (globalThis.__events.length = 0));
const results = [];
const note = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
};
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const eventsOf = (s, ...types) => s.events.filter((t) => types.includes(t));

// A touch on the pad centre then a drag right to full tilt; the pad's geometry comes from the page.
const pad = await centre("#move");
const PAD_START = { x: pad.x, y: pad.y },
  PAD_FULL = { x: pad.x + 46, y: pad.y };
const action = { slash: await centre("#slash"), stab: await centre("#stab"), heavy: await centre("#heavy"), dodge: await centre("#dodge"), guard: await centre("#guard") };

// Every case starts from the same open spot: walking right again and again would put the player against a wall, and a blocked
// player proves nothing about the pad. (QA setup through the read-only bridge's live game object.)
const HOME = await page.evaluate(() => ({ x: __qa.game.player.pos.x, z: __qa.game.player.pos.z }));
async function settle() {
  while (down.size) await finger.up([...down.keys()][0]);
  await sleep(700);
  await page.evaluate((home) => {
    const p = __qa.game.player;
    p.pos.x = home.x;
    p.pos.z = home.z;
  }, HOME);
  await sleep(300);
}
// Nothing may be left pressed after every finger is up (the no-stick check).
async function assertClean(label) {
  await sleep(500);
  const a = await read();
  await sleep(500);
  const b = await read();
  const stuck = Object.entries(a.pressed).filter(([, v]) => v).map(([k]) => k);
  const ok = !stuck.length && a.knob.x === 0 && a.knob.y === 0 && !a.guarding && dist2(a.pos, b.pos) < 0.05 && !down.size;
  note(`${label}: nothing sticks after the lift`, ok, ok ? "" : `pressed=${stuck} knob=${a.knob.x},${a.knob.y} guarding=${a.guarding} drift=${dist2(a.pos, b.pos).toFixed(2)}m`);
}

await settle();
// ---- baseline: one finger on the pad alone moves the player (so "moves" below means something)
{
  const s0 = await read();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(700);
  const s1 = await read();
  await settle();
  note("baseline: the pad alone moves the player and tilts the knob", dist2(s0.pos, s1.pos) > 0.3 && Math.abs(s1.knob.x) > 30, `moved ${dist2(s0.pos, s1.pos).toFixed(2)} m, knob ${s1.knob.x.toFixed(1)} px`);
}

// ---- A: pad held, then each action tapped / held
const ACTIONS = [
  { id: "slash", mode: "tap" },
  { id: "stab", mode: "tap" },
  { id: "heavy", mode: "tap" },
  { id: "dodge", mode: "tap" },
  { id: "guard", mode: "hold" },
];
async function acted(id, before, after) {
  if (id === "guard") return after.guarding || after.pressed.guard;
  if (id === "dodge") return after.dodgeUntil > before.t || after.stamina < before.stamina - 5 || eventsOf(after, "dodge").length > 0;
  return after.swing || after.stamina < before.stamina - 5 || eventsOf(after, "attack", "swing", "hit", "miss", "heavy").length > 0;
}
for (const { id, mode } of ACTIONS) {
  await settle();
  await clearEvents();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(350);
  const before = await read();
  await finger.down(2, { x: action[id].x, y: action[id].y });
  await sleep(mode === "hold" ? 450 : 90);
  if (mode === "tap") await finger.up(2);
  await sleep(250);
  const mid = await read();
  const fired = await acted(id, before, mid);
  note(`A  pad held + ${mode} ${id}: action registers`, !!fired, `stamina ${before.stamina}->${mid.stamina} swing=${mid.swing} guard=${mid.guarding} events=${[...new Set(mid.events)]}`);
  // An attack, a roll or a guard may hold the player still for a moment, so the pad is judged by its knob now and by the player
  // walking again once the action is over, the pad finger never having left the glass.
  if (mode === "hold") await finger.up(2);
  await sleep(1000);
  const r0 = await read();
  await sleep(500);
  const r1 = await read();
  note(`A  pad held + ${mode} ${id}: the stick still steers after the action`, r0.knob.x > 30 && r1.knob.x > 30 && dist2(r0.pos, r1.pos) > 0.2, `knob ${mid.knob.x.toFixed(1)} -> ${r1.knob.x.toFixed(1)} px, walked ${dist2(r0.pos, r1.pos).toFixed(2)} m afterwards`);
  await finger.up(1);
  await assertClean(`A  pad + ${id}`);
}

// ---- B: hold an action first, then start moving with the other thumb
for (const { id } of ACTIONS.filter((a) => a.id !== "dodge")) {
  await settle();
  await clearEvents();
  const before = await read();
  await finger.down(1, { x: action[id].x, y: action[id].y });
  await sleep(250);
  await finger.down(2, PAD_START);
  await finger.move(2, PAD_FULL);
  await sleep(700);
  const mid = await read();
  const fired = id === "guard" ? mid.guarding || mid.pressed.guard : mid.pressed[id] || mid.swing || mid.stamina < before.stamina - 5 || eventsOf(mid, "attack", "swing", "hit", "miss", "heavy").length > 0;
  note(`B  ${id} held, then the pad: the action is still active`, !!fired, `pressed=${mid.pressed[id]} swing=${mid.swing} guard=${mid.guarding} stamina ${before.stamina}->${mid.stamina}`);
  note(`B  ${id} held, then the pad: the stick registers`, mid.knob.x > 30, `knob ${mid.knob.x.toFixed(1)} px`);
  await finger.up(1); // lift the action; the pad finger stays down and must walk the player
  await sleep(1000);
  const r0 = await read();
  await sleep(500);
  const r1 = await read();
  note(`B  ${id} held, then the pad: the player walks once the action is lifted`, r1.knob.x > 30 && !r1.pressed[id] && dist2(r0.pos, r1.pos) > 0.2, `knob ${r1.knob.x.toFixed(1)} px, ${id} pressed=${r1.pressed[id]}, walked ${dist2(r0.pos, r1.pos).toFixed(2)} m`);
  await finger.up(2);
  await assertClean(`B  ${id} then pad`);
}

// ---- C: dodge needs its own check while moving (it is a tap with a cost and a roll)
{
  await settle();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(300);
  const b = await read();
  await finger.down(2, { x: action.dodge.x, y: action.dodge.y });
  await finger.up(2);
  await sleep(200);
  const m = await read();
  await settle();
  note("C  pad held + dodge tap while moving", m.dodgeUntil > b.t || m.stamina < b.stamina - 5, `dodgeUntil ${m.dodgeUntil}, stamina ${b.stamina}->${m.stamina}`);
}

// ---- D: a third finger does not break the first two
const THIRD = [
  { name: "another action (slash)", at: { x: action.slash.x, y: action.slash.y } },
  { name: "the pad itself (a second pad contact)", at: { x: pad.x - 20, y: pad.y + 20 } },
  { name: "the world (canvas)", at: { x: 187, y: 330 } },
  { name: "the HUD top area", at: { x: 120, y: 60 } },
];
for (const third of THIRD) {
  await settle();
  await clearEvents();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await finger.down(2, { x: action.guard.x, y: action.guard.y });
  await sleep(350);
  const before = await read();
  await finger.down(3, third.at);
  await sleep(250);
  await finger.move(3, { x: third.at.x + 6, y: third.at.y - 6 });
  await sleep(250);
  const mid = await read();
  await finger.up(3);
  await sleep(300);
  const after = await read();
  // Starting an attack drops the guard by the game's own rule; the guard FINGER must still be held down by the input (pressed) and the
  // guard must be back once the swing is over, so the check below reads the guard again later.
  const slashThird = third.name.includes("slash");
  await sleep(700);
  const later = await read();
  note(
    `D  third finger on ${third.name}: stick and guard survive`,
    mid.knob.x > 30 && after.knob.x > 30 && later.knob.x > 30 && (slashThird ? later.guarding && later.pressed.guard : (mid.guarding || mid.pressed.guard) && (after.guarding || after.pressed.guard) && later.guarding),
    `knob ${mid.knob.x.toFixed(1)}/${after.knob.x.toFixed(1)}/${later.knob.x.toFixed(1)} px, guarding ${mid.guarding}/${after.guarding}/${later.guarding}, guard pressed ${mid.pressed.guard}/${after.pressed.guard}/${later.pressed.guard}, events=${[...new Set(mid.events)]}`,
  );
  await finger.up(2); // guard lifted: the pad finger (still down, under a third finger's history) must walk the player
  await sleep(800);
  const w0 = await read();
  await sleep(500);
  const w1 = await read();
  note(`D  third finger on ${third.name}: the player walks once guard is lifted`, w1.knob.x > 30 && dist2(w0.pos, w1.pos) > 0.2, `knob ${w1.knob.x.toFixed(1)} px, walked ${dist2(w0.pos, w1.pos).toFixed(2)} m`);
  await finger.up(1);
  await assertClean(`D  third on ${third.name}`);
}

// ---- E: lift orders and a cancelled contact must leave nothing stuck
for (const order of [[1, 2], [2, 1]]) {
  await settle();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await finger.down(2, { x: action.guard.x, y: action.guard.y });
  await sleep(500);
  for (const id of order) {
    await finger.up(id);
    await sleep(150);
  }
  await assertClean(`E  lift order ${order.join(" then ")}`);
}
{
  await settle();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await finger.down(2, { x: action.guard.x, y: action.guard.y });
  await sleep(400);
  await finger.cancelAll(); // the system takes the touches (a notification pull-down, a palm)
  await sleep(400);
  await assertClean("E  every contact cancelled (touchcancel)");
}

// ---- H0: the ground pickup button ("PICK UP & EQUIP PISTOL") tapped while the pad is held
{
  await settle();
  const spot = await page.evaluate(() => ({ ...__qa.game.pistol.pickupPos }));
  // Control first: one finger, no pad, same spot. (If this fails the probe's setup is wrong, not the two-finger path.)
  await page.evaluate((p) => {
    const pos = __qa.game.player.pos;
    pos.x = p.x;
    pos.z = p.z;
  }, spot);
  await sleep(400);
  const cButton = await centre("#pistol-interact");
  if (cButton) {
    await finger.down(1, { x: cButton.x, y: cButton.y });
    await sleep(80);
    await finger.up(1);
    await sleep(500);
  }
  const c = await read();
  note('H0 control, ONE finger, tap "PICK UP & EQUIP PISTOL"', !!cButton && c.pistol?.collected === true, `collected=${c.pistol?.collected}`);
  // Put the pistol back on the ground for the two-finger run (QA setup through the live game object).
  await page.evaluate(() => {
    const p = __qa.game.pistol;
    p.collected = false;
    p.equipped = false;
  });
  await settle();
  await finger.down(1, PAD_START);
  await finger.move(1, { x: pad.x, y: pad.y + 9 }); // a light tilt (past the dead zone): the pad is held, the player drifts slowly and stays in reach
  await page.evaluate((p) => {
    const pos = __qa.game.player.pos;
    pos.x = p.x;
    pos.z = p.z;
  }, spot);
  await sleep(250);
  const button = await centre("#pistol-interact");
  const shown = !!button;
  await page.evaluate(() => {
    globalThis.__trace = [];
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"])
      document.addEventListener(type, (e) => globalThis.__trace.push(`${type}:${e.pointerId ?? ""}:${e.target?.id || e.target?.tagName}`), true);
  });
  if (button) {
    await finger.down(2, { x: button.x, y: button.y });
    await sleep(80);
    await finger.up(2);
    await sleep(600);
  }
  const m = await read();
  const trace = await page.evaluate(() => globalThis.__trace.join(" "));
  const nearby = await page.evaluate(() => document.getElementById("pistol-interact")?.textContent);
  note('H0 pad held + tap "PICK UP & EQUIP PISTOL"', shown && m.pistol?.collected === true && m.pistol?.equipped === true, `button shown=${shown} label="${nearby}", collected=${m.pistol?.collected}, equipped=${m.pistol?.equipped}, trace: ${trace}`);
  await finger.up(1);
  await assertClean("H0 pad + pickup button");
}

// ---- F: pistol controls (Fire, Reload) and the weapon tiles with the pad held
await settle();
const pistolReady = await page.evaluate(() => {
  const g = __qa.game;
  if (!g.pistol) return false;
  g.pistol.collected = true;
  if (!(g.pistol.magazine > 0)) g.pistol.magazine = 6;
  if (g.pistol.reserve == null || g.pistol.reserve < 6) g.pistol.reserve = 12;
  return true;
});
await sleep(800);
const tiles = await page.evaluate(() => [...document.querySelectorAll("#weapon-tiles-track button")].map((b) => ({ text: b.textContent.trim().slice(0, 20), pressed: b.getAttribute("aria-pressed"), disabled: b.disabled })));
console.log("tiles:", JSON.stringify(tiles), "pistolReady:", pistolReady);
const tilePoints = await page.evaluate(() =>
  [...document.querySelectorAll("#weapon-tiles-track button")].map((b) => {
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim().slice(0, 12), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: r.width > 0 };
  }),
);
// Control: the same tap with ONE finger and no pad, to tell a two-finger problem from a setup problem.
for (const tile of tilePoints.filter((t) => t.visible).reverse()) {
  await settle();
  await finger.down(1, { x: tile.x, y: tile.y });
  await sleep(80);
  await finger.up(1);
  await sleep(500);
  const c = await read();
  note(`F0 control, ONE finger, tap weapon tile "${tile.text}"`, tile.text.startsWith("PISTOL") ? c.pistol?.equipped === true : c.pistol?.equipped !== true, `pistol equipped ${c.pistol?.equipped}`);
}
for (const tile of tilePoints.filter((t) => t.visible)) {
  await settle();
  const before = await read();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(300);
  await finger.down(2, { x: tile.x, y: tile.y });
  await sleep(80);
  await finger.up(2);
  await sleep(500);
  const mid = await read();
  const equippedPistol = mid.pistol?.equipped;
  note(`F  pad held + tap weapon tile "${tile.text}": the tile is selected (aria-pressed)`, tile.text.startsWith("PISTOL") ? equippedPistol === true : equippedPistol !== true, `weapon ${before.weapon}->${mid.weapon}, pistol equipped ${before.pistol?.equipped}->${equippedPistol}`);
  note(`F  pad held + tap weapon tile "${tile.text}": the stick keeps steering`, mid.knob.x > 30 && dist2(before.pos, mid.pos) > 0.2, `knob ${mid.knob.x.toFixed(1)} px, moved ${dist2(before.pos, mid.pos).toFixed(2)} m`);
  await finger.up(1);
  await assertClean(`F  pad + tile ${tile.text}`);
}
// ---- G: pistol Fire and Reload with the pad held, and Fire held before the pad
await settle();
await finger.down(1, { x: tilePoints.find((t) => t.text.startsWith("PISTOL")).x, y: tilePoints.find((t) => t.text.startsWith("PISTOL")).y });
await sleep(80);
await finger.up(1);
await sleep(600);
await page.evaluate(() => {
  __qa.game.pistol.magazine = 6;
  __qa.game.pistol.reserve = 12;
});
{
  await settle();
  const before = await read();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(300);
  await finger.down(2, { x: action.slash.x, y: action.slash.y });
  await sleep(120);
  await finger.up(2);
  await sleep(700);
  const m = await read();
  note("G  pistol: pad held + tap Fire shoots a round", m.pistol?.equipped === true && m.pistol.magazine < before.pistol.magazine, `magazine ${before.pistol?.magazine}->${m.pistol?.magazine}, equipped=${m.pistol?.equipped}, knob ${m.knob.x.toFixed(1)} px`);
  await finger.up(1);
  await assertClean("G  pad + Fire");
}
{
  await settle();
  await page.evaluate(() => {
    __qa.game.pistol.magazine = 2;
    __qa.game.pistol.reloadingUntil = 0;
  });
  const before = await read();
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(300);
  await finger.down(2, { x: action.stab.x, y: action.stab.y });
  await sleep(120);
  await finger.up(2);
  await sleep(500);
  const m = await read();
  note("G  pistol: pad held + tap Reload starts a reload", m.pistol?.reloadingUntil > before.t || m.pistol?.magazine > 2, `magazine ${before.pistol?.magazine}->${m.pistol?.magazine}, reloadingUntil ${m.pistol?.reloadingUntil} (game time ${m.t}), knob ${m.knob.x.toFixed(1)} px`);
  await finger.up(1);
  await sleep(2500);
  await assertClean("G  pad + Reload");
}
{
  await settle();
  await page.evaluate(() => {
    __qa.game.pistol.magazine = 6;
    __qa.game.pistol.reloadingUntil = 0;
  });
  const before = await read();
  await finger.down(1, { x: action.slash.x, y: action.slash.y }); // Fire held first
  await sleep(250);
  await finger.down(2, PAD_START);
  await finger.move(2, PAD_FULL);
  await sleep(700);
  const m = await read();
  note("G  pistol: Fire held, then the pad: both register", m.pistol.magazine < before.pistol.magazine && m.knob.x > 30, `magazine ${before.pistol.magazine}->${m.pistol.magazine}, knob ${m.knob.x.toFixed(1)} px, Fire pressed=${m.pressed.slash}`);
  await finger.up(1);
  await sleep(300);
  await finger.up(2);
  await assertClean("G  Fire then pad");
}

// ---- H: the menu button tapped while the pad is held (opens the menu; the pad contact must not stick)
{
  await settle();
  const menu = await centre("#menu-button");
  await finger.down(1, PAD_START);
  await finger.move(1, PAD_FULL);
  await sleep(300);
  await finger.down(2, { x: menu.x, y: menu.y });
  await sleep(80);
  await finger.up(2);
  await sleep(500);
  const open = await page.evaluate(() => !!document.getElementById("menu")?.open);
  note("H  pad held + tap the menu button opens the menu", open, `menu open=${open}`);
  await finger.up(1);
  await sleep(400);
  if (open) {
    const close = await centre("#close-menu");
    await finger.down(1, { x: close.x, y: close.y });
    await sleep(80);
    await finger.up(1);
    await sleep(500);
  }
  const closed = await page.evaluate(() => !document.getElementById("menu")?.open);
  await assertClean("H  pad + menu button");
  note("H  the menu closes again with one tap, nothing stuck", closed);
}
if (shots) await page.screenshot({ path: join(shots, "multitouch-end.png") });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pass; page errors: ${JSON.stringify(errors.slice(0, 3))}`);
if (arg("json", null)) writeFileSync(arg("json"), JSON.stringify({ results, errors, tiles }, null, 1));
await browser.close();
server.close();
process.exitCode = failed.length ? 1 : 0;
