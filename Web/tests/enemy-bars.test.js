import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createEnemyBars, enemyBarsOn } from "../src/engine/enemy-bars.js";
import { validateEnemyBars } from "../src/engine/game-data-enemy-bars.js";
import { paletteColour, resetColourBlind, setColourBlindMode } from "../src/engine/colour-blind.js";

// The enemy health bars (data/enemyBars.json): hidden at full HP, shown 3 s after a hit and fading, always on for the aimed-at enemy, star
// variants and bosses, at most 12 at once, never for the dead, a hard cut under reduced motion, and a fixed pool of elements.
const RULES = GAME_DATA.enemyBars;

function fakeElement() {
  return {
    children: [],
    style: {},
    hidden: false,
    className: "",
    attributes: {},
    removed: false,
    append(...c) {
      this.children.push(...c);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    remove() {
      this.removed = true;
    },
  };
}

// A hud host, a body whose classes the test sets, and a camera looking down at the ground round the origin.
function rig({ reduced = false, desktop = false, search = "" } = {}) {
  const hud = Object.assign(fakeElement(), {
      before(el) {
        this.placed.push(el);
      },
      placed: [],
    }),
    classes = new Set(desktop ? ["desktop-ui"] : []),
    created = [],
    doc = {
      body: { classList: { contains: (name) => classes.has(name) } },
      getElementById: (id) => (id === "hud" ? hud : null),
      createElement: () => {
        const el = fakeElement();
        created.push(el);
        return el;
      },
    },
    camera = new T.PerspectiveCamera(50, 800 / 450, 0.1, 100);
  camera.position.set(0, 9, 7);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const media = { matches: reduced },
    g = { time: 10, player: { hp: 100, pos: { x: 0, z: 0 } }, enemies: [], touchTarget: null, pistolTargetId: null, finished: false },
    s = { game: g, camera, canvas: { clientWidth: 800, clientHeight: 450 }, loaded: true, contextLost: false, traveling: false },
    bars = createEnemyBars(s, { doc, matchMedia: () => media, search });
  const layer = hud.placed[0];
  return {
    g,
    s,
    bars,
    doc,
    hud,
    media,
    created,
    classes,
    layer,
    shown: () => (layer?.children ?? []).filter((el) => !el.hidden),
    step(seconds = 0) {
      g.time += seconds;
      bars.update();
    },
  };
}

let serial = 0;
const enemy = (x = 0, z = 0, extra = {}) => ({ id: ++serial, pos: { x, z }, hp: 100, maxHP: 100, ...extra });

test("a full-health enemy shows no bar; the first hit shows one with the remaining health", () => {
  const r = rig(),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  assert.equal(r.shown().length, 0);
  e.hp = 60;
  r.step(0.1);
  const [bar] = r.shown();
  assert.ok(bar, "bar after the hit");
  assert.equal(bar.children[1].style.width, "60%");
  assert.equal(bar.style.opacity, "1");
  assert.equal(bar.style.height, `${RULES.classes.normal.heightPx}px`);
  assert.match(bar.style.transform, /^translate\(-?\d+px,-?\d+px\) translate\(-50%,-100%\)$/);
});

test("the bar hides 3 s after the last hit, and a later hit holds it for another 3 s", () => {
  const r = rig(),
    e = enemy();
  assert.equal(RULES.holdSeconds, 3);
  r.g.enemies.push(e);
  r.step();
  e.hp = 80;
  r.step(0.1);
  r.step(2.8);
  assert.equal(r.shown().length, 1, "still shown 2.8 s after the hit");
  e.hp = 70;
  r.step(0.1);
  r.step(2.8);
  assert.equal(r.shown().length, 1, "the second hit restarted the clock");
  r.step(0.3);
  assert.equal(r.shown().length, 0, "hidden once 3 s have passed since the last hit");
});

test("a bar fades out over the last fadeSeconds and holds full opacity before that", () => {
  const r = rig(),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  e.hp = 50;
  r.step(0.1);
  r.step(RULES.holdSeconds - RULES.fadeSeconds - 0.2);
  assert.equal(r.shown()[0].style.opacity, "1");
  r.step(RULES.fadeSeconds / 2 + 0.2);
  const half = Number(r.shown()[0].style.opacity);
  assert.ok(half > 0 && half < 1, `fading, opacity ${half}`);
  r.step(RULES.fadeSeconds / 4);
  assert.ok(Number(r.shown()[0].style.opacity) < half, "still dimming");
});

test("under reduced motion the bar stays at full opacity and hides with a hard cut", () => {
  const r = rig({ reduced: true }),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  e.hp = 50;
  r.step(0.1);
  r.step(RULES.holdSeconds - 0.2);
  assert.equal(r.shown()[0].style.opacity, "1", "no fade near the end");
  r.step(0.3);
  assert.equal(r.shown().length, 0);
});

test("the aimed-at enemy gets a thin bar at full health, cleared 10 s after its last hit; an ordinary bar goes after 3 s", () => {
  const r = rig(),
    a = enemy(-1, 0),
    b = enemy(1, 0);
  r.g.enemies.push(a, b);
  r.step();
  assert.equal(r.shown().length, 0);
  r.g.touchTarget = { id: a.id };
  r.step(5);
  assert.equal(r.shown().length, 1, "shown with no hit at all");
  assert.equal(r.shown()[0].children[1].style.width, "100%");
  assert.equal(r.shown()[0].style.height, `${RULES.target.heightPx}px`);
  assert.equal(RULES.target.heightPx, 2);
  a.hp = 70;
  r.step(0.1);
  r.step(RULES.holdSeconds + 1);
  assert.equal(r.shown().length, 1, "still held after the ordinary 3 s");
  r.step(RULES.targetHoldSeconds - RULES.holdSeconds - 2);
  assert.equal(r.shown().length, 1);
  r.step(2);
  assert.equal(r.shown().length, 0, "cleared 10 s after the last hit while still aimed at");
  a.hp = 60;
  r.step(0.1);
  assert.equal(r.shown().length, 1, "a new hit brings it back");
  r.g.touchTarget = null;
  r.g.pistolTargetId = b.id;
  r.step(5);
  assert.equal(r.shown().filter((el) => el.children[1].style.width === "100%").length, 1, "the pistol lock counts too");
  r.g.pistolTargetId = null;
  r.step(5);
  assert.equal(r.shown().length, 0);
});

test("the aimed-at bar is as wide as the body on screen, within the data's limits", () => {
  const r = rig(),
    wide = enemy(-1.5, 0),
    narrow = enemy(1.5, 0);
  r.s.actors = { views: new Map() };
  for (const [e, metres] of [
    [wide, 1.4],
    [narrow, 0.5],
  ]) {
    const root = new T.Group(),
      mesh = new T.Mesh(new T.BoxGeometry(metres, 2, metres));
    mesh.position.y = 1;
    root.add(mesh);
    root.position.set(e.pos.x, 0, -e.pos.z);
    r.s.actors.views.set(e.id, { root });
  }
  r.g.enemies.push(wide, narrow);
  const widthOf = (e) => {
    r.g.pistolTargetId = e.id;
    r.step(0.1);
    return Number.parseInt(r.shown()[0].style.width, 10);
  };
  r.step();
  const w = widthOf(wide),
    n = widthOf(narrow);
  assert.ok(w > n, `${w}px for the wide body, ${n}px for the narrow one`);
  assert.ok(n >= RULES.target.minWidthPx && w <= RULES.target.maxWidthPx);
});

test("the bar stands above the drawn head: a taller body lifts it, measured once", () => {
  const r = rig(),
    tall = enemy(-1, 0, { hp: 50 }),
    low = enemy(1, 0, { hp: 50 });
  r.s.actors = { views: new Map() };
  const meshes = [];
  for (const [e, metres] of [
    [tall, 2.4],
    [low, 0.6],
  ]) {
    const root = new T.Group(),
      mesh = new T.Mesh(new T.BoxGeometry(0.5, metres, 0.5));
    mesh.position.y = metres / 2;
    root.add(mesh);
    root.position.set(e.pos.x, 0, -e.pos.z);
    r.s.actors.views.set(e.id, { root });
    meshes.push(mesh);
  }
  r.g.enemies.push(tall, low);
  r.step();
  tall.hp = 20;
  low.hp = 20;
  r.step(0.1);
  const y = () => r.shown().map((el) => Number(/,(-?\d+)px\)/.exec(el.style.transform)[1]));
  const [a, b] = y();
  assert.ok(a < b, `the tall body's bar sits higher on screen (${a} against ${b})`);
  meshes[0].scale.y = 0.1;
  meshes[0].updateMatrixWorld(true);
  r.step(0.1);
  assert.deepEqual(y(), [a, b], "the height is not measured again");
});

