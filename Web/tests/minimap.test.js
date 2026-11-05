import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateMinimap } from "../src/engine/game-data-minimap.js";
import { webText } from "../src/engine/web-text.js";
import {
  createMinimap,
  createNearest,
  fitSize,
  gather,
  minimapOn,
  nextMode,
  place,
  readMode,
  resolveObjective,
  writeMode,
} from "../src/engine/minimap.js";

const DATA = GAME_DATA.minimap;
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);

test("the shipped data is valid and a bad row is refused", () => {
  assert.equal(DATA.enabled, true, "on by default");
  assert.deepEqual(DATA.offSwitch, { param: "nomap", value: "1" });
  assert.deepEqual(DATA.cycle, ["small", "large", "hidden"]);
  assert.ok(DATA.sizePx.large > DATA.sizePx.small);
  assert.ok(DATA.dotPx.boss > DATA.dotPx.hostile, "a boss reads larger than a hostile");
  const edits = [
    (d) => (d.enabled = "yes"),
    (d) => (d.schema_version = 2),
    (d) => (d.extra = 1),
    (d) => delete d.colours,
    (d) => (d.hz = 0),
    (d) => (d.hz = 61),
    (d) => (d.hz = 7.5),
    (d) => (d.maxDpr = 0.5),
    (d) => (d.maxDpr = 5),
    (d) => (d.sizePx.large = d.sizePx.small - 1),
    (d) => (d.sizePx.small = d.minSizePx - 1),
    (d) => (d.sizePx.extra = 1),
    (d) => (d.radiusMetres.small = 0),
    (d) => (d.radiusMetres.large = d.radiusMetres.small - 1),
    (d) => (d.maxDots.hostile = 0),
    (d) => (d.maxDots.pickup = 129),
    (d) => (d.maxDots.extra = 1),
    (d) => (d.dotPx.boss = d.dotPx.hostile - 1),
    (d) => (d.dotPx.player = 0),
    (d) => (d.colours.hostile = "red"),
    (d) => (d.colours.back = "rgb(1;2;3)"),
    (d) => delete d.colours.objective,
    (d) => (d.cycle = ["small"]),
    (d) => (d.cycle = ["small", "small", "large"]),
    (d) => (d.cycle = ["small", "huge"]),
    (d) => (d.cycle = ["small", "hidden"]),
    (d) => (d.defaultMode = "huge"),
    (d) => (d.defaultMode = "hidden") && (d.cycle = ["small", "large"]),
    (d) => (d.offSwitch.param = "No Map"),
    (d) => (d.storageKey = "bad key!"),
    (d) => (d.rimPadPx = d.minSizePx),
    (d) => (d.controlBandPx.landscape = -1),
    (d) => (d.chipPx = 10),
    (d) => (d.pinExitsToRim = "yes"),
  ];
  for (const edit of edits) {
    const copy = structuredClone(DATA);
    edit(copy);
    assert.throws(() => validateMinimap(copy), undefined, edit.toString());
  }
  validateMinimap(structuredClone(DATA));
});

test("the map's own lines are in the text data", () => {
  assert.equal(webText("minimap.chip"), "MAP");
  for (const mode of DATA.cycle) assert.ok(webText(`minimap.tap.${mode}`).length > 0, mode);
});

test("the flag is on by default and ?nomap=1 turns it off", () => {
  assert.equal(minimapOn(DATA, ""), true);
  assert.equal(minimapOn(DATA, "?desktop=1"), true);
  assert.equal(minimapOn(DATA, "?nomap=1"), false);
  assert.equal(minimapOn(DATA, "?nomap=0"), true);
  assert.equal(minimapOn({ ...DATA, enabled: false }, ""), false);
});

