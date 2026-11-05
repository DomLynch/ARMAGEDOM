import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateThreatArrows } from "../src/engine/game-data-threat-arrows.js";
import { paletteColour, resetColourBlind, setColourBlindMode } from "../src/engine/colour-blind.js";
import { createUiScale, uiScaleNow } from "../src/engine/ui-scale.js";
import { fakeOptionsDoc, fakeStorage } from "./helpers/fake-options-dom.js";
import {
  arrowRect,
  createThreatArrows,
  distanceScale,
  edgeArrow,
  huntingThreats,
  mergeSectors,
  planArrows,
  projectToScreen,
} from "../src/engine/threat-arrows.js";

const DATA = GAME_DATA.threatArrows;
const safe = { left: 14, top: 12, right: 376, bottom: 826 }; // a 390 x 844 phone with the minimum safe-area variables
const rect = arrowRect(safe, DATA);
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);

test("the shipped data is valid and a bad row is refused", () => {
  assert.equal(DATA.maxArrows, 4);
  assert.equal(DATA.sectorDegrees, 20);
  assert.equal(DATA.aggroMetres, 14);
  assert.equal(DATA.fadeInMs, 150);
  assert.equal(DATA.plain.sizePx, 14);
  assert.ok(DATA.marked.sizePx > DATA.plain.sizePx);
  const edits = [
    (d) => (d.maxArrows = 0),
    (d) => (d.viewFraction = 1.1),
    (d) => (d.viewFraction = 0),
    (d) => (d.distanceFade.farMetres = d.distanceFade.nearMetres),
    (d) => (d.distanceFade.minScale = 0),
    (d) => (d.distanceFade.extra = 1),
    (d) => (d.maxArrows = 17),
    (d) => (d.enabled = "yes"),
    (d) => (d.sectorDegrees = 0),
    (d) => (d.sectorDegrees = 361),
    (d) => (d.insetPx = -1),
    (d) => (d.plain.colour = "red"),
    (d) => (d.marked.opacity = 0),
    (d) => (d.marked.sizePx = d.plain.sizePx - 1),
    (d) => (d.clipPath = "url(#x)"),
    (d) => (d.touchBandPx.extra = 1),
    (d) => (d.extra = 1),
    (d) => delete d.outline,
  ];
  for (const edit of edits) {
    const copy = structuredClone(DATA);
    edit(copy);
    assert.throws(() => validateThreatArrows(copy));
  }
});

const enemy = (id, x, z, extra = {}) => ({ id, pos: { x, z }, hp: 10, hostile: true, alerted: false, ...extra });
const game = (enemies, pos = { x: 0, z: 0 }) => ({ player: { pos, hp: 100 }, enemies });

test("who is pointed at: marked hunters, awake bosses, aggro within range; nearest first", () => {
  const g = game([
    enemy("far-hunter", 40, 0, { markedHunter: true }),
    enemy("sleeping-boss", 10, 0, { bossProfile: { name: "x" } }),
    enemy("awake-boss", 60, 0, { bossProfile: { name: "x" }, alerted: true }),
    enemy("aggro-near", 13, 0, { alerted: true }),
    enemy("aggro-far", 15, 0, { alerted: true }),
    enemy("calm-near", 3, 0),
    enemy("dead-hunter", 5, 0, { markedHunter: true, hp: 0 }),
    enemy("friendly", 4, 0, { markedHunter: true, hostile: false }),
    enemy("in-safehouse", 6, 0, { alerted: true, safehouseSuppressed: true }),
  ]);
  const found = huntingThreats(g, DATA);
  assert.deepEqual(
    found.map((t) => t.id),
    ["aggro-near", "far-hunter", "awake-boss"],
  );
  assert.deepEqual(
    found.map((t) => t.strong),
    [false, true, true],
  );
  near(found[0].dist, 13, "distance in metres");
});