test("the fill turns amber under half health, gold-white for a star and blue for a pack follower", () => {
  const r = rig(),
    plain = enemy(-2, 0),
    star = enemy(0, 0, { star: { stars: 1 } }),
    follower = enemy(2, 0, { residentIntent: { companionDistance: 3 } });
  r.g.enemies.push(plain, star, follower);
  r.step();
  plain.hp = 70;
  follower.hp = 70;
  star.hp = 30;
  r.step(0.1);
  const colours = () => r.shown().map((el) => el.children[1].style.background).sort();
  assert.deepEqual(colours(), [RULES.colours.elite, RULES.colours.fill, RULES.colours.follower].sort());
  plain.hp = 40;
  r.step(0.1);
  assert.ok(colours().includes(RULES.colours.low), "amber below 50%");
  assert.equal(RULES.lowFraction, 0.5);
});

test("a pale trail follows the real health down after a short delay, by game seconds and not by frame", () => {
  const run = (steps) => {
    const r = rig(),
      e = enemy();
    r.g.enemies.push(e);
    r.step();
    e.hp = 40;
    r.step(0);
    const trail = () => Number.parseInt(r.shown()[0].children[0].style.width, 10);
    assert.equal(trail(), 100, "the trail starts where the health was");
    assert.equal(r.shown()[0].children[1].style.width, "40%");
    for (let i = 0; i < steps; i++) r.step(1 / steps);
    return trail();
  };
  const frames = [1, 10, 60].map(run);
  assert.equal(frames[0], frames[1]);
  assert.equal(frames[1], frames[2]);
  const closed = Math.round((1 - RULES.decay.perSecond * (1 - RULES.decay.delaySeconds)) * 100);
  assert.ok(Math.abs(frames[0] - closed) <= 1, `${frames[0]}% after 1 s, expected about ${closed}%`);
  const r = rig(),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  e.hp = 40;
  r.step(0);
  r.step(RULES.decay.delaySeconds / 2);
  assert.equal(r.shown()[0].children[0].style.width, "100%", "it waits out the delay");
  r.step(2);
  assert.equal(Number.parseInt(r.shown()[0].children[0].style.width, 10), 40, "and lands on the real health");
});

