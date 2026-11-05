import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateColourBlind } from "../src/engine/game-data-ui-options.js";
import {
  colourBlindMode,
  createColourBlind,
  paletteColour,
  resetColourBlind,
  setColourBlindMode,
  signalCss,
  signalHex,
  signalRgb,
  signalRgbList,
} from "../src/engine/colour-blind.js";
import { rampColour } from "../src/engine/damage-feedback.js";
import { createLootStore } from "../src/engine/loot.js";
import { fakeOptionsDoc, fakeStorage } from "./helpers/fake-options-dom.js";

// The colour-blind palettes (data/colourBlind.json, engine/colour-blind.js): the lookups, Off changing nothing, the stored choice, the menu
// row, every slot being read somewhere, and a simulation of the three deficiencies over every palette laid on the game's real colours.
const D = GAME_DATA.colourBlind;
const MODES = D.modes.map((m) => m.id).filter((id) => id !== "off");
const bad = (edit, pattern) => {
  const copy = structuredClone(D);
  edit(copy);
  assert.throws(() => validateColourBlind(copy), pattern);
};

test("the shipped data passes its validator", () => {
  validateColourBlind(structuredClone(D));
  assert.deepEqual(MODES, ["deuteranopia", "protanopia", "tritanopia"]);
  assert.equal(D.default, "off");
});

test("the validator rejects bad palettes", () => {
  bad((d) => (d.modes[1].slots["enemyBars.nothing"] = "ffffff"), /not a declared slot/);
  bad((d) => (d.modes[1].slots["enemyBars.fill"] = "#ffffff"), /6 lowercase hex/);
  bad((d) => (d.modes[1].slots["enemyBars.fill"] = "FFFFFF"), /6 lowercase hex/);
  bad((d) => (d.modes[1].slots["enemyBars.fill"] = ["ffffff", "000000"]), /6 lowercase hex/);
  bad((d) => (d.modes[1].slots["damage.ramp"] = "ffffff"), /list of 2 or more/);
  bad((d) => (d.modes[1].slots["damage.ramp"] = ["ffffff"]), /list of 2 or more/);
  bad((d) => (d.modes[0].slots["enemyBars.fill"] = "ffffff"), /first mode must be off/);
  bad((d) => (d.modes[0].id = "plain"), /first mode must be off/);
  bad((d) => d.modes.push({ id: "off", slots: {} }), /unique/);
  bad((d) => (d.slots["enemyBars.fill"] = "rgb"), /kind must be hex or list/);
  bad((d) => (d.slots.fill = "hex"), /slot name/);
  bad((d) => (d.default = "protanopia"), /default must be off/);
  bad((d) => delete d.text.modes.tritanopia, Error);
  bad((d) => (d.text.label = " "), /label/);
  bad((d) => (d.enabled = "yes"), /true or false/);
  bad((d) => (d.storageKey = "Bad Key"), /storageKey/);
});

test("Off, and a slot a palette leaves alone, hand back the file's own colour untouched", () => {
  const rgb = [10, 20, 30],
    list = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
  assert.equal(signalHex("enemyBars.fill", "c23a32", "off"), "c23a32");
  assert.equal(signalCss("enemyBars.fill", "#c23a32", "off"), "#c23a32");
  assert.equal(signalRgb("damage.crit", rgb, "off"), rgb, "the same array, not a copy");
  assert.equal(signalRgbList("damage.ramp", list, "off"), list);
  assert.equal(signalCss("enemyBars.low", "#abcdef", "tritanopia"), "#abcdef", "tritanopia leaves the bar colours");
  assert.equal(signalHex("rarity.common", "9fb3ad", "deuteranopia"), "9fb3ad");
  assert.equal(signalHex("not.a.slot", "123456", "protanopia"), "123456");
  assert.equal(signalHex("enemyBars.fill", "c23a32", "no-such-mode"), "c23a32");
});

test("a palette's colours come back in the shape each reader wants", () => {
  const hex = paletteColour("enemyBars.fill", "protanopia");
  assert.match(hex, /^[0-9a-f]{6}$/);
  assert.equal(signalHex("enemyBars.fill", "c23a32", "protanopia"), hex);
  assert.equal(signalCss("enemyBars.fill", "#c23a32", "protanopia"), `#${hex}`);
  assert.deepEqual(
    signalRgb("damage.crit", [255, 215, 0], "protanopia"),
    paletteColour("damage.crit", "protanopia")
      .match(/../g)
      .map((p) => Number(`0x${p}`)),
  );
  const ramp = signalRgbList("damage.ramp", GAME_DATA.damageFeedback.numbers.colourRamp, "deuteranopia");
  assert.equal(ramp.length, GAME_DATA.damageFeedback.numbers.colourRamp.length);
  assert.ok(ramp.every((c) => c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)));
  assert.equal(
    signalCss("enemyBars.fill", "x", "protanopia"),
    signalCss("enemyBars.fill", "x", "protanopia"),
    "cached, one string",
  );
});