test("projection: the player is the middle, east is right, north is up, and the rim catches what is out of reach", () => {
  const out = { x: 0, y: 0, inside: false },
    centre = 40,
    reach = 36,
    scale = reach / 20; // 20 metres reach the rim
  place(0, 0, scale, centre, reach, out);
  assert.deepEqual([out.x, out.y, out.inside], [centre, centre, true]);
  place(10, 0, scale, centre, reach, out);
  near(out.x, centre + 18, "10 m east is half way right");
  near(out.y, centre, "and level");
  assert.equal(out.inside, true);
  place(0, 10, scale, centre, reach, out);
  near(out.x, centre, "10 m north is level");
  near(out.y, centre - 18, "and half way up");
  place(-20, 0, scale, centre, reach, out);
  near(out.x, centre - reach, "exactly on the rim is still inside");
  assert.equal(out.inside, true);
  place(60, -80, scale, centre, reach, out);
  assert.equal(out.inside, false);
  near(Math.hypot(out.x - centre, out.y - centre), reach, "far away: slid to the rim");
  near((out.x - centre) / (out.y - centre), 60 / 80, "direction kept");
  assert.ok(out.x > centre && out.y > centre, "south-east stays south-east");
  const same = place(1, 1, scale, centre, reach, out);
  assert.equal(same, out, "fills and returns the object it was given");
});

test("the nearest set keeps the cap nearest points, in order, and reuses its slots", () => {
  const set = createNearest(3),
    slots = [...set.slots];
  assert.equal(set.size, 0);
  assert.equal(set.offer(1, 1, 5), true);
  set.offer(2, 2, 9);
  set.offer(3, 3, 1);
  assert.deepEqual(
    set.slots.slice(0, set.size).map((p) => p.d),
    [1, 5, 9],
  );
  assert.equal(set.offer(4, 4, 20), false, "full and farther than all: refused");
  assert.equal(set.offer(5, 5, 3), true, "nearer than the farthest: replaces it");
  assert.deepEqual(
    set.slots.slice(0, set.size).map((p) => [p.x, p.d]),
    [
      [3, 1],
      [5, 3],
      [1, 5],
    ],
  );
  assert.equal(set.size, 3);
  for (let i = 0; i < 100; i++) set.offer(i, i, 100 - i);
  assert.equal(set.size, 3);
  assert.deepEqual(new Set(set.slots), new Set(slots), "the same slot objects, only reordered: nothing allocated");
  set.clear();
  assert.equal(set.size, 0);
});

test("size: the data size, shrunk on a touch landscape so the map stays above the controls, never below the minimum", () => {
  const portrait = { width: 390, height: 844 },
    landscape = { width: 844, height: 390 },
    short = { width: 640, height: 320 },
    tiny = { width: 400, height: 200 };
  assert.equal(fitSize("small", portrait, true, DATA), DATA.sizePx.small);
  assert.equal(fitSize("large", portrait, true, DATA), DATA.sizePx.large);
  assert.equal(fitSize("large", landscape, true, DATA), DATA.sizePx.large);
  assert.equal(fitSize("large", short, true, DATA), short.height - DATA.controlBandPx.landscape - DATA.topInsetPx);
  assert.ok(fitSize("large", short, true, DATA) < DATA.sizePx.large);
  assert.equal(fitSize("large", short, false, DATA), DATA.sizePx.large, "a mouse layout has no control band");
  assert.equal(fitSize("small", tiny, true, DATA), DATA.minSizePx);
  assert.equal(fitSize("hidden", portrait, true, DATA), 0);
  // The map's bottom edge stays above the top of the control band wherever the minimum allows it.
  for (const height of [320, 340, 360, 375, 390, 412]) {
    const view = { width: 740, height },
      bottom = DATA.topInsetPx + fitSize("large", view, true, DATA);
    assert.ok(
      bottom <= height - DATA.controlBandPx.landscape || fitSize("large", view, true, DATA) === DATA.minSizePx,
      `height ${height}`,
    );
  }
  // A large map in portrait hangs below the menu button: still above the portrait band on a small phone.
  const se = { width: 320, height: 568 };
  assert.ok(
    DATA.topInsetPx + DATA.menuOffsetPx + fitSize("large", se, true, DATA) <= se.height - DATA.controlBandPx.portrait,
  );
});

test("a tap steps small, large, hidden, small", () => {
  assert.equal(nextMode("small", DATA), "large");
  assert.equal(nextMode("large", DATA), "hidden");
  assert.equal(nextMode("hidden", DATA), "small");
  assert.equal(nextMode("garbage", DATA), "small");
});