test("under reduced motion the trail does not animate", () => {
  const r = rig({ reduced: true }),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  e.hp = 40;
  r.step(0.1);
  assert.equal(r.shown()[0].children[0].style.width, "40%");
});

test("star variants and hunters are always shown in gold-white; bosses always, bigger, red until hurt", () => {
  const r = rig(),
    plain = enemy(-2, 0, { hp: 50 }),
    star = enemy(0, 0, { star: { stars: 1 } }),
    boss = enemy(2, 0, { bossProfile: {} });
  r.g.enemies.push(plain, star, boss);
  r.step();
  r.step(RULES.holdSeconds + 1);
  const [a, b] = r.shown();
  assert.equal(r.shown().length, 2, "the plain, unhurt-for-3-s enemy is hidden");
  const widths = [a, b].map((el) => el.style.width).sort();
  assert.deepEqual(widths, [`${RULES.classes.elite.widthPx.phone}px`, `${RULES.classes.boss.widthPx.phone}px`].sort());
  const fills = Object.fromEntries([a, b].map((el) => [el.style.width, el.children[1].style.background]));
  assert.equal(fills[`${RULES.classes.elite.widthPx.phone}px`], RULES.colours.elite);
  assert.equal(fills[`${RULES.classes.boss.widthPx.phone}px`], RULES.colours.fill);
  assert.ok(RULES.classes.boss.widthPx.phone > RULES.classes.elite.widthPx.phone);
  r.g.enemies.push(enemy(-1, 0, { markedHunter: true }));
  r.step(0.1);
  assert.equal(r.shown().length, 3, "a marked hunter counts as a star");
});

