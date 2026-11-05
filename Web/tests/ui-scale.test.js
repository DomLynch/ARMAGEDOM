import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateUiScale } from "../src/engine/game-data-ui-options.js";
import { clampScale, createUiScale, effectiveScale, fitScale, uiScaleNow } from "../src/engine/ui-scale.js";
import { fakeOptionsDoc, fakeStorage } from "./helpers/fake-options-dom.js";

// The phone Controls size setting (data/uiScale.json, engine/ui-scale.js): the clamp, the per-orientation fit, the stored choice, the CSS
// variable and body class, the menu row, and that Normal changes nothing.
const D = GAME_DATA.uiScale;
const step = (id) => D.steps.find((s) => s.id === id).scale;
const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const SMALL_PORTRAIT = { width: 360, height: 640 };
const bad = (edit, pattern) => {
  const copy = structuredClone(D);
  edit(copy);
  assert.throws(() => validateUiScale(copy), pattern);
};

test("the shipped data passes its validator and Normal is exactly 1", () => {
  validateUiScale(structuredClone(D));
  assert.equal(D.default, "normal");
  assert.equal(step("normal"), 1);
  assert.deepEqual(
    D.steps.map((s) => s.id),
    ["small", "normal", "large", "largest"],
  );
});

test("the validator rejects bad rows", () => {
  bad((d) => (d.default = "large"), /exactly 1/);
  bad((d) => (d.default = "huge"), /exactly 1/);
  bad((d) => (d.steps[2].scale = 0.9), /ascend/);
  bad((d) => (d.steps[3].scale = 1.9), /outside bounds/);
  bad((d) => d.steps.push({ id: "small", scale: 1.4 }), /unique|outside bounds/);
  bad((d) => (d.bounds.min = 0), /bounds/);
  bad((d) => (d.bounds.max = 3), /bounds/);
  bad((d) => (d.fit.portrait = d.fit.portrait.filter((r) => r.axis !== "width")), /needs a width/);
  bad((d) => (d.fit.landscape[0].scalablePx = 0), /scalablePx/);
  bad((d) => (d.fit.landscape[0].axis = "depth"), /axis/);
  bad((d) => delete d.text.steps.large, Error);
  bad((d) => (d.cssVar = "ui-scale"), /cssVar/);
  bad((d) => (d.roundTo = 0), /roundTo/);
  bad((d) => (d.extra = 1), Error);
});

test("clampScale keeps the selected scale inside the bounds and survives junk", () => {
  assert.equal(clampScale(0.1), D.bounds.min);
  assert.equal(clampScale(9), D.bounds.max);
  assert.equal(clampScale(1.15), 1.15);
  assert.equal(clampScale(NaN), 1);
  assert.equal(clampScale(undefined), 1);
  assert.equal(clampScale("2"), 1);
});

test("Normal and Small are never held back by the screen; Normal is exactly 1 everywhere", () => {
  for (const view of [PHONE_PORTRAIT, PHONE_LANDSCAPE, SMALL_PORTRAIT, { width: 320, height: 240 }]) {
    assert.equal(effectiveScale(step("normal"), view), 1);
    assert.equal(effectiveScale(step("small"), view), step("small"));
  }
});

test("a step above Normal is clamped to what fits, never below 1 and never above the step", () => {
  for (const view of [
    PHONE_PORTRAIT,
    PHONE_LANDSCAPE,
    SMALL_PORTRAIT,
    { width: 320, height: 240 },
    { width: 1200, height: 900 },
  ]) {
    for (const id of ["large", "largest"]) {
      const got = effectiveScale(step(id), view);
      assert.ok(got >= 1 && got <= step(id), `${id} on ${view.width}x${view.height} gave ${got}`);
    }
  }
  // Roomy: the full step. Cramped: held at Normal. In between: a fraction of the way.
  assert.equal(effectiveScale(step("largest"), { width: 1200, height: 900 }), step("largest"));
  assert.equal(effectiveScale(step("largest"), { width: 320, height: 240 }), 1);
  const tight = effectiveScale(step("largest"), PHONE_PORTRAIT);
  assert.ok(tight > 1 && tight < step("largest"), `a 390 wide portrait phone fits ${tight}`);
  assert.ok(effectiveScale(step("large"), PHONE_PORTRAIT) >= tight);
});

test("what fits grows with the screen and is judged in the screen's own orientation", () => {
  assert.ok(fitScale({ width: 430, height: 900 }) > fitScale({ width: 360, height: 900 }));
  assert.ok(
    fitScale({ width: 390, height: 900 }) > fitScale({ width: 390, height: 600 }) ||
      fitScale({ width: 390, height: 600 }) >= 1,
  );
  // The same pixels turned sideways use the landscape rows, so the answer differs.
  assert.notEqual(fitScale({ width: 844, height: 390 }), fitScale({ width: 390, height: 844 }));
  // Every row is honoured: the answer is the smallest of them.
  const view = { width: 700, height: 500 },
    rows = D.fit.landscape.map((r) => ((r.axis === "width" ? view.width : view.height) - r.fixedPx) / r.scalablePx);
  assert.equal(fitScale(view), Math.min(...rows));
});

test("the result is rounded to the data's precision and the desktop layout is never scaled", () => {
  const got = effectiveScale(1.333333, { width: 1200, height: 900 });
  assert.equal(got, Math.round(1.333333 * D.roundTo) / D.roundTo);
  assert.equal(effectiveScale(step("largest"), { width: 1200, height: 900 }, D, true), 1);
  assert.equal(effectiveScale(step("small"), { width: 1200, height: 900 }, D, true), 1);
});