test("a palette list of the wrong length is ignored rather than breaking the ramp", () => {
  const base = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  assert.equal(signalRgbList("damage.ramp", base, "deuteranopia"), base);
});

test("the mode defaults to Off, reads a stored choice, and falls back from junk or a blocked store", () => {
  const read = (win) => colourBlindMode({ ...D }, win);
  assert.equal(read({ localStorage: fakeStorage() }), "off");
  assert.equal(read({ localStorage: fakeStorage({ seed: { [D.storageKey]: "tritanopia" } }) }), "tritanopia");
  assert.equal(read({ localStorage: fakeStorage({ seed: { [D.storageKey]: "rainbow" } }) }), "off");
  assert.equal(read({ localStorage: fakeStorage({ broken: true }) }), "off");
  assert.equal(read({}), "off");
  assert.equal(
    colourBlindMode(
      { ...D, enabled: false },
      { localStorage: fakeStorage({ seed: { [D.storageKey]: "tritanopia" } }) },
    ),
    "off",
  );
});

test("the menu row stores the choice, shows it, and ignores an unknown mode", () => {
  const page = fakeOptionsDoc(),
    storage = fakeStorage(),
    win = { localStorage: storage },
    data = { ...D },
    cb = createColourBlind({ data, doc: page.doc, win }),
    select = page.doc.getElementById("colour-blind");
  assert.ok(select);
  assert.equal(page.settings.children[1].children[0].textContent, D.text.label);
  assert.deepEqual(
    select.children.map((o) => [o.value, o.textContent]),
    D.modes.map((m) => [m.id, D.text.modes[m.id]]),
  );
  assert.equal(select.value, "off");
  select.value = "protanopia";
  select.fire("change");
  assert.equal(storage.store.get(D.storageKey), "protanopia");
  assert.equal(cb.mode, "protanopia");
  assert.equal(cb.setMode("rainbow"), false);
  assert.equal(cb.mode, "protanopia");
  cb.setMode("off");
  assert.equal(select.value, "off");
  cb.dispose();
  assert.equal(select.parent.removed, true);
});

test("a blocked store still lets the choice stand for the visit", () => {
  const page = fakeOptionsDoc(),
    win = { localStorage: fakeStorage({ broken: true }) };
  const cb = createColourBlind({ data: { ...D }, doc: page.doc, win });
  assert.doesNotThrow(() => cb.setMode("tritanopia"));
});

test("with the feature off in the data nothing is added and the mode stays Off", () => {
  const page = fakeOptionsDoc(),
    cb = createColourBlind({ data: { ...D, enabled: false }, doc: page.doc, win: {} });
  assert.equal(page.doc.getElementById("colour-blind"), null);
  assert.equal(cb.mode, "off");
  assert.equal(cb.setMode("protanopia"), false);
});

test("the damage number ramp and the loot rarity colours follow the mode, and Off restores them", (t) => {
  t.after(() => resetColourBlind());
  const numbers = GAME_DATA.damageFeedback.numbers;
  setColourBlindMode("off");
  const before = [0, 5, 10].map((steps) => rampColour(steps, numbers));
  assert.equal(before[0], "rgb(255,255,255)");
  setColourBlindMode("deuteranopia");
  const after = [0, 5, 10].map((steps) => rampColour(steps, numbers));
  assert.equal(after[0], before[0]);
  assert.notEqual(after[2], before[2], "deuteranopia moves the red end of the ramp");
  setColourBlindMode("off");
  assert.deepEqual(
    [0, 5, 10].map((steps) => rampColour(steps, numbers)),
    before,
  );

  const session = createLootStore({ api: {} });
  const rare = () => session.describe("hunter-cpu").rarityColour;
  assert.equal(rare(), GAME_DATA.loot.rarities.rare);
  setColourBlindMode("deuteranopia");
  assert.equal(rare(), paletteColour("rarity.rare", "deuteranopia"));
  setColourBlindMode("off");
  assert.equal(rare(), GAME_DATA.loot.rarities.rare);
});

// Every declared slot has a reader: the slot's name, or its group prefix built with a template, appears in a source file other than the
// lookup module and its data checks. Stops a palette row from silently doing nothing.
test("every slot in the data is read by some code", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url)),
    walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : [],
      ),
    sources = walk(root)
      .filter((f) => !/colour-blind\.js$|game-data/.test(f))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
  for (const slot of Object.keys(D.slots)) {
    const [group] = slot.split(".");
    const stem = slot.replace(/\d+$/, ""); // a slot such as heatDial.tier1 is read through `heatDial.tier${n}`
    assert.ok(
      sources.includes(`"${slot}"`) || sources.includes(`\`${group}.\${`) || sources.includes(`\`${stem}\${`),
      `no code reads the slot ${slot}`,
    );
  }
});