test("a desktop window gets the wider bar, a phone the narrow one", () => {
  for (const desktop of [false, true]) {
    const r = rig({ desktop }),
      e = enemy();
    r.g.enemies.push(e);
    r.step();
    e.hp = 10;
    r.step(0.1);
    const width = desktop ? RULES.classes.normal.widthPx.desktop : RULES.classes.normal.widthPx.phone;
    assert.equal(r.shown()[0].style.width, `${width}px`);
  }
  assert.equal(RULES.classes.normal.widthPx.phone, 28);
  assert.equal(RULES.classes.normal.widthPx.desktop, 36);
  assert.equal(RULES.classes.normal.heightPx, 4);
});

test("at most 12 bars show; the aimed-at enemy keeps one even when it is the farthest", () => {
  const r = rig(),
    crowd = Array.from({ length: 20 }, (_, i) => enemy((i % 5) - 2, Math.floor(i / 5) - 1.5, { hp: 100 }));
  r.g.enemies.push(...crowd);
  r.step();
  const farthest = crowd.reduce((a, b) => (Math.hypot(b.pos.x, b.pos.z) > Math.hypot(a.pos.x, a.pos.z) ? b : a)),
    fills = () => r.shown().map((el) => el.children[1].style.width);
  for (const e of crowd) e.hp = e === farthest ? 40 : 60;
  r.step(0.1);
  assert.equal(r.shown().length, 12);
  assert.equal(RULES.maxVisible, 12);
  assert.ok(!fills().includes("40%"), "the farthest loses the cap to nearer ones");
  r.g.touchTarget = { id: farthest.id };
  r.step(0.1);
  assert.equal(r.shown().length, 12);
  assert.ok(fills().includes("40%"), "the aimed-at one takes a bar");
  assert.ok(r.layer.children.length <= RULES.maxVisible, "the pool never grows past the cap");
});

test("the nearest enemies win the cap when none is aimed at, and a dead enemy frees its bar", () => {
  const r = rig(),
    crowd = Array.from({ length: 14 }, (_, i) => enemy(i - 7, 0, { hp: 100 }));
  r.g.enemies.push(...crowd);
  r.step();
  for (const e of crowd) e.hp = 30;
  r.step(0.1);
  assert.equal(r.shown().length, 12);
  const nearest = crowd[7];
  nearest.hp = 0;
  r.step(0.1);
  assert.equal(r.shown().length, 12, "a farther enemy takes the bar the dead one left");
  r.g.enemies.splice(r.g.enemies.indexOf(nearest), 1);
  r.step(0.1);
  assert.equal(r.shown().length, 12);
  r.g.enemies.length = 0;
  r.step(0.1);
  assert.equal(r.shown().length, 0);
});

test("a dead enemy never shows a bar, even when aimed at or starred", () => {
  const r = rig(),
    e = enemy(0, 0, { star: { stars: 2 } });
  r.g.enemies.push(e);
  r.g.touchTarget = { id: e.id };
  r.step();
  assert.equal(r.shown().length, 1);
  e.hp = 0;
  r.step(0.1);
  assert.equal(r.shown().length, 0);
});

test("bars come from a fixed pool: no element is created after the first full set", () => {
  const r = rig(),
    crowd = Array.from({ length: 16 }, (_, i) => enemy((i % 4) - 1.5, Math.floor(i / 4) - 1.5));
  r.g.enemies.push(...crowd);
  r.step();
  for (const e of crowd) e.hp = 20;
  r.step(0.1);
  const made = r.created.length,
    first = [...r.layer.children];
  for (let i = 0; i < 30; i++) r.step(0.05);
  r.g.time += RULES.holdSeconds;
  r.step(0.1);
  for (const e of crowd) e.hp = 10;
  r.step(0.1);
  assert.equal(r.created.length, made, "elements are reused, never created again");
  assert.deepEqual(r.layer.children, first);
});