function rig({ width = 1200, height = 900, classes = [], storage = fakeStorage(), seed } = {}) {
  const page = fakeOptionsDoc({ bodyClasses: classes }),
    win = { innerWidth: width, innerHeight: height, localStorage: storage };
  if (seed) storage.store.set(D.storageKey, seed);
  const ui = createUiScale({ data: D, doc: page.doc, win });
  return { ...page, win, storage, ui, select: page.doc.getElementById("ui-scale") };
}

test("the menu row sits after the View row with the data's label and options, and starts on Normal", () => {
  const r = rig();
  assert.ok(r.select);
  assert.equal(r.settings.children[1].children[0].textContent, D.text.label);
  assert.deepEqual(
    r.select.children.map((o) => [o.value, o.textContent]),
    D.steps.map((s) => [s.id, D.text.steps[s.id]]),
  );
  assert.equal(r.select.value, "normal");
  assert.equal(r.ui.step, "normal");
});

test("Normal writes the variable as 1 and adds no body class", () => {
  const r = rig();
  assert.equal(r.root.style.props[D.cssVar], "1");
  assert.equal(r.body.classList.contains(D.bodyClass), false);
  assert.equal(uiScaleNow(), 1);
});

test("choosing a step stores it, sets the variable and the body class, and moves the select", () => {
  const r = rig();
  r.select.value = "large";
  r.select.fire("change");
  assert.equal(r.storage.store.get(D.storageKey), "large");
  assert.equal(r.root.style.props[D.cssVar], String(effectiveScale(step("large"), { width: 1200, height: 900 })));
  assert.equal(r.body.classList.contains(D.bodyClass), true);
  assert.equal(uiScaleNow(), Number(r.root.style.props[D.cssVar]));
  assert.equal(r.ui.setStep("nonsense"), false);
  assert.equal(r.ui.step, "large");
  r.ui.setStep("normal");
  assert.equal(r.select.value, "normal");
  assert.equal(r.body.classList.contains(D.bodyClass), false);
  assert.equal(uiScaleNow(), 1);
});

test("a stored choice comes back on the next visit; junk and a blocked store fall back to Normal", () => {
  assert.equal(rig({ seed: "small" }).ui.step, "small");
  assert.equal(rig({ seed: "gigantic" }).ui.step, "normal");
  const blocked = rig({ storage: fakeStorage({ broken: true }) });
  assert.equal(blocked.ui.step, "normal");
  assert.doesNotThrow(() => blocked.ui.setStep("small")); // still applies for this visit
  assert.equal(blocked.root.style.props[D.cssVar], String(step("small")));
});

test("sync re-applies when the screen turns and does nothing when nothing changed", () => {
  const r = rig({ width: 390, height: 844, seed: "largest" });
  const portrait = r.root.style.props[D.cssVar];
  assert.equal(portrait, String(effectiveScale(step("largest"), PHONE_PORTRAIT)));
  r.root.style.props[D.cssVar] = "marker";
  r.ui.sync();
  assert.equal(r.root.style.props[D.cssVar], "marker", "an unchanged screen is left alone");
  r.win.innerWidth = 844;
  r.win.innerHeight = 390;
  r.ui.sync();
  assert.equal(r.root.style.props[D.cssVar], String(effectiveScale(step("largest"), PHONE_LANDSCAPE)));
});

test("the desktop layout is never scaled and its row is hidden; a first touch brings both back", () => {
  const r = rig({ seed: "largest", classes: ["desktop-ui"] });
  assert.equal(r.root.style.props[D.cssVar], "1");
  assert.equal(r.body.classList.contains(D.bodyClass), false);
  assert.equal(r.select.parent.hidden, true);
  r.body.classList.add("touch");
  r.ui.sync();
  assert.ok(Number(r.root.style.props[D.cssVar]) > 1);
  assert.equal(r.select.parent.hidden, false);
});

test("dispose removes the row, the class and the variable", () => {
  const r = rig({ seed: "largest" });
  r.ui.dispose();
  assert.equal(r.select.parent.removed, true);
  assert.equal(r.root.style.props[D.cssVar], undefined);
  assert.equal(r.body.classList.contains(D.bodyClass), false);
  assert.equal(uiScaleNow(), 1);
});

test("a page without the elements, or without a document, makes nothing and does not throw", () => {
  assert.doesNotThrow(() => createUiScale({ data: D, doc: undefined, win: {} }).sync());
  const bare = fakeOptionsDoc(),
    doc = { ...bare.doc, getElementById: () => null };
  const ui = createUiScale({ data: D, doc, win: { innerWidth: 400, innerHeight: 800, localStorage: fakeStorage() } });
  assert.equal(bare.settings.children.length, 1, "no menu row is added, and nothing crashes");
  assert.doesNotThrow(() => ui.setStep("small"));
});

test("the stylesheet scales every control group from its own corner and only under body.ui-scaled", () => {
  const css = readFileSync(new URL("../src/hud-options.css", import.meta.url), "utf8");
  for (const [selector, origin] of [
    ["#move", "left bottom"],
    ["#action-cluster", "right bottom"],
    ["#menu-button", "right top"],
    ["#weapon-tiles", "left bottom"],
  ]) {
    const block = new RegExp(`body\\.ui-scaled ${selector} \\{([^}]*)\\}`).exec(css);
    assert.ok(block, `${selector} has a scaled rule`);
    assert.match(block[1], new RegExp(`transform-origin: ${origin}`));
    assert.match(block[1], new RegExp(`scale\\(var\\(${D.cssVar}`));
  }
  assert.ok(!/^(#move|#action-cluster|#menu-button|#weapon-tiles)\b/m.test(css), "no unscoped control rule");
  assert.match(css, new RegExp(`body\\.${D.bodyClass} #move \\.move-knob`));
});