test("the remembered mode survives only valid values and any storage failure", () => {
  const store = new Map(),
    storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readMode(storage, DATA), DATA.defaultMode, "nothing saved yet");
  writeMode(storage, "large", DATA);
  assert.equal(store.get(DATA.storageKey), "large");
  assert.equal(readMode(storage, DATA), "large");
  store.set(DATA.storageKey, "tiny");
  assert.equal(readMode(storage, DATA), DATA.defaultMode, "an unknown saved value is ignored");
  const refusing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readMode(refusing, DATA), DATA.defaultMode);
  writeMode(refusing, "hidden", DATA);
  assert.equal(readMode(null, DATA), DATA.defaultMode);
  writeMode(null, "hidden", DATA);
});

const enemy = (id, x, z, extra = {}) => ({ id, pos: { x, z }, hp: 10, hostile: true, ...extra });
const pools = () => ({
  hostiles: createNearest(DATA.maxDots.hostile),
  bosses: createNearest(DATA.maxDots.boss),
  pickups: createNearest(DATA.maxDots.pickup),
});
const run = (enemies, extra = {}) => ({ player: { pos: { x: 0, z: 0 }, hp: 100 }, enemies, ...extra });
const AREA = Object.keys(GAME_DATA.worldPickups.placements)[0];

test("hostiles: live enemies within the radius, nearest first, capped; allies, the dead and the sheltered are left out", () => {
  const radius = DATA.radiusMetres.small,
    crowd = Array.from({ length: DATA.maxDots.hostile + 10 }, (_, i) => enemy(`e${i}`, 1 + i * 0.1, 0)),
    g = run([
      ...crowd,
      enemy("dead", 0.5, 0, { hp: 0 }),
      enemy("friend", 0.5, 0, { hostile: false }),
      enemy("safe", 0.5, 0, { safehouseSuppressed: true }),
      enemy("far", radius + 1, 0),
    ]),
    p = pools();
  gather(g, "no-such-area", radius, p);
  assert.equal(p.hostiles.size, DATA.maxDots.hostile, "capped at maxDots.hostile");
  assert.equal(p.hostiles.slots[0].x, 1, "nearest first");
  assert.ok(p.hostiles.slots.slice(0, p.hostiles.size).every((s) => s.d <= radius));
  assert.equal(p.bosses.size, 0);
  assert.equal(p.pickups.size, 0);
  const fewer = pools();
  gather(run([enemy("a", 3, 4)]), "no-such-area", radius, fewer);
  assert.equal(fewer.hostiles.size, 1);
  near(fewer.hostiles.slots[0].d, 5, "distance in metres");
  gather(run([]), "no-such-area", radius, fewer);
  assert.equal(fewer.hostiles.size, 0, "a redraw starts clean");
});

test("bosses: a larger marker kept at any distance (the map pins it to the rim), capped separately", () => {
  const radius = DATA.radiusMetres.small,
    boss = (id, x) => enemy(id, x, 0, { bossProfile: { name: "x" } }),
    g = run([boss("near", 5), boss("far", radius * 5), boss("b3", 9), boss("b4", 12), enemy("rat", 2, 0)]),
    p = pools();
  gather(g, "no-such-area", radius, p);
  assert.equal(p.bosses.size, DATA.maxDots.boss);
  assert.deepEqual(
    p.bosses.slots.slice(0, p.bosses.size).map((s) => s.x),
    [5, 9, 12],
    "the nearest bosses, the far one dropped by the cap",
  );
  assert.equal(p.hostiles.size, 1, "a boss is not also a plain dot");
  gather(run([boss("only", radius * 5)]), "no-such-area", radius, p);
  assert.equal(p.bosses.size, 1, "a boss far beyond the radius is still listed");
  gather(run([{ ...boss("dead", 3), hp: 0 }]), "no-such-area", radius, p);
  assert.equal(p.bosses.size, 0);
});