test("styles are written only when they change", () => {
  const r = rig(),
    e = enemy();
  r.g.enemies.push(e);
  r.step();
  e.hp = 45;
  r.step(0.1);
  const [bar] = r.shown(),
    writes = [];
  for (const el of [bar, ...bar.children])
    el.style = new Proxy(el.style, {
      set(target, key, value) {
        writes.push(String(key));
        target[key] = value;
        return true;
      },
    });
  r.step(0.01);
  r.step(0.01);
  assert.deepEqual(writes, [], "a steady frame touches no style");
});

test("an enemy off the screen, a travelling session and a dead player show nothing", () => {
  const r = rig(),
    near = enemy(0, 0, { hp: 50 }),
    far = enemy(80, 0, { hp: 50 });
  r.g.enemies.push(near, far);
  r.step();
  r.step(0.1);
  assert.equal(r.shown().length, 0, "damage seen at the first frame is not a hit");
  near.hp = 20;
  far.hp = 20;
  r.step(0.1);
  assert.equal(r.shown().length, 1, "only the one on screen");
  r.s.traveling = true;
  r.step(0.1);
  assert.equal(r.shown().length, 0);
  r.s.traveling = false;
  r.step(0.1);
  r.g.player.hp = 0;
  r.step(0.1);
  assert.equal(r.shown().length, 0);
});

test("the layer sits beside the zoomed #hud, never inside it", () => {
  const r = rig();
  assert.equal(r.hud.children.length, 0, "nothing is appended to #hud, whose desktop zoom would shift every pixel position");
  assert.equal(r.hud.placed.length, 1);
  assert.equal(r.layer.style.position, "fixed");
  assert.equal(r.layer.style.pointerEvents, "none");
  assert.equal(r.layer.attributes["aria-hidden"], "true");
});

test("dispose removes the layer, and the off switch builds no layer at all", () => {
  const r = rig();
  r.bars.dispose();
  assert.equal(r.layer.removed, true);
  r.bars.update();
  r.bars.dispose();
  const off = rig({ search: `?${RULES.offSwitch.param}=${RULES.offSwitch.value}` });
  assert.equal(off.layer, undefined);
  assert.equal(enemyBarsOn(RULES, `?${RULES.offSwitch.param}=${RULES.offSwitch.value}`), false);
  assert.equal(enemyBarsOn(RULES, ""), RULES.enabled);
});

test("the data validator rejects an unknown field, a fade longer than the hold and a bad colour", () => {
  const good = () => structuredClone(RULES);
  validateEnemyBars(good());
  assert.throws(() => validateEnemyBars({ ...good(), extra: 1 }));
  assert.throws(() => validateEnemyBars({ ...good(), fadeSeconds: good().holdSeconds + 1 }));
  assert.throws(() => validateEnemyBars({ ...good(), maxVisible: 0 }));
  assert.throws(() => validateEnemyBars({ ...good(), colours: { ...good().colours, fill: "red; x" } }));
  const wide = good();
  wide.classes.boss.widthPx.desktop = wide.classes.boss.widthPx.phone - 1;
  assert.throws(() => validateEnemyBars(wide));
  assert.ok(Object.isFrozen(RULES) && Object.isFrozen(RULES.classes.boss));
});

test("a colour-blind palette recolours the fill live, and Off puts the file's colours back", (t) => {
  t.after(() => resetColourBlind());
  const r = rig(),
    plain = enemy(-2, 0);
  r.g.enemies.push(plain);
  r.step();
  plain.hp = 70;
  r.step(0.1);
  const fill = () => r.shown()[0].children[1].style.background;
  assert.equal(fill(), RULES.colours.fill);
  setColourBlindMode("protanopia");
  r.step(0.1);
  assert.equal(fill(), `#${paletteColour("enemyBars.fill", "protanopia")}`);
  assert.notEqual(fill(), RULES.colours.fill);
  setColourBlindMode("off");
  r.step(0.1);
  assert.equal(fill(), RULES.colours.fill);
});
