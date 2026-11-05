import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Phone HUD legibility (audit of 390x844 portrait and 844x390 landscape): HUD text at least 12px, weapon tile captions at least 10px,
// and the five portrait action circles at least 10px apart with touch targets of at least 52px. The geometry is measured live in the
// PR; these tests only keep the CSS numbers from drifting back.
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} rule exists`);
  return css.slice(start, css.indexOf("}", start));
};
const px = (block, property) => Number(new RegExp(`(?:^|[\\s;{])${property}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(block)?.[1]);

test("HUD text on a phone is at least 12px", () => {
  for (const selector of ["#vitals", "#health-number", ".guard-line", "#cursed-status", "#boss", ".action", ".action small", "#run-hud"])
    assert.ok(px(rule(selector), "font-size") >= 12, `${selector} font-size`);
  assert.ok(px(/@media \(orientation: portrait\) \{[\s\S]*?#notice \{([^}]*)\}/.exec(css)[1], "font-size") >= 12, "portrait #notice");
  assert.doesNotMatch(css, /#boss \{[^}]*font-size:\s*(9|10|11)px/);
});

test("weapon tiles stay 52px wide for the page width and grow to 56px tall with 10px captions", () => {
  const tile = /#weapon-tiles-track button\{([^}]*)\}/.exec(css)[1];
  assert.match(tile, /width:52px/);
  assert.match(tile, /min-width:52px/);
  assert.match(tile, /height:56px/);
  assert.match(tile, /font-size:10px/);
  assert.ok(Number(/#weapon-tiles-track span\{[^}]*font-size:(\d+)px/.exec(css)[1]) >= 10, "caption");
  assert.ok(Number(/#weapon-tiles-track small\{[^}]*font-size:(\d+)px/.exec(css)[1]) >= 10, "ammo line");
});

test("portrait action circles are at least 52px, and the layout leaves at least 10px between every pair at 360, 390 and 412 wide", () => {
  const block = /@media \(orientation: portrait\) \{\s*:root[\s\S]*?\n\}/.exec(css)[0];
  const size = (id) => {
    const line = new RegExp(`#${id} \\{([^}]*)\\}`).exec(block)?.[1] ?? "";
    return { w: px(line, "width") || px(block.match(/\.action\.primary \{([^}]*)\}/)[1], "width"), line };
  };
  for (const id of ["slash", "stab", "heavy", "dodge", "guard"]) assert.ok(size(id).w >= 52, `${id} touch target`);
  const top = (id) => Number(/(?:^|[\s;{])top:\s*(\d+)(?:px)?/.exec(new RegExp(`#${id} \\{([^}]*)\\}`).exec(block)[1])[1]);
  for (const width of [360, 390, 412]) {
    const cluster = Math.min(184, Math.max(172, width - 191)), safe = 14;
    const circles = {
      slash: { r: 30, x: Math.max(5, Math.min(cluster + safe + 35 - width / 2, cluster - 128)) + 30, y: top("slash") + 30 },
      stab: { r: 28, x: cluster / 2, y: top("stab") + 28 },
      heavy: { r: 29, x: cluster - 29, y: top("heavy") + 29 },
      dodge: { r: 30, x: cluster / 2 - 54 + 30, y: top("dodge") + 30 },
      guard: { r: 32, x: cluster - 32, y: 216 - 32 },
    };
    const names = Object.keys(circles);
    for (let a = 0; a < names.length; a++)
      for (let b = a + 1; b < names.length; b++) {
        const p = circles[names[a]], q = circles[names[b]];
        const gap = Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r;
        assert.ok(gap >= 10, `${names[a]}-${names[b]} gap ${gap.toFixed(1)} at ${width}`);
      }
  }
});