test("loot: ground pickups not yet taken, coin drops and supply drops of this area, within the radius, capped", () => {
  const rows = GAME_DATA.worldPickups.placements[AREA],
    radius = 1000,
    base = pools();
  gather(run([]), AREA, radius, base);
  assert.equal(base.pickups.size, Math.min(rows.length, DATA.maxDots.pickup), "every placement of the area");
  const taken = pools();
  gather(run([], { worldPickups: { until: { [rows[0].id]: 99 } } }), AREA, radius, taken);
  assert.equal(
    taken.pickups.size,
    Math.min(rows.length - 1, DATA.maxDots.pickup),
    "a taken pickup waits for its return",
  );
  const extra = pools();
  gather(
    run([], {
      killDrops: {
        list: [
          { areaId: AREA, x: 0.5, z: 0 },
          { areaId: "elsewhere", x: 0.2, z: 0 },
        ],
      },
      supplies: {
        pending: [
          { areaId: AREA, position: { x: 0.25, z: 0 } },
          { areaId: "elsewhere", position: { x: 0.1, z: 0 } },
        ],
      },
    }),
    AREA,
    radius,
    extra,
  );
  assert.deepEqual(
    extra.pickups.slots.slice(0, 2).map((s) => s.x),
    [0.25, 0.5],
    "this area's drops, nearest first; another area's are ignored",
  );
  const tight = pools();
  gather(
    run([], {
      killDrops: {
        list: [
          { areaId: "x", x: 3, z: 0 },
          { areaId: "x", x: 30, z: 0 },
        ],
      },
    }),
    "x",
    10,
    tight,
  );
  assert.equal(tight.pickups.size, 1, "beyond the radius: left out");
  const many = pools();
  gather(
    run([], { killDrops: { list: Array.from({ length: 50 }, (_, i) => ({ areaId: AREA, x: i, z: 0 })) } }),
    AREA,
    1000,
    many,
  );
  assert.equal(many.pickups.size, DATA.maxDots.pickup);
});

// A world just big enough for the objective lookup and the drawing.
const world = (extra = {}) => ({
  areaId: "westminster",
  geometry: {
    road: [
      { x: -30, z: -20 },
      { x: 30, z: -20 },
      { x: 30, z: 20 },
      { x: -30, z: 20 },
    ],
    blockers: [
      [
        { x: 5, z: 5 },
        { x: 8, z: 5 },
        { x: 8, z: 8 },
      ],
    ],
  },
  exitRings: {
    rings: [
      { to: "central-hub", at: { x: 28, z: 0 } },
      { to: "lambeth", at: { x: 0, z: 90 } },
    ],
  },
  registry: { links: () => [], nextExit: (from, to) => ({ from, to }) },
  safehouseData: {},
  ...extra,
});
const live = (g, w = world()) => {
  g.world = w;
  return { game: g, world: w, loaded: true, traveling: false, paused: false, contextLost: false, resetting: false };
};

test("objective: the route's first exit when the objective is another area, memoised; a landed airdrop is a point; none otherwise", () => {
  let calls = 0;
  const w = world({
      registry: {
        links: () => [],
        nextExit: (from, to) => {
          calls++;
          return { from, to };
        },
      },
    }),
    g = run([]);
  g.world = w;
  const memo = { areaId: "", target: "", to: null },
    out = { kind: "none", x: 0, z: 0, to: "" };
  resolveObjective(g, w, memo, out);
  assert.equal(out.kind, "exit");
  assert.equal(out.to, "central-hub");
  resolveObjective(g, w, memo, out);
  assert.equal(calls, 1, "the route is looked up once per (area, target)");
  g.airdrop = { areaId: "westminster", phase: "landed", crate: { x: 7, z: -3 } };
  resolveObjective(g, w, memo, out);
  assert.deepEqual([out.kind, out.x, out.z], ["point", 7, -3]);
  g.airdrop.phase = "plane";
  resolveObjective(g, w, memo, out);
  assert.equal(out.kind, "exit", "a plane that has not dropped yet marks nothing");
  g.airdrop = { areaId: "elsewhere", phase: "landed", crate: { x: 1, z: 1 } };
  resolveObjective(g, w, memo, out);
  assert.equal(out.kind, "exit", "a crate in another area is not ours");
  const calm = run([]);
  calm.world = world({ areaId: "south", safehouseData: undefined });
  resolveObjective(calm, calm.world, { areaId: "", target: "", to: null }, out);
  assert.equal(out.kind, "none");
});