test("direction math: the arrow turns clockwise from up and sits on the edge facing the enemy", () => {
  const origin = { x: 195, y: 419 };
  const at = (dx, dy) =>
    edgeArrow(origin, { x: origin.x + dx, y: origin.y + dy }, { ...rect, controlsBottom: rect.bottom });
  const up = at(0, -500),
    right = at(500, 0),
    down = at(0, 500),
    left = at(-500, 0);
  near(up.angle, 0, "up");
  near(right.angle, 90, "right");
  near(Math.abs(down.angle), 180, "down");
  near(left.angle, -90, "left");
  near(up.y, rect.top, "up lands on the top edge");
  near(up.x, origin.x, "up keeps the column");
  near(right.x, rect.right, "right lands on the right edge");
  near(left.x, rect.left, "left lands on the left edge");
  near(down.y, rect.bottom, "down lands on the bottom edge");
  const diagonal = at(300, -300);
  near(diagonal.angle, 45, "up-right");
  near(diagonal.x - origin.x, origin.y - diagonal.y, "a 45 degree ray stays at 45 degrees");
  assert.equal(edgeArrow(origin, origin, rect), null);
});

test("edge inset: every arrow stays inside the safe area pulled in by insetPx, whatever the direction", () => {
  assert.equal(rect.left, safe.left + DATA.insetPx);
  assert.equal(rect.right, safe.right - DATA.insetPx);
  assert.equal(rect.top, safe.top + DATA.insetPx);
  assert.equal(rect.bottom, safe.bottom - DATA.insetPx);
  const origin = { x: 195, y: 419 };
  for (let degrees = 0; degrees < 360; degrees += 7) {
    const turn = (degrees * Math.PI) / 180,
      arrow = edgeArrow(origin, { x: origin.x + Math.sin(turn) * 900, y: origin.y - Math.cos(turn) * 900 }, rect);
    assert.ok(arrow.x >= rect.left - 1e-6 && arrow.x <= rect.right + 1e-6, `x at ${degrees}`);
    assert.ok(arrow.y >= rect.top - 1e-6 && arrow.y <= rect.bottom + 1e-6, `y at ${degrees}`);
  }
  assert.equal(arrowRect({ left: 0, top: 0, right: DATA.insetPx, bottom: 500 }, DATA), null, "no room, no rectangle");
});

test("an origin outside the rectangle is pulled in, so the arrow never lands off screen", () => {
  const arrow = edgeArrow({ x: -300, y: 400 }, { x: -900, y: 400 }, rect);
  near(arrow.x, rect.left, "left edge");
  near(arrow.y, 400, "same row");
});

test("controls avoidance: on a touch layout nothing sits in the bottom band, only along the top and sides", () => {
  const band = DATA.touchBandPx.portrait,
    touch = arrowRect(safe, DATA, band),
    origin = { x: 195, y: 400 };
  near(touch.controlsBottom, safe.bottom - band, "band top");
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const turn = (degrees * Math.PI) / 180,
      arrow = edgeArrow(origin, { x: origin.x + Math.sin(turn) * 900, y: origin.y - Math.cos(turn) * 900 }, touch);
    assert.ok(arrow.y <= touch.controlsBottom + 1e-6, `${degrees} degrees is clear of the controls`);
  }
  const below = edgeArrow(origin, { x: 200, y: 900 }, touch),
    belowLeft = edgeArrow(origin, { x: 100, y: 900 }, touch);
  near(below.y, touch.controlsBottom, "straight down slides to the band top");
  near(below.x, touch.right, "on the right side");
  near(belowLeft.x, touch.left, "down and left goes to the left side");
  near(below.angle, edgeArrow(origin, { x: 200, y: 900 }, rect).angle, "the turn still faces the enemy");
  const desktop = arrowRect(safe, DATA, 0);
  near(desktop.controlsBottom, desktop.bottom, "no band on desktop");
});

const item = (angle, dist, strong = false) => ({ x: 0, y: 0, angle, dist, strong });

