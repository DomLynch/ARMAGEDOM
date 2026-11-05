import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA, buildGameData } from "../src/engine/game-data.js";
import {
  createDamageFeedback,
  critScale,
  flashAlpha,
  isBigHit,
  lowHealthCycles,
  numberPx,
  rampColour,
  sizeSteps,
} from "../src/engine/damage-feedback.js";
import { validateDamageFeedback } from "../src/engine/damage-feedback-data.js";
import { paletteColour, resetColourBlind, setColourBlindMode } from "../src/engine/colour-blind.js";

const DATA = GAME_DATA.damageFeedback,
  N = DATA.numbers,
  FLASH = DATA.vignette.flash,
  LOW = DATA.vignette.low;

// A document with just enough DOM: elements keep what the module writes.
function fakeDocument() {
  const element = (tag) => ({
    tag,
    className: "",
    hidden: false,
    textContent: "",
    style: {},
    attributes: {},
    children: [],
    parent: null,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    append(...nodes) {
      for (const n of nodes) {
        n.parent = this;
        this.children.push(n);
      }
    },
    remove() {
      this.parent.children = this.parent.children.filter((n) => n !== this);
      this.parent = null;
    },
  });
  return { createElement: element, body: element("body") };
}

function rig({ reduced = false, desktop = false } = {}) {
  const doc = fakeDocument(),
    state = { reduced, visible: true },
    ui = createDamageFeedback({
      doc,
      reducedMotion: () => state.reduced,
      isDesktop: () => desktop,
      aim: (actor) => ({ x: actor.pos.x, y: 1, z: actor.pos.z }),
      project: (x, y, z, out) => {
        out.x = x * 10 + 100;
        out.y = 300 - y * 10;
        return state.visible;
      },
    });
  const [layer, hurt, pulse] = doc.body.children;
  return { doc, ui, layer, hurt, pulse, state };
}

const player = { id: 0, hp: 150, maxHP: 150 };
const enemy = (id, hp = 100, extra = {}) => ({ id, hp, maxHP: 100, pos: { x: id, z: 0 }, ...extra });
const hit = (actor, amount, extra = {}) => ({ type: "hit", actor, amount, weapon: "knife", ...extra });
const game = (...events) => ({ player, events, time: 1 });
const step = (ui, seconds, frames = 1) => {
  for (let i = 0; i < frames; i++) ui.advance(seconds / frames);
};
const px = (el) => Number(/translate\(-?\d+px,(-?\d+)px\)/.exec(el.style.transform)[1]);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test("the data file validates, loads through the registry, and its validator rejects bad rows", () => {
  assert.equal(N.cap, 16);
  assert.ok(buildGameData().damageFeedback);
  const bad = (edit, pattern) => {
    const copy = structuredClone(DATA);
    edit(copy);
    assert.throws(() => validateDamageFeedback(copy), pattern);
  };
  bad((d) => (d.numbers.cap = 0), /numbers.cap/);
  bad((d) => (d.numbers.surprise = 1));
  bad((d) => (d.vignette.flash.maxAlpha = 1.5), /at most 1/);
  bad((d) => (d.numbers.colourRamp = [[255, 255, 255]]), /two colours/);
  bad((d) => (d.numbers.critColour = [255, 300, 0]), /critColour/);
  bad((d) => (d.vignette.low.cyclesFrom = 0.1), /cyclesFrom/);
});

test("the Lead's donor numbers are the data defaults", () => {
  assert.equal(N.basePx.phone, 12);
  assert.equal(N.basePx.desktop, 16);
  assert.equal(N.sizeStepPx, 3);
  assert.equal(N.lifeSeconds, 1.2);
  assert.equal(N.fadeSeconds, 0.6);
  assert.equal(N.alpha, 0.95);
  assert.equal(N.risePxPerSecond, 50);
  assert.equal(N.perTargetCap, 4);
  assert.equal(N.mergeSeconds, 0.1);
  assert.equal(N.stackGapPx, 4);
  assert.deepEqual(N.critColour, [255, 215, 0]);
  assert.deepEqual(N.critScale, { from: 0.1, peak: 2, end: 1, lifeShare: 0.2, peakShare: 0.5 });
  assert.equal(FLASH.maxAlpha, 0.59);
  assert.equal(LOW.hpShare, 0.33);
  assert.deepEqual(LOW.dark, [102, 0, 0]);
  assert.deepEqual(LOW.light, [204, 0, 0]);
  assert.equal(LOW.opacity, 0.5);
});