// A DOM just big enough for the map, with a canvas context that records what is drawn.
function fakeDom({ touch = false, search = "", throwingStorage = false } = {}) {
  const store = new Map(),
    calls = [];
  const element = (tag) => {
    const handlers = new Map(),
      props = new Map();
    const el = {
      tag,
      style: { setProperty: (k, v) => props.set(k, v), props },
      dataset: {},
      attrs: {},
      children: [],
      hidden: false,
      removed: false,
      width: 0,
      height: 0,
      append(...c) {
        el.children.push(...c);
      },
      remove() {
        el.removed = true;
      },
      setAttribute(k, v) {
        el.attrs[k] = v;
      },
      addEventListener: (type, fn) => handlers.set(type, fn),
      removeEventListener: (type) => handlers.delete(type),
      click: () => handlers.get("click")?.(),
      handlers,
    };
    if (tag === "canvas")
      el.getContext = () =>
        new Proxy(
          {},
          {
            get:
              (_, name) =>
              (...args) =>
                calls.push([name, ...args]),
            set: (_, name, value) => {
              calls.push(["set", name, value]);
              return true;
            },
          },
        );
    return el;
  };
  const hud = element("div"),
    listeners = new Map(),
    body = {
      classList: { contains: (c) => (c === "touch" && touch) || (c === "menu-open" && body.menuOpen) },
      menuOpen: false,
    },
    doc = { getElementById: (id) => (id === "hud" ? hud : null), createElement: element, body },
    win = {
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 3,
      get localStorage() {
        if (throwingStorage) throw new Error("blocked");
        return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
      },
      matchMedia: () => ({ matches: false }),
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };
  return { hud, doc, win, store, calls, listeners, search, body };
}
const nobody = (g, w, memo, out) => Object.assign(out, { kind: "none" });
const open = (dom, s, extra = {}) => {
  let t = 0;
  const clock = { advance: (ms) => (t += ms) };
  const map = createMinimap(s, {
    doc: dom.doc,
    win: dom.win,
    search: dom.search,
    now: () => t,
    objective: nobody,
    ...extra,
  });
  return { map, clock, button: dom.hud.children[0], canvas: dom.hud.children[0]?.children[0] };
};
const arcs = (dom, colour) => {
  let fill = null,
    count = 0;
  for (const c of dom.calls) {
    if (c[0] === "set" && c[1] === "fillStyle") fill = c[2];
    else if (c[0] === "fill" && fill === colour) count++;
  }
  return count;
};

test("the view builds one button holding a canvas, hidden until the run is live, and redraws only at the data rate", () => {
  const dom = fakeDom(),
    s = live(run([enemy("a", 3, 0)])),
    { map, clock, button, canvas } = open(dom, s);
  assert.equal(button.id, "minimap");
  assert.equal(button.type, "button");
  assert.equal(canvas.tag, "canvas");
  assert.equal(button.attrs["aria-label"], webText("minimap.tap.small"));
  assert.equal(button.hidden, true, "hidden before the first update");
  assert.equal(
    canvas.width,
    Math.round(DATA.sizePx.small * Math.min(DATA.maxDpr, 3)),
    "device pixels, capped at maxDpr",
  );
  assert.equal(button.style.props.get("--minimap-size"), `${DATA.sizePx.small}px`);
  map.update();
  assert.equal(button.hidden, false);
  const first = dom.calls.length;
  assert.ok(first > 0, "drew on the first update");
  map.update();
  clock.advance(1000 / DATA.hz - 1);
  map.update();
  assert.equal(dom.calls.length, first, "too soon: no redraw");
  clock.advance(1);
  map.update();
  assert.ok(dom.calls.length > first, "one interval later: a redraw");
  const second = dom.calls.length;
  for (let i = 0; i < DATA.hz * 3; i++) {
    clock.advance(1000 / DATA.hz / 4);
    map.update();
  }
  assert.ok(dom.calls.length < second * (DATA.hz * 3 + 1), "far fewer redraws than frames");
  assert.equal(map.mode(), "small");
});