test("sector merging: hunters within one 20 degree sector share the nearest one's arrow", () => {
  const merged = mergeSectors([item(10, 5), item(18, 9), item(2, 12), item(31, 4)], DATA);
  assert.equal(merged.length, 2, "10, 18 and 2 share the sector of 10; 31 is 21 degrees from 10");
  assert.equal(merged[0].angle, 31, "the nearest hunter anchors its arrow");
  assert.equal(merged[0].count, 1);
  assert.equal(merged[1].angle, 10);
  assert.equal(merged[1].count, 3);
  const edge = mergeSectors([item(10, 1), item(20, 2), item(20.1, 3)], DATA);
  assert.deepEqual(
    edge.map((a) => a.count),
    [2, 1],
    "exactly half a sector (10 degrees) from the arrow joins; a hair more does not",
  );
});

test("sector merging: the sector wraps round at 180 degrees and a strong member makes the arrow strong", () => {
  const merged = mergeSectors([item(175, 3), item(-176, 6, true), item(0, 8)], DATA);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].count, 2);
  assert.equal(merged[0].strong, true);
  assert.equal(merged[1].strong, false);
});

test("cap: at most four arrows, nearest first; an extra hunter in a new sector gets none", () => {
  const items = [0, 40, 80, 120, 160, -120].map((angle, i) => item(angle, 20 - i));
  const merged = mergeSectors(items, DATA);
  assert.equal(merged.length, 4);
  assert.deepEqual(
    merged.map((a) => a.angle),
    [-120, 160, 120, 80],
    "the four nearest",
  );
  const joined = mergeSectors([...items, item(82, 30)], DATA);
  assert.equal(joined.length, 4);
  assert.equal(joined.find((a) => a.angle === 80).count, 2, "a late hunter still joins a sector already shown");
  assert.equal(mergeSectors(items, { ...DATA, maxArrows: 2 }).length, 2);
});

test("hidden when on screen: only off-screen hunters get an arrow", () => {
  const threats = [
    { id: "a", pos: { x: 1, z: 0 }, dist: 1, strong: false },
    { id: "b", pos: { x: 99, z: 0 }, dist: 99, strong: true },
  ];
  const view = {
    origin: { x: 195, y: 419 },
    rect,
    project: (pos) => (pos.x === 1 ? { x: 220, y: 419, inView: true } : { x: 2000, y: 419, inView: false }),
  };
  const arrows = planArrows(threats, view, DATA);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].strong, true);
  near(arrows[0].x, rect.right, "right edge");
  assert.deepEqual(planArrows([threats[0]], view, DATA), []);
});

// A phone-shaped camera over a flat ground: the player at the origin, the world's own toRender mapping.
function scene(width = 390, height = 844) {
  const camera = new T.PerspectiveCamera(40, width / height, 0.1, 200);
  camera.position.set(0, 14, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const world = { toRender: (p, h = 0) => new T.Vector3(p.x, h, -p.z) };
  return { camera, world, viewport: { width, height } };
}

test("projection: on-screen points are in view, far ones are not, and the direction to them is kept", () => {
  const { camera, world, viewport } = scene();
  const at = (x, z) => projectToScreen(world, camera, { x, z }, 1, viewport);
  const origin = at(0, 0);
  assert.equal(origin.inView, true);
  assert.ok(Math.abs(origin.x - 195) < 40, "the player is near the middle");
  const east = at(40, 0);
  assert.equal(east.inView, false);
  assert.ok(east.x > viewport.width, "east projects to the right");
  const north = at(0, 40);
  assert.equal(north.inView, false);
  assert.ok(north.y < origin.y, "north (away from the camera) is up the screen");
  const behind = at(0, -60);
  assert.equal(behind.inView, false, "behind the camera is off screen");
  assert.ok(behind.y > origin.y, "and reads as below, not mirrored");
  const arrow = edgeArrow(origin, east, rect);
  near(Math.round(arrow.angle), 90, "an enemy to the east points right");
});

// A DOM just big enough for the arrows: elements with a style bag, a host that reports the safe rectangle.
function fakeDom({ touch = false, reduced = false, box = safe } = {}) {
  const make = () => ({
    style: {},
    dataset: {},
    children: [],
    attrs: {},
    removed: false,
    append(...c) {
      this.children.push(...c);
    },
    remove() {
      this.removed = true;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getBoundingClientRect: () => box,
  });
  const hud = make(),
    listeners = new Map(),
    doc = {
      getElementById: (id) => (id === "hud" ? hud : null),
      createElement: make,
      body: { classList: { contains: (c) => c === "touch" && touch } },
    },
    win = {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: reduced }),
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };
  return { hud, doc, win, listeners };
}