test("size grows 3 px per tenth of the target's health, from a base that is 12 on a phone and 16 on desktop", () => {
  assert.equal(sizeSteps(0, 100, N), 0);
  assert.equal(sizeSteps(9.9, 100, N), 0);
  assert.equal(sizeSteps(10, 100, N), 1);
  assert.equal(sizeSteps(35, 100, N), 3);
  assert.equal(sizeSteps(500, 100, N), N.sizeSteps, "capped at the top step");
  assert.equal(sizeSteps(5, 0, N), 0, "no health to measure against");
  assert.equal(numberPx(0, N, false), 12);
  assert.equal(numberPx(3, N, false), 21);
  assert.equal(numberPx(0, N, true), 16);
  assert.equal(numberPx(4, N, true), 28);
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(1), 35)));
  assert.equal(layer.children[0].style.fontSize, "21px");
  const d = rig({ desktop: true });
  d.ui.observe(game(hit(enemy(1), 35)));
  assert.equal(d.layer.children[0].style.fontSize, "25px");
});

test("colour runs white to orange to red-orange with size", () => {
  assert.equal(rampColour(0, N), "rgb(255,255,255)");
  assert.equal(rampColour(5, N), "rgb(255,165,0)");
  assert.equal(rampColour(10, N), "rgb(255,69,0)");
  const mid = rampColour(7, N);
  const g = Number(/rgb\(255,(\d+),/.exec(mid)[1]);
  assert.ok(g < 165 && g > 69, "between orange and red-orange");
});

test("a hit on an enemy spawns one number that rises 50 px a second and fades over its last 0.6 s", () => {
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(3), 12)));
  ui.layout(player);
  const [el] = layer.children;
  assert.equal(el.textContent, "12");
  assert.equal(el.hidden, false);
  const y0 = px(el);
  assert.equal(el.style.opacity, String(N.alpha), "full opacity at first");
  step(ui, 0.5);
  ui.layout(player);
  assert.equal(y0 - px(el), 25, "50 px/s over half a second");
  assert.equal(el.style.opacity, String(N.alpha), "still before the fade");
  step(ui, 0.4);
  ui.layout(player);
  assert.equal(y0 - px(el), 45);
  close(Number(el.style.opacity), N.alpha * (0.3 / 0.6), 0.002);
  step(ui, 0.31);
  ui.layout(player);
  assert.equal(el.hidden, true, "gone after 1.2 s");
  assert.equal(ui.snapshot().numbers.length, 0);
});

test("a number pops 6 px larger for its first 0.1 s and settles", () => {
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(3), 12)));
  ui.layout(player);
  const first = Number(/scale\(([\d.]+)\)/.exec(layer.children[0].style.transform)[1]);
  close(first, 1 + 6 / 15, 0.001); // 12 of 100 health is one step, so a 15 px number
  step(ui, 0.11);
  ui.layout(player);
  assert.equal(/scale\(([\d.]+)\)/.exec(layer.children[0].style.transform)[1], "1");
});

test("rapid hits on one target within 100 ms sum into one number; a later hit starts a new one", () => {
  const { ui, layer } = rig();
  const target = enemy(7);
  for (let i = 0; i < 3; i++) {
    ui.observe(game(hit(target, 5, { weapon: "railgun" })));
    step(ui, 0.03);
  }
  assert.equal(ui.snapshot().numbers.length, 1);
  assert.equal(layer.children[0].textContent, "15");
  step(ui, 0.05);
  ui.observe(game(hit(target, 5, { weapon: "railgun" })));
  assert.equal(ui.snapshot().numbers.length, 2, "past the window it is a separate number");
  assert.equal(layer.children[1].textContent, "5");
});

test("hits on different targets stay apart, and one step's hits on a target sum", () => {
  const { ui } = rig();
  ui.observe(game(hit(enemy(1), 8), hit(enemy(2), 9), hit(enemy(1), 4)));
  const shown = Object.fromEntries(ui.snapshot().numbers.map((n) => [n.targetId, n.text]));
  assert.deepEqual(shown, { 1: "12", 2: "9" });
});

test("a merged number grows to the size of its sum", () => {
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(1), 5)));
  assert.equal(layer.children[0].style.fontSize, "12px");
  ui.observe(game(hit(enemy(1), 12)));
  assert.equal(layer.children[0].textContent, "17");
  assert.equal(layer.children[0].style.fontSize, "15px");
});

