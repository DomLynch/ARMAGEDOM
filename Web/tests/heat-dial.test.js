import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHeatDial } from "../src/engine/game-data-ui-options.js";
import { createHeatDial, dialLine, dialState, heatDialOn, tierColour } from "../src/engine/heat-dial.js";
import { paletteColour, resetColourBlind, setColourBlindMode } from "../src/engine/colour-blind.js";
import { webText } from "../src/engine/web-text.js";
import { fakeOptionsDoc } from "./helpers/fake-options-dom.js";

// The heat dial (data/heatDial.json, engine/heat-dial.js): hidden at zero heat, the count/max line with the tier name, a fill that follows
// the count, a pulse on tier-up, the ?nodial=1 switch, the colour-blind palette, and the data checks.
const D = GAME_DATA.heatDial;
const HEAT = GAME_DATA.heat;
const TIERS = HEAT.pressure.tiers;
const bad = (edit, pattern) => {
  const copy = structuredClone(D);
  edit(copy);
  assert.throws(() => validateHeatDial(copy), pattern);
};
const heat = (count, extra = {}) => ({ count, lastKillAt: 0, seen: 0, rolls: 0, ...extra });
const game = (count, extra = {}) => ({
  time: 100,
  kills: 0,
  player: { hp: 100 },
  heat: count === null ? null : heat(count, { lastKillAt: 100 }),
  ...extra,
});

test("the shipped data passes its validator", () => {
  validateHeatDial(structuredClone(D));
  assert.deepEqual(D.offSwitch, { param: "nodial", value: "1" });
});

test("the validator rejects bad rows", () => {
  bad((d) => (d.widthPx = 5), /widthPx/);
  bad((d) => (d.barHeightPx = 0), /barHeightPx/);
  bad((d) => (d.percentOf = 10), /percentOf/);
  bad((d) => (d.pulse.scale = 1), /pulse.scale/);
  bad((d) => (d.pulse.scale = 3), /pulse.scale/);
  bad((d) => (d.pulse.seconds = 0), /pulse.seconds/);
  bad((d) => (d.colours.tiers = []), /colours.tiers/);
  bad((d) => (d.colours.tiers = ["red"]), /CSS colours/);
  bad((d) => (d.colours.back = "red; x"), /colours.back/);
  bad((d) => (d.offSwitch.param = "No Dial"), /offSwitch/);
  bad((d) => (d.enabled = 1), /true or false/);
  bad((d) => (d.extra = 1), Error);
});

test("the data and the heat tiers agree: a name and a colour for every tier", () => {
  assert.ok(D.colours.tiers.length >= TIERS.length, "a colour for each tier row");
  for (let n = 1; n <= TIERS.length; n++) assert.ok(webText(`heatDial.tier.${n}`).length > 0, `tier ${n} has a name`);
  assert.ok(TIERS[0].minHeat >= 1);
});

test("hidden at zero heat, with heat switched off, and with no game", () => {
  assert.equal(dialState(game(0)), null);
  assert.equal(dialState(game(null)), null);
  assert.equal(dialState(null), null);
  assert.equal(dialState({ time: 5 }), null);
});

test("the state is the count over the cap, the reached tier and the share filled", () => {
  const first = dialState(game(TIERS[0].minHeat));
  assert.equal(first.tier, 1);
  assert.equal(first.max, HEAT.maxHeat);
  const second = dialState(game(TIERS[1].minHeat));
  assert.equal(second.tier, 2);
  assert.equal(second.percent, Math.round((TIERS[1].minHeat / HEAT.maxHeat) * D.percentOf));
  assert.equal(dialState(game(TIERS[1].minHeat - 1)).tier, 1, "one short of a threshold stays on the lower tier");
  assert.equal(dialState(game(TIERS.at(-1).minHeat)).tier, TIERS.length);
  const full = dialState(game(HEAT.maxHeat + 40));
  assert.equal(full.count, HEAT.maxHeat);
  assert.equal(full.percent, D.percentOf);
  assert.equal(full.tier, TIERS.length);
});

test("below the first tier the dial shows the count alone", () => {
  const rules = structuredClone(HEAT);
  rules.pressure.tiers = rules.pressure.tiers.map((t, i) => ({ ...t, minHeat: i + 2 }));
  const state = dialState(game(1), rules);
  assert.equal(state.tier, 0);
  assert.equal(dialLine(state), webText("heatDial.line", { count: 1, max: HEAT.maxHeat }));
});