function liveRun(enemies) {
  const { camera, world } = scene();
  return {
    game: game(enemies),
    camera,
    world,
    loaded: true,
    traveling: false,
    paused: false,
    contextLost: false,
    resetting: false,
  };
}

const shown = (host) => host.children.filter((el) => el.style.opacity !== "0");

test("the view builds a hidden pool, shows an off-screen hunter and hides it when it walks into view", () => {
  const dom = fakeDom(),
    s = liveRun([enemy("h", 45, 0, { markedHunter: true })]),
    view = createThreatArrows(s, { doc: dom.doc, win: dom.win });
  const host = dom.hud.children[0];
  assert.equal(host.id, "threat-arrows");
  assert.equal(host.attrs["aria-hidden"], "true");
  assert.equal(host.children.length, DATA.maxArrows);
  assert.ok(
    host.children.every((el) => el.style.opacity === "0"),
    "all hidden to begin with",
  );
  view.update();
  const [arrow] = shown(host);
  assert.equal(shown(host).length, 1);
  assert.equal(arrow.dataset.kind, "marked");
  assert.equal(arrow.style.width, `${DATA.marked.sizePx}px`);
  assert.equal(arrow.style.background, `#${DATA.marked.colour}`);
  assert.match(arrow.style.transform, /rotate\(9\d?deg\)/, "east of the player points right");
  assert.equal(
    arrow.style.left,
    `${safe.right - DATA.insetPx - safe.left}px`,
    "on the right edge, placed from the safe corner",
  );
  s.game.enemies[0].pos = { x: 1, z: 0 };
  view.update();
  assert.equal(shown(host).length, 0, "on screen again: no arrow");
  view.dispose();
  assert.equal(host.removed, true);
  assert.equal(dom.listeners.size, 0, "the resize listener is released");
  view.update();
});

test("a plain aggro enemy gets the small red arrow; a boss or marked hunter the larger gold one", () => {
  const dom = fakeDom(),
    s = liveRun([
      enemy("rat", -12, 0, { alerted: true }),
      enemy("boss", 0, 70, { alerted: true, bossProfile: { name: "x" } }),
    ]);
  createThreatArrows(s, { doc: dom.doc, win: dom.win }).update();
  const arrows = shown(dom.hud.children[0]),
    kinds = arrows.map((el) => el.dataset.kind).sort();
  assert.deepEqual(kinds, ["marked", "plain"]);
  const plain = arrows.find((el) => el.dataset.kind === "plain");
  assert.equal(plain.style.width, `${DATA.plain.sizePx}px`);
  assert.equal(plain.style.background, `#${DATA.plain.colour}`);
  assert.equal(plain.style.left, `${DATA.insetPx}px`, "west of the player sits on the left edge");
});