test("a target shows at most four numbers: the fifth is dropped until one ends", () => {
  const { ui } = rig();
  const target = enemy(5);
  for (let i = 0; i < 6; i++) {
    ui.observe(game(hit(target, 10 + i)));
    step(ui, 0.15);
  }
  assert.equal(ui.snapshot().numbers.length, 4);
  assert.deepEqual(
    ui.snapshot().numbers.map((n) => n.text),
    ["10", "11", "12", "13"],
    "the fifth and sixth hits were dropped",
  );
  step(ui, 0.35);
  ui.observe(game(hit(target, 99)));
  assert.equal(ui.snapshot().numbers.length, 4, "the first ended, so a new one fits");
  assert.ok(ui.snapshot().numbers.some((n) => n.text === "99"));
  assert.ok(!ui.snapshot().numbers.some((n) => n.text === "10"));
});

test("older numbers on a target are pushed up by the newer one's height and a 4 px gap", () => {
  const { ui, layer } = rig();
  const target = enemy(4);
  ui.observe(game(hit(target, 5)));
  step(ui, 0.2);
  ui.observe(game(hit(target, 5)));
  step(ui, 0.0001);
  ui.layout(player);
  const [older, newer] = layer.children;
  // The older number has risen 50 px/s for 0.2 s more, and is held one 12 px number and the gap higher.
  const expected = 12 + N.stackGapPx + N.risePxPerSecond * 0.2;
  assert.ok(Math.abs(px(newer) - px(older) - expected) <= 1, "older sits one number plus the gap above newer");
  const other = rig();
  other.ui.observe(game(hit(enemy(1), 5)));
  other.ui.observe(game(hit(enemy(2), 5)));
  other.ui.layout(player);
  assert.equal(
    px(other.layer.children[0]),
    px(other.layer.children[1]),
    "numbers on different targets do not push each other",
  );
});

test("the pool never passes the cap and recycles the number nearest its end", () => {
  const { ui, layer } = rig();
  for (let i = 0; i < N.cap + 5; i++) {
    ui.observe(game(hit(enemy(100 + i), 10 + i)));
    step(ui, 0.01);
  }
  assert.equal(layer.children.length, N.cap, "no more elements than the cap");
  assert.equal(ui.snapshot().numbers.length, N.cap);
  const ids = ui.snapshot().numbers.map((n) => n.targetId);
  assert.ok(!ids.includes(100), "the oldest was recycled");
  assert.ok(ids.includes(100 + N.cap + 4), "the newest is shown");
});

test("blocked hits, zero damage and other attackers' hits make no number", () => {
  const { ui } = rig();
  ui.observe(game(hit(enemy(1), 10, { blocked: true }), hit(enemy(2), 0), hit(enemy(3), 10, { attackerId: 55 })));
  assert.equal(ui.snapshot().numbers.length, 0);
  ui.observe(game(hit(enemy(4), 10, { attackerId: player.id })));
  assert.equal(ui.snapshot().numbers.length, 1);
});

test("a hit of twice the weapon's smallest earlier hit, or a finisher or star kill, is gold and pops from 0.1 to 2 to 1", () => {
  const { ui, layer } = rig();
  const gold = (i) => layer.children[i].style.color === "rgb(255,215,0)";
  ui.observe(game(hit(enemy(1), 10)));
  assert.equal(gold(0), false, "the first hit sets the baseline");
  ui.observe(game(hit(enemy(2), 14)));
  assert.equal(gold(1), false, "1.4x is not big");
  ui.observe(game(hit(enemy(3), 20)));
  assert.equal(gold(2), true, "2x is big");
  ui.observe(game(hit(enemy(4, 0, { finisher: { recipeId: "x" } }), 6)));
  assert.equal(gold(3), true, "a finisher kill is big");
  ui.observe(game(hit(enemy(5, 0, { star: { stars: 1 } }), 6)));
  assert.equal(gold(4), true, "a star kill is big");
  ui.observe(game(hit(enemy(6, 0), 6)));
  assert.equal(gold(5), false, "a plain kill is not");
  assert.equal(isBigHit(20, 10, false, {}, N), true);
  assert.equal(isBigHit(19, 10, false, {}, N), false);
  assert.equal(isBigHit(20, undefined, false, {}, N), false);
  const scaleOf = (el) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)[1]);
  ui.layout(player);
  close(scaleOf(layer.children[2]), N.critScale.from, 0.001);
  step(ui, N.lifeSeconds * N.critScale.lifeShare * N.critScale.peakShare);
  ui.layout(player);
  close(scaleOf(layer.children[2]), N.critScale.peak, 0.01);
  step(ui, N.lifeSeconds * N.critScale.lifeShare * N.critScale.peakShare);
  ui.layout(player);
  close(scaleOf(layer.children[2]), N.critScale.end, 0.01);
  assert.equal(critScale(1, N.lifeSeconds, N.critScale), N.critScale.end, "after the first fifth it stays at 1");
});

