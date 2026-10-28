import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { uiScale, isDesktopUi, applyDesktopLayout, fillKeyHints } from "../src/engine/desktop-layout.js";
import { validateInputKeys } from "../src/engine/input-keymap-data.js";
import { keyHints } from "../src/engine/input-keymap.js";

const LAYOUT = GAME_DATA.inputKeys.layout;
const css = fs.readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("the HUD scale follows the window height between the data's min and max", () => {
  assert.equal(uiScale(LAYOUT.baseHeightPx * LAYOUT.minScale), LAYOUT.minScale);
  assert.equal(uiScale(1), LAYOUT.minScale, "a short window never shrinks the HUD");
  assert.equal(uiScale(100000), LAYOUT.maxScale, "a huge window is capped");
  assert.ok(uiScale(1080) > uiScale(720));
  for (const height of [720, 800, 1080, 1440]) assert.ok(uiScale(height) >= LAYOUT.minScale && uiScale(height) <= LAYOUT.maxScale);
});

test("desktop layout needs a fine pointer and enough width; a phone never gets it", () => {
  assert.equal(isDesktopUi(1920, true), true);
  assert.equal(isDesktopUi(1280, true), true);
  assert.equal(isDesktopUi(LAYOUT.minWidthPx - 1, true), false);
  assert.equal(isDesktopUi(375, false), false);
  assert.equal(isDesktopUi(1920, false), false, "a coarse-pointer tablet keeps the touch layout");
});

function fakeWindow(width, height, fine) {
  const classes = new Set(),
    props = new Map();
  return {
    innerWidth: width,
    innerHeight: height,
    matchMedia: () => ({ matches: fine }),
    document: {
      body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) } },
      documentElement: { style: { setProperty: (k, v) => props.set(k, v) } },
    },
    classes,
    props,
  };
}

test("applyDesktopLayout sets or clears body.desktop-ui and --ui-scale on resize", () => {
  const desktop = fakeWindow(1920, 1080, true);
  assert.equal(applyDesktopLayout(desktop), true);
  assert.ok(desktop.classes.has("desktop-ui"));
  assert.equal(desktop.props.get("--ui-scale"), String(uiScale(1080)));
  desktop.innerWidth = 375;
  assert.equal(applyDesktopLayout(desktop), false);
  assert.ok(!desktop.classes.has("desktop-ui"), "shrinking the window drops the desktop layout");
  assert.equal(desktop.props.get("--ui-scale"), "1");
  const phone = fakeWindow(375, 812, false);
  assert.equal(applyDesktopLayout(phone), false);
  assert.ok(!phone.classes.has("desktop-ui"));
  assert.equal(applyDesktopLayout(undefined), false, "no window (node) is a no-op");
});

test("the key-hint chips are built from the data rows, one per row, text from webText", () => {
  const made = [];
  const doc = {
    createElement: (tag) => ({ tag, children: [], textContent: "", append(...nodes) { this.children.push(...nodes); } }),
    createTextNode: (text) => ({ text }),
  };
  const container = { ownerDocument: doc, replaceChildren: (...nodes) => made.push(...nodes) };
  fillKeyHints(container);
  const hints = keyHints();
  assert.equal(made.length, hints.length);
  for (const [i, chip] of made.entries()) {
    assert.equal(chip.children[0].tag, "kbd");
    assert.equal(chip.children[0].textContent, hints[i].keys);
    assert.ok(chip.children[1].text.includes(hints[i].label));
  }
  assert.doesNotThrow(() => fillKeyHints(null));
});

test("a bad layout row is refused", () => {
  const bad = (edit) => {
    const copy = structuredClone(GAME_DATA.inputKeys);
    edit(copy);
    assert.throws(() => validateInputKeys(copy));
  };
  bad((d) => (d.layout.minWidthPx = 0));
  bad((d) => (d.layout.minScale = 3));
  bad((d) => (d.layout.baseHeightPx = Number.NaN));
  bad((d) => (d.layout.extra = 1));
});

test("every desktop CSS rule is gated by body.desktop-ui:not(.touch), so the phone layout is untouched", () => {
  const start = css.indexOf("Desktop layout (engine/desktop-layout.js");
  assert.ok(start > 0, "the desktop block exists");
  const block = css.slice(css.indexOf("*/", start) + 2);
  const selectors = [...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter((s) => !s.startsWith("/*"));
  for (const selector of selectors.join(",").split(",").map((s) => s.trim()).filter(Boolean)) {
    const allowed = /^body\.desktop-ui:not\(\.touch\) /.test(selector) || ["#key-hints", "#weapon-tiles-track button > i", ".menu-open #key-hints"].includes(selector);
    assert.ok(allowed, `${selector} must be gated`);
  }
  // The base state of the new pieces is hidden, so a phone shows neither.
  assert.match(block, /#key-hints,\s*#weapon-tiles-track button > i\s*\{\s*display: none;/);
  // The phone rules stay above the block, byte for byte: the thumb pad and the action cluster.
  assert.match(css.slice(0, start), /\.touch #touch-controls \{\s*display: block;/);
  assert.match(css.slice(0, start), /@media \(pointer: coarse\) \{\s*#touch-controls \{\s*display: block;/);
});

test("the index has the key-hints box and the touch controls are still in the page", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="key-hints"/);
  for (const id of ["move", "action-cluster", "weapon-tiles"]) assert.match(html, new RegExp(`id="${id}"`));
});