// ---- Simulation. Machado et al. 2009 matrices (severity 1) in linear RGB, CIE Lab distances, WCAG contrast against the dark ground the HUD
// sits on. The colours are the game's real ones (enemyBars.json, threatArrows.json, damageFeedback.json, loot.json, heatDial.json) with the
// palette laid over them, so a file edit that breaks a palette fails here.
const MATRIX = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const channels = (hex) => hex.match(/../g).map((p) => Number(`0x${p}`) / 255);
const seen = (hex, mode) => {
  const l = channels(hex).map(lin);
  return MATRIX[mode].map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
};
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lab = (rgb) => {
  const [r, g, b] = rgb,
    f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116),
    x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047),
    y = f(luminance(rgb)),
    z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const distance = (a, b, mode) => Math.hypot(...lab(seen(a, mode)).map((v, i) => v - lab(seen(b, mode))[i]));
const contrast = (hex, mode) => (luminance(seen(hex, mode)) + 0.05) / (luminance(channels("0b1011").map(lin)) + 0.05);
const hexOf = (rgb) => rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const bare = (css) => css.replace("#", "");

// The colours for a mode: slot -> hex, the file's own colour unless the palette moves it.
function colours(mode) {
  const bars = GAME_DATA.enemyBars.colours,
    arrows = GAME_DATA.threatArrows,
    dmg = GAME_DATA.damageFeedback,
    pick = (slot, base) => paletteColour(slot, mode) ?? base,
    out = {};
  for (const name of ["fill", "low", "elite", "follower"])
    out[`enemyBars.${name}`] = pick(`enemyBars.${name}`, bare(bars[name]));
  out["threatArrows.plain"] = pick("threatArrows.plain", arrows.plain.colour);
  out["threatArrows.marked"] = pick("threatArrows.marked", arrows.marked.colour);
  const ramp = paletteColour("damage.ramp", mode) ?? dmg.numbers.colourRamp.map(hexOf);
  ramp.forEach((hex, i) => (out[`damage.ramp${i}`] = hex));
  out["damage.crit"] = pick("damage.crit", hexOf(dmg.numbers.critColour));
  out["vignette.flash"] = pick("vignette.flash", hexOf(dmg.vignette.flash.rgb));
  out["vignette.lowDark"] = pick("vignette.lowDark", hexOf(dmg.vignette.low.dark));
  out["vignette.lowLight"] = pick("vignette.lowLight", hexOf(dmg.vignette.low.light));
  for (const [name, hex] of Object.entries(GAME_DATA.loot.rarities))
    out[`rarity.${name}`] = pick(`rarity.${name}`, hex);
  GAME_DATA.heatDial.colours.tiers.forEach(
    (css, i) => (out[`heatDial.tier${i + 1}`] = pick(`heatDial.tier${i + 1}`, bare(css))),
  );
  return out;
}

const GROUPS = [
  { name: "enemy bar states", keys: (c) => Object.keys(c).filter((k) => k.startsWith("enemyBars.")), apart: 20 },
  { name: "threat arrows", keys: (c) => Object.keys(c).filter((k) => k.startsWith("threatArrows.")), apart: 20 },
  { name: "damage ramp and crit", keys: (c) => Object.keys(c).filter((k) => k.startsWith("damage.")), apart: 20 },
  { name: "low health pulse", keys: () => ["vignette.lowDark", "vignette.lowLight"], apart: 15 },
  { name: "rarity", keys: (c) => Object.keys(c).filter((k) => k.startsWith("rarity.")), apart: 18 },
  { name: "heat tiers", keys: (c) => Object.keys(c).filter((k) => k.startsWith("heatDial.")), apart: 20 },
];

for (const mode of MODES) {
  test(`${mode}: the signal colours that share a place stay apart under the simulated deficiency`, () => {
    const all = colours(mode);
    for (const group of GROUPS) {
      const keys = group.keys(all);
      for (let i = 0; i < keys.length; i++)
        for (let j = i + 1; j < keys.length; j++) {
          const d = distance(all[keys[i]], all[keys[j]], mode);
          assert.ok(
            d >= group.apart,
            `${mode} ${group.name}: ${keys[i]} and ${keys[j]} are ${d.toFixed(1)} apart, need ${group.apart}`,
          );
        }
    }
  });

  test(`${mode}: every signal colour stays readable against the dark HUD ground`, () => {
    for (const [slot, hex] of Object.entries(colours(mode))) {
      if (slot === "vignette.lowDark") continue; // the dark pole of a pulse, meant to be dim
      const need = slot.startsWith("rarity.") ? 4.5 : 3,
        got = contrast(hex, mode);
      assert.ok(got >= need, `${mode} ${slot} (${hex}) contrast ${got.toFixed(1)}, need ${need}`);
    }
  });
}

test("each palette actually moves something, and only to slots that exist", () => {
  for (const mode of MODES) {
    const row = D.modes.find((m) => m.id === mode);
    assert.ok(Object.keys(row.slots).length >= 1, `${mode} changes at least one slot`);
    for (const slot of Object.keys(row.slots)) assert.ok(D.slots[slot], `${mode}: ${slot}`);
  }
  const ramp = D.modes.find((m) => m.id === "deuteranopia").slots["damage.ramp"];
  assert.equal(
    ramp.length,
    GAME_DATA.damageFeedback.numbers.colourRamp.length,
    "a ramp palette has one colour per ramp stop",
  );
});