test("nothing shows while paused, travelling, dead or before the game exists", () => {
  for (const edit of [
    (s) => (s.paused = true),
    (s) => (s.traveling = true),
    (s) => (s.game.player.hp = 0),
    (s) => (s.game.finished = true),
    (s) => (s.game = null),
  ]) {
    const dom = fakeDom(),
      s = liveRun([enemy("h", 45, 0, { markedHunter: true })]),
      view = createThreatArrows(s, { doc: dom.doc, win: dom.win });
    view.update();
    assert.equal(shown(dom.hud.children[0]).length, 1);
    edit(s);
    view.update();
    assert.equal(shown(dom.hud.children[0]).length, 0);
  }
});

test("fade-in is 150 ms of opacity and reduced motion removes it", () => {
  const fading = fakeDom(),
    still = fakeDom({ reduced: true });
  for (const dom of [fading, still])
    createThreatArrows(liveRun([enemy("h", 45, 0, { markedHunter: true })]), { doc: dom.doc, win: dom.win }).update();
  assert.equal(shown(fading.hud.children[0])[0].style.transition, `opacity ${DATA.fadeInMs}ms linear`);
  assert.equal(shown(still.hud.children[0])[0].style.transition, "none");
  const hidden = fakeDom(),
    s = liveRun([enemy("h", 45, 0, { markedHunter: true })]),
    view = createThreatArrows(s, { doc: hidden.doc, win: hidden.win });
  view.update();
  s.paused = true;
  view.update();
  assert.equal(hidden.hud.children[0].children[0].style.transition, "none", "hiding is immediate");
});

test("on a touch phone no arrow reaches the bottom control band; on desktop the whole edge is used", () => {
  const bottomOf = (touch) => {
    const dom = fakeDom({ touch }),
      s = liveRun([enemy("h", 0, -60, { markedHunter: true })]);
    createThreatArrows(s, { doc: dom.doc, win: dom.win }).update();
    const [arrow] = shown(dom.hud.children[0]);
    return parseFloat(arrow.style.top);
  };
  assert.ok(
    bottomOf(false) >= safe.bottom - DATA.insetPx - safe.top - 1,
    "desktop: an enemy behind the player sits on the bottom edge",
  );
  assert.ok(
    bottomOf(true) <= safe.bottom - DATA.touchBandPx.portrait - safe.top + 1,
    "touch: slid up to the top of the band",
  );
});

test("a colour-blind palette recolours a live arrow, and Off puts the file's colour back", (t) => {
  t.after(() => resetColourBlind());
  const dom = fakeDom(),
    s = liveRun([enemy("h", 45, 0, { markedHunter: true })]),
    view = createThreatArrows(s, { doc: dom.doc, win: dom.win });
  const [arrow] = (view.update(), shown(dom.hud.children[0]));
  assert.equal(arrow.style.background, `#${DATA.marked.colour}`);
  setColourBlindMode("deuteranopia");
  view.update();
  assert.equal(arrow.style.background, `#${paletteColour("threatArrows.marked", "deuteranopia")}`);
  setColourBlindMode("off");
  view.update();
  assert.equal(arrow.style.background, `#${DATA.marked.colour}`);
});

test("the bottom band the arrows keep clear of follows the Controls size setting", (t) => {
  const page = fakeOptionsDoc(),
    scale = createUiScale({ doc: page.doc, win: { innerWidth: 390, innerHeight: 844, localStorage: fakeStorage() } });
  t.after(() => scale.dispose());
  const topOf = () => {
    const dom = fakeDom({ touch: true }),
      s = liveRun([enemy("h", 0, -60, { markedHunter: true })]);
    createThreatArrows(s, { doc: dom.doc, win: dom.win }).update();
    return parseFloat(shown(dom.hud.children[0])[0].style.top);
  };
  const normal = topOf();
  scale.setStep("small");
  assert.ok(topOf() > normal, "smaller buttons leave a thinner band, so the arrow can sit lower");
  assert.ok(topOf() <= safe.bottom - DATA.touchBandPx.portrait * uiScaleNow() - safe.top + 1);
  scale.setStep("normal");
  assert.equal(topOf(), normal);
});