test("the newest mark dims through its last seconds so the player sees heat about to drop", () => {
  const fresh = dialState(game(4)).dim;
  assert.equal(fresh, 1);
  const g = game(4);
  g.heat.lastKillAt = g.time - (HEAT.decay.secondsPerMark - HEAT.decay.fadeSeconds / 2);
  const dim = dialState(g).dim;
  assert.ok(dim < 1 && dim > HEAT.decay.minAlpha, `dimmed to ${dim}`);
});

test("the line reads HEAT count/max, with the tier's name after it once a tier is reached", () => {
  const state = dialState(game(TIERS[1].minHeat));
  assert.equal(dialLine(state), `HEAT ${state.count}/${state.max} · ${webText("heatDial.tier.2")}`);
});

test("the off switch is the data's URL parameter, and the feature can be turned off in the data", () => {
  assert.equal(heatDialOn(D, ""), true);
  assert.equal(heatDialOn(D, "?nodial=1"), false);
  assert.equal(heatDialOn(D, "?nodial=0"), true);
  assert.equal(heatDialOn(D, "?nobars=1"), true, "other switches do not hide it");
  assert.equal(heatDialOn({ ...D, enabled: false }, ""), false);
});

function rig({ search = "" } = {}) {
  const page = fakeOptionsDoc(),
    s = { game: game(0), traveling: false, contextLost: false },
    dial = createHeatDial(s, { doc: page.doc, search });
  const root = page.top.children.find((n) => n.id === "heat-dial");
  return { ...page, s, dial, root, fill: root?.children[1].children[0], text: root?.children[0] };
}

test("the dial sits right under the run line, builds once, and starts hidden", () => {
  const r = rig();
  assert.equal(r.top.children.indexOf(r.root), r.top.children.indexOf(r.runHud) + 1);
  assert.equal(r.root.hidden, true);
  assert.equal(r.root.attributes["aria-live"], "off");
  assert.equal(r.root.style.width, `${D.widthPx}px`);
  // One tick for every tier above the first heat mark.
  const ticks = r.root.children[1].children.filter((n) => n.className === "heat-dial-tick");
  assert.equal(ticks.length, TIERS.filter((t) => t.minHeat > 1).length);
  assert.equal(
    ticks[0].style.left,
    `${Math.round((TIERS.find((t) => t.minHeat > 1).minHeat / HEAT.maxHeat) * D.percentOf)}%`,
  );
});

test("zero heat keeps it hidden; the first mark shows it with the count, the tier and a full-colour fill", () => {
  const r = rig();
  r.dial.update();
  assert.equal(r.root.hidden, true);
  r.s.game = game(TIERS[0].minHeat);
  r.dial.update();
  assert.equal(r.root.hidden, false);
  assert.equal(r.text.textContent, dialLine(dialState(r.s.game)));
  assert.equal(r.root.attributes["aria-label"], r.text.textContent);
  assert.equal(r.fill.style.width, `${dialState(r.s.game).percent}%`);
  assert.equal(r.fill.style.background, D.colours.tiers[0]);
  r.s.game = game(0);
  r.dial.update();
  assert.equal(r.root.hidden, true, "back to zero hides it again");
});

test("the fill follows the count and takes the tier's colour", () => {
  const r = rig();
  r.s.game = game(TIERS[0].minHeat);
  r.dial.update();
  r.s.game = game(TIERS[2].minHeat);
  r.dial.update();
  assert.equal(r.fill.style.width, `${dialState(r.s.game).percent}%`);
  assert.equal(r.fill.style.background, D.colours.tiers[2]);
  assert.equal(r.text.textContent, `HEAT ${TIERS[2].minHeat}/${HEAT.maxHeat} · ${webText("heatDial.tier.3")}`);
});

test("a tier-up pulses for the data's seconds of game time, and a plain kill within a tier does not", () => {
  const r = rig(),
    pulsing = () => r.root.classList.contains("heat-dial-pulse");
  r.s.game = game(TIERS[0].minHeat);
  r.dial.update();
  assert.equal(pulsing(), true, "the first tier-up when the dial appears");
  r.s.game.time += D.pulse.seconds + 0.01;
  r.dial.update();
  assert.equal(pulsing(), false, "settles after the pulse");
  const within = game(TIERS[0].minHeat + 1, { time: r.s.game.time });
  r.s.game = within;
  r.dial.update();
  assert.equal(pulsing(), false, "a kill inside the tier is quiet");
  r.s.game = game(TIERS[1].minHeat, { time: within.time + 1 });
  r.dial.update();
  assert.equal(pulsing(), true, "reaching the second tier pulses again");
  r.s.game.time += D.pulse.seconds / 2;
  r.dial.update();
  assert.equal(pulsing(), true, "still pulsing half way through");
  assert.equal(r.root.style.props["--heat-pulse-seconds"], `${D.pulse.seconds}s`);
  assert.equal(r.root.style.props["--heat-pulse-scale"], String(D.pulse.scale));
});