test("a hostile in range is a red dot, a boss the larger marker, the player the middle; one in range per hostile", () => {
  const dom = fakeDom(),
    s = live(
      run([
        enemy("a", 3, 0),
        enemy("b", -4, 2),
        enemy("far", 500, 0),
        enemy("boss", 400, 0, { bossProfile: { name: "x" } }),
      ]),
    );
  open(dom, s).map.update();
  assert.equal(arcs(dom, DATA.colours.hostile), 2, "two hostiles in range, the far one left out");
  assert.equal(arcs(dom, DATA.colours.boss), 1, "the far boss is pinned to the rim");
  assert.equal(arcs(dom, DATA.colours.player), 1);
  const circle = dom.calls.filter((c) => c[0] === "arc" && c[3] === DATA.dotPx.boss / (1 + 1));
  assert.equal(circle.length, 1, "drawn at the boss size");
  const [, x, y] = circle[0],
    c = DATA.sizePx.small / (1 + 1),
    reach = c - DATA.rimPadPx;
  near(Math.hypot(x - c, y - c), reach, "on the rim");
  assert.ok(x > c && Math.abs(y - c) < 1e-6, "due east");
  assert.equal(arcs(dom, DATA.colours.exit), 2, "both exits, the far one pinned to the rim");
  assert.equal(arcs(dom, DATA.colours.walkable), 1, "the walkable ground is one even-odd fill");
  assert.ok(dom.calls.some((c) => c[0] === "fill" && c[1] === "evenodd"));
});

test("exits beyond the radius are pinned to the rim; a locked exit is dimmed; the objective exit is the objective", () => {
  const dom = fakeDom(),
    s = live(run([]));
  open(dom, s).map.update();
  assert.equal(arcs(dom, DATA.colours.exit), 2, "both exits drawn, the far one pinned");
  const rim = DATA.sizePx.small / (1 + 1) - DATA.rimPadPx,
    centre = DATA.sizePx.small / (1 + 1),
    pinned = dom.calls.find((c) => c[0] === "rect" && Math.abs(c[1] + c[3] / (1 + 1) - centre) < 1e-6);
  assert.ok(pinned, "the exit straight north sits on the vertical axis");
  near(centre - (pinned[2] + pinned[4] / (1 + 1)), rim, "and on the rim");
  const locked = fakeDom(),
    lockedWorld = world({
      registry: { links: () => [{ to: "central-hub", requiresVisited: true }], nextExit: () => null },
    }),
    ls = live(run([]), lockedWorld);
  ls.game.expedition = { visitedIds: [] };
  open(locked, ls).map.update();
  assert.equal(arcs(locked, DATA.colours.exitLocked), 1, "the gated exit is dimmed");
  assert.equal(arcs(locked, DATA.colours.exit), 1, "the open one is not");
  const objectiveDom = fakeDom(),
    os = live(run([]));
  open(objectiveDom, os, {
    objective: (g, w, memo, out) => Object.assign(out, { kind: "exit", to: "lambeth" }),
  }).map.update();
  assert.equal(arcs(objectiveDom, DATA.colours.objective), 1, "the objective exit is gold-white");
  assert.ok(
    objectiveDom.calls.some((c) => c[0] === "set" && c[1] === "strokeStyle" && c[2] === DATA.colours.objective),
    "and ringed",
  );
});

test("an objective on the ground is a ringed dot, pinned to the rim when far", () => {
  const dom = fakeDom(),
    s = live(run([]));
  open(dom, s, { objective: (g, w, memo, out) => Object.assign(out, { kind: "point", x: 0, z: 400 }) }).map.update();
  const dots = dom.calls.filter((c) => c[0] === "arc" && c[3] === DATA.dotPx.objective / (1 + 1)),
    c = DATA.sizePx.small / (1 + 1);
  assert.equal(dots.length, 1);
  near(dots[0][2], c - (c - DATA.rimPadPx), "straight up, on the rim");
});