test("a host with no size yet is measured again later, and a resize forgets the old measurement", () => {
  const dom = fakeDom({ box: { left: 0, top: 0, right: 0, bottom: 0 } }),
    s = liveRun([enemy("h", 45, 0, { markedHunter: true })]),
    view = createThreatArrows(s, { doc: dom.doc, win: dom.win });
  view.update();
  assert.equal(shown(dom.hud.children[0]).length, 0, "HUD not laid out yet");
  dom.hud.children[0].getBoundingClientRect = () => safe;
  view.update();
  assert.equal(shown(dom.hud.children[0]).length, 1);
  dom.hud.children[0].getBoundingClientRect = () => ({ ...safe, right: 300 });
  dom.listeners.get("resize")();
  view.update();
  assert.ok(parseFloat(shown(dom.hud.children[0])[0].style.left) <= 300 - DATA.insetPx);
});

test("without a HUD, or switched off in data, the view does nothing", () => {
  const s = liveRun([enemy("h", 45, 0, { markedHunter: true })]);
  const none = createThreatArrows(s, { doc: { getElementById: () => null }, win: {} });
  none.update();
  none.dispose();
  const dom = fakeDom();
  createThreatArrows(s, { doc: dom.doc, win: dom.win, data: { ...DATA, enabled: false } }).update();
  assert.equal(dom.hud.children.length, 0);
});

test("the 90 percent rule: an enemy in the outer tenth of the view already gets an arrow", () => {
  const { camera, world, viewport } = scene();
  assert.equal(DATA.viewFraction, 0.9);
  // A ground point just inside the screen edge: x in NDC between 0.92 and 0.98.
  let found = null;
  for (let x = 0; x < 40 && found === null; x += 0.05) {
    const ndc = world.toRender({ x, z: 0 }, DATA.projectHeight).project(camera);
    if (Math.abs(ndc.x) > 0.92 && Math.abs(ndc.x) < 0.98) found = x;
  }
  assert.ok(found !== null, "a point between 92 and 98 percent of the half width");
  const at = (fraction) => projectToScreen(world, camera, { x: found, z: 0 }, DATA.projectHeight, viewport, fraction);
  assert.equal(at(1).inView, true, "inside the screen");
  assert.equal(at(DATA.viewFraction).inView, false, "but outside 90 percent of it");
  assert.equal(
    projectToScreen(world, camera, { x: 0, z: 0 }, DATA.projectHeight, viewport, DATA.viewFraction).inView,
    true,
  );
});

test("distance fade: full strength up close, weaker with distance, never below minScale", () => {
  const { nearMetres, farMetres, minScale } = DATA.distanceFade;
  near(distanceScale(0, DATA), 1, "close");
  near(distanceScale(nearMetres, DATA), 1, "at the near distance");
  near(distanceScale(farMetres, DATA), minScale, "at the far distance");
  near(distanceScale(farMetres * 5, DATA), minScale, "beyond it");
  near(distanceScale((nearMetres + farMetres) / (1 + 1), DATA), (1 + minScale) / (1 + 1), "halfway is halfway");
  assert.ok(distanceScale(10, DATA) > distanceScale(30, DATA), "closer is stronger");
});

test("the arrow's opacity follows its hunter's distance: a nearer hunter is drawn stronger", () => {
  const opacities = [];
  for (const z of [-17, -45]) {
    const dom = fakeDom(),
      s = liveRun([enemy("h", 0, z, { markedHunter: true })]);
    createThreatArrows(s, { doc: dom.doc, win: dom.win }).update();
    opacities.push(Number(shown(dom.hud.children[0])[0].style.opacity));
  }
  assert.ok(opacities[0] > opacities[1], `${opacities[0]} is above ${opacities[1]}`);
  assert.ok(opacities[1] >= DATA.marked.opacity * DATA.distanceFade.minScale - 0.01);
  assert.ok(opacities[0] <= DATA.marked.opacity);
});