test("baselines are kept per weapon and a merged number keeps its gold", () => {
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(1), 5, { weapon: "railgun" }), hit(enemy(2), 64, { weapon: "shotgun" })));
  ui.observe(game(hit(enemy(3), 64, { weapon: "shotgun" })));
  assert.notEqual(layer.children[2].style.color, "rgb(255,215,0)", "64 is normal for the shotgun");
  ui.observe(game(hit(enemy(4), 10, { weapon: "railgun" }), hit(enemy(4), 1, { weapon: "railgun" })));
  assert.equal(layer.children[3].style.color, "rgb(255,215,0)");
  assert.equal(layer.children[3].textContent, "11");
});

test("a fractional hit still shows at least the minimum", () => {
  const { ui, layer } = rig();
  ui.observe(game(hit(enemy(1), 0.2, { weapon: "flamethrower" })));
  assert.equal(layer.children[0].textContent, String(N.minimumShown));
});

test("flash alpha follows the Quake rule: min(0.59, 3 x max(10, hpLost / 2) / 255)", () => {
  close(flashAlpha(1, FLASH), (3 * 10) / 255);
  close(flashAlpha(20, FLASH), (3 * 10) / 255, 1e-9);
  close(flashAlpha(40, FLASH), (3 * 20) / 255);
  close(flashAlpha(100, FLASH), (3 * 50) / 255);
  assert.equal(flashAlpha(400, FLASH), 0.59, "capped");
  assert.ok(flashAlpha(40, FLASH, true) < flashAlpha(40, FLASH), "reduced motion softens it");
});

test("being hit raises the red flash, which decays 150/255 a second", () => {
  const { ui, hurt } = rig();
  ui.observe(game(hit(player, 40)));
  ui.layout(player);
  assert.equal(hurt.hidden, false);
  assert.equal(hurt.style.color, "rgb(255,0,0)");
  const peak = (3 * 20) / 255;
  close(Number(hurt.style.opacity), peak, 0.001);
  step(ui, 0.1);
  ui.layout(player);
  close(Number(hurt.style.opacity), peak - (150 / 255) * 0.1, 0.002);
  step(ui, 1);
  ui.layout(player);
  assert.equal(hurt.hidden, true);
});

test("a bigger loss flashes stronger, and hits within the flash add up to the cap", () => {
  const a = rig(),
    b = rig();
  a.ui.observe(game(hit(player, 3)));
  b.ui.observe(game(hit(player, 100)));
  a.ui.layout(player);
  b.ui.layout(player);
  assert.ok(Number(a.hurt.style.opacity) < Number(b.hurt.style.opacity));
  for (let i = 0; i < 5; i++) b.ui.observe(game(hit(player, 150)));
  b.ui.layout(player);
  assert.equal(Number(b.hurt.style.opacity), 0.59);
});

test("a hit with no damage makes no flash; chip damage through a block does", () => {
  const { ui, hurt } = rig();
  ui.observe(game(hit(player, 0)));
  ui.layout(player);
  assert.equal(hurt.hidden, true);
  ui.observe(game(hit(player, 10, { blocked: true })));
  ui.layout(player);
  assert.equal(hurt.hidden, false);
});

test("below 33% health a dark-red vignette pulses at 5 x (0.4 - health share) cycles a second; above it, none", () => {
  assert.equal(lowHealthCycles(50, 150, LOW), 0, "above the line");
  assert.equal(lowHealthCycles(49.5, 150, LOW), 0, "at the line");
  assert.equal(lowHealthCycles(0, 150, LOW), 0, "dead");
  close(lowHealthCycles(30, 150, LOW), 5 * (0.4 - 0.2));
  assert.ok(lowHealthCycles(10, 150, LOW) > lowHealthCycles(40, 150, LOW), "quicker as health falls");
  const { ui, pulse } = rig();
  const hurt = { id: 0, hp: 30, maxHP: 150 };
  ui.layout(hurt);
  assert.equal(pulse.hidden, false);
  assert.equal(pulse.style.opacity, "0.5");
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    step(ui, 0.05);
    ui.layout(hurt);
    seen.add(pulse.style.color);
  }
  assert.ok(seen.size > 3, "the colour moves between the two reds");
  for (const c of seen) {
    const r = Number(/rgb\((\d+),0,0\)/.exec(c)[1]);
    assert.ok(r >= 102 && r <= 204, `${c} stays between 0x66 and 0xCC`);
  }
  assert.ok(ui.snapshot().cycles > 0);
  ui.layout({ id: 0, hp: 100, maxHP: 150 });
  assert.equal(pulse.hidden, true, "healing past the line clears it");
});