test("a tier that drops back does not pulse; death clears a pulse and a restarted clock cannot leave one stuck", () => {
  const r = rig(),
    pulsing = () => r.root.classList.contains("heat-dial-pulse");
  r.s.game = game(TIERS[1].minHeat, { time: 500 });
  r.dial.update();
  assert.equal(pulsing(), true);
  r.s.game = game(TIERS[0].minHeat, { time: 500.1 });
  r.dial.update();
  assert.equal(pulsing(), true, "still inside the first pulse");
  r.s.game = game(TIERS[0].minHeat, { time: 1, player: { hp: 0 } });
  r.dial.update();
  assert.equal(r.root.hidden, true, "a dead player shows nothing");
  assert.equal(pulsing(), false);
  r.s.game = game(TIERS[0].minHeat, { time: 2 });
  r.dial.update();
  r.s.game.time = 2 + D.pulse.seconds + 0.5;
  r.dial.update();
  assert.equal(pulsing(), false, "the new run's clock does not inherit the old deadline");
});

test("it hides while travelling, after a lost context, once the run is finished and with no game", () => {
  const r = rig();
  r.s.game = game(5);
  r.dial.update();
  assert.equal(r.root.hidden, false);
  for (const patch of [{ traveling: true }, { contextLost: true }]) {
    Object.assign(r.s, patch);
    r.dial.update();
    assert.equal(r.root.hidden, true, JSON.stringify(patch));
    Object.assign(r.s, { traveling: false, contextLost: false });
    r.dial.update();
    assert.equal(r.root.hidden, false);
  }
  r.s.game.finished = true;
  r.dial.update();
  assert.equal(r.root.hidden, true);
  r.s.game = null;
  assert.doesNotThrow(() => r.dial.update());
});

test("a steady frame writes nothing: styles and text change only when the numbers do", () => {
  const r = rig();
  r.s.game = game(7);
  r.dial.update();
  let writes = 0;
  const watch = (obj, key) => {
    let value = obj[key];
    Object.defineProperty(obj, key, {
      get: () => value,
      set: (v) => {
        writes++;
        value = v;
      },
    });
  };
  watch(r.text, "textContent");
  watch(r.fill.style, "width");
  watch(r.fill.style, "opacity");
  watch(r.fill.style, "background");
  for (let i = 0; i < 20; i++) r.dial.update();
  assert.equal(writes, 0);
  r.s.game = game(8);
  r.dial.update();
  assert.ok(writes > 0, "a new count is written");
});

test("?nodial=1 builds nothing at all", () => {
  const r = rig({ search: "?nodial=1" });
  assert.equal(r.root, undefined);
  r.s.game = game(9);
  assert.doesNotThrow(() => r.dial.update());
  assert.doesNotThrow(() => r.dial.dispose());
  assert.equal(r.top.children.length, 1);
});

test("no #hud-top on the page means no dial and no crash", () => {
  const page = fakeOptionsDoc(),
    doc = { ...page.doc, getElementById: () => null },
    dial = createHeatDial({ game: game(5) }, { doc });
  assert.doesNotThrow(() => dial.update());
});

test("dispose removes the dial", () => {
  const r = rig();
  r.dial.dispose();
  assert.equal(r.root.removed, true);
});

test("a colour-blind palette recolours the tier fill, and Off restores it", (t) => {
  t.after(() => resetColourBlind());
  const r = rig();
  r.s.game = game(TIERS[0].minHeat);
  r.dial.update();
  assert.equal(r.fill.style.background, D.colours.tiers[0]);
  setColourBlindMode("tritanopia");
  r.dial.update();
  assert.equal(r.fill.style.background, `#${paletteColour("heatDial.tier1", "tritanopia")}`);
  assert.equal(tierColour(1, D), `#${paletteColour("heatDial.tier1", "tritanopia")}`);
  setColourBlindMode("off");
  r.dial.update();
  assert.equal(r.fill.style.background, D.colours.tiers[0]);
  assert.equal(tierColour(99, D), D.colours.tiers[2], "a tier past the list uses the last colour");
});

test("the stylesheet keeps the dial passive and drops the pulse animation under reduced motion", () => {
  const css = readFileSync(new URL("../src/hud-options.css", import.meta.url), "utf8");
  assert.match(css, /\.heat-dial \{[^}]*pointer-events: none/);
  assert.match(css, /@keyframes heat-dial-pulse/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^@]*\.heat-dial-pulse \{\s*animation: none/);
});