test("a tap steps the mode, redraws at once, and the choice is remembered", () => {
  const dom = fakeDom(),
    s = live(run([enemy("a", 3, 0)])),
    { map, button, canvas } = open(dom, s);
  map.update();
  const labelled = [];
  button.click();
  labelled.push(button.dataset.mode, button.attrs["aria-label"]);
  assert.deepEqual(labelled, ["large", webText("minimap.tap.large")]);
  assert.equal(dom.store.get(DATA.storageKey), "large");
  assert.equal(canvas.width, Math.round(DATA.sizePx.large * Math.min(DATA.maxDpr, 3)));
  assert.equal(button.style.props.get("--minimap-size"), `${DATA.sizePx.large}px`);
  button.click();
  assert.equal(button.dataset.mode, "hidden");
  assert.equal(button.style.props.get("--minimap-size"), `${DATA.chipPx}px`, "a chip you can still tap");
  const before = dom.calls.length;
  map.update();
  assert.equal(dom.calls.length, before, "nothing is drawn while hidden");
  assert.equal(button.hidden, false, "the chip stays");
  button.click();
  assert.equal(button.dataset.mode, "small");
  assert.equal(dom.store.get(DATA.storageKey), "small");
  assert.equal(map.mode(), "small");
  // A new page load starts where the last one ended.
  dom.store.set(DATA.storageKey, "hidden");
  const again = open(fakeDom(), live(run([])));
  assert.equal(again.map.mode(), "small", "(a different page has its own storage)");
  const reload = fakeDom();
  reload.store.set(DATA.storageKey, "large");
  assert.equal(open(reload, live(run([]))).map.mode(), "large");
});

test("with storage refused the map still works and just forgets", () => {
  const dom = fakeDom({ throwingStorage: true }),
    { map, button } = open(dom, live(run([])));
  assert.equal(map.mode(), DATA.defaultMode);
  button.click();
  assert.equal(map.mode(), "large");
});

test("nothing shows while paused, travelling, dead, finished, with the menu open, or before the game exists", () => {
  for (const edit of [
    (s) => (s.paused = true),
    (s) => (s.traveling = true),
    (s) => (s.contextLost = true),
    (s) => (s.resetting = true),
    (s) => (s.loaded = false),
    (s) => (s.game.player.hp = 0),
    (s) => (s.game.finished = true),
    (s) => (s.game = null),
    (s) => (s.world = null),
  ]) {
    const dom = fakeDom(),
      s = live(run([])),
      { map, button } = open(dom, s);
    map.update();
    assert.equal(button.hidden, false);
    edit(s);
    map.update();
    assert.equal(button.hidden, true);
  }
  const dom = fakeDom(),
    { map, button } = open(dom, live(run([])));
  map.update();
  dom.body.menuOpen = true;
  map.update();
  assert.equal(button.hidden, true, "menu open");
  dom.body.menuOpen = false;
  map.update();
  assert.equal(button.hidden, false);
});

test("?nomap=1, a disabled data row or a page without a HUD builds nothing", () => {
  const off = fakeDom({ search: "?nomap=1" }),
    s = live(run([]));
  const map = createMinimap(s, { doc: off.doc, win: off.win, search: off.search });
  map.update();
  map.dispose();
  assert.equal(off.hud.children.length, 0);
  assert.equal(map.mode(), "off");
  const disabled = fakeDom();
  createMinimap(s, { doc: disabled.doc, win: disabled.win, data: { ...DATA, enabled: false } }).update();
  assert.equal(disabled.hud.children.length, 0);
  createMinimap(s, { doc: { getElementById: () => null }, win: {} }).update();
});

test("dispose removes the button and the resize listener; later updates do nothing", () => {
  const dom = fakeDom(),
    { map, button } = open(dom, live(run([])));
  assert.equal(dom.listeners.size, 1);
  map.dispose();
  assert.equal(button.removed, true);
  assert.equal(dom.listeners.size, 0);
  assert.equal(button.handlers.size, 0);
  map.update();
  map.dispose();
});

test("a resize re-fits the map: on a touch phone turned to landscape a large map shrinks above the controls", () => {
  const dom = fakeDom({ touch: true }),
    { map, button } = open(dom, live(run([])));
  button.click();
  assert.equal(button.style.props.get("--minimap-size"), `${DATA.sizePx.large}px`);
  dom.win.innerWidth = 640;
  dom.win.innerHeight = 320;
  dom.listeners.get("resize")();
  const size = Number.parseInt(button.style.props.get("--minimap-size"), 10);
  assert.ok(size < DATA.sizePx.large && size >= DATA.minSizePx, `fitted to ${size}`);
  assert.ok(DATA.topInsetPx + size <= dom.win.innerHeight - DATA.controlBandPx.landscape || size === DATA.minSizePx);
  map.update();
});