test("a colour-blind palette recolours the hurt vignette and the big-hit number, and Off restores them", (t) => {
  t.after(() => resetColourBlind());
  setColourBlindMode("protanopia");
  const toCss = (hex) => `rgb(${hex.match(/../g).map((p) => Number(`0x${p}`))})`;
  const { ui, hurt, pulse, layer } = rig();
  assert.equal(hurt.style.color, toCss(paletteColour("vignette.flash", "protanopia")), "the flash is the palette's colour from the start");
  const low = { id: 0, hp: 30, maxHP: 150 };
  ui.layout(low);
  assert.notEqual(pulse.style.color, "", "the low pulse is drawn");
  const target = enemy(1, 100);
  ui.observe(game(hit(target, 40, { weapon: "a" })), 1);
  ui.observe(game(hit(target, 90, { weapon: "a" })), 1);
  assert.ok(layer.children.some((n) => n.style.color === toCss(paletteColour("damage.crit", "protanopia"))), "the big hit takes the crit colour");
  setColourBlindMode("off");
  ui.layout(low);
  assert.equal(hurt.style.color, `rgb(${FLASH.rgb.join(",")})`, "Off puts the file's red back on the next layout");
});

test("reduced motion: the low-health vignette is static, numbers fade in 0.4 s without rising, popping or scaling", () => {
  const { ui, pulse, layer } = rig({ reduced: true });
  const hurt = { id: 0, hp: 20, maxHP: 150 };
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    step(ui, 0.05);
    ui.layout(hurt);
    seen.add(pulse.style.color);
  }
  assert.equal(seen.size, 1, "no pulse");
  assert.equal(pulse.hidden, false, "but still shown");
  ui.observe(game(hit(enemy(1), 9), hit(enemy(2), 30)));
  ui.observe(game(hit(enemy(2), 31)));
  ui.layout(player);
  const before = layer.children.map((e) => e.style.transform);
  assert.ok(
    before.every((t) => /scale\(1\)/.test(t)),
    "no pop",
  );
  step(ui, N.reducedLifeSeconds / 2);
  ui.layout(player);
  assert.deepEqual(
    layer.children.map((e) => e.style.transform),
    before,
    "it does not rise",
  );
  assert.ok(Number(layer.children[0].style.opacity) < N.alpha, "it fades");
  step(ui, N.reducedLifeSeconds / 2 + 0.01);
  assert.equal(ui.snapshot().numbers.length, 0, "and is gone after the shorter life");
});

test("a paused game freezes numbers and the flash", () => {
  const { ui } = rig();
  ui.observe(game(hit(enemy(1), 9), hit(player, 20)));
  ui.advance(5, true);
  assert.equal(ui.snapshot().numbers.length, 1);
  assert.ok(ui.snapshot().flash > 0);
});

test("an off-screen point hides its number; reset and dispose clean up", () => {
  const { ui, layer, hurt, state, doc } = rig();
  ui.observe(game(hit(enemy(1), 9), hit(player, 20)));
  state.visible = false;
  ui.layout(player);
  assert.equal(layer.children[0].hidden, true);
  ui.reset();
  ui.layout(player);
  assert.equal(ui.snapshot().numbers.length, 0);
  assert.equal(hurt.hidden, true);
  ui.dispose();
  assert.equal(doc.body.children.length, 0, "all three elements are removed");
});

test("layout does not rewrite unchanged styles", () => {
  const { ui, layer } = rig({ reduced: true });
  ui.observe(game(hit(enemy(1), 9)));
  ui.layout(player);
  const el = layer.children[0];
  let writes = 0;
  el.style = new Proxy(el.style, { set: (t, k, v) => (writes++, Reflect.set(t, k, v)) });
  ui.layout(player);
  ui.layout(player);
  assert.equal(writes, 0);
});
