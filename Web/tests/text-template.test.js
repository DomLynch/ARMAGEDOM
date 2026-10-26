import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateVisual } from "../src/engine/game-data.js";
import { fillText, checkTemplate } from "../src/engine/text-template.js";

const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/visual.json", import.meta.url), "utf8")));

test("fillText swaps each named placeholder and the shipped words are unchanged", () => {
  const text = GAME_DATA.visual.routeGuidance.text;
  assert.equal(fillText(text.exit, { area: "SOUTH" }), "EXIT → SOUTH");
  assert.equal(fillText(text.cue, { closed: "", direction: "↑", name: "EAST", metres: 12 }), "↑ EAST · 12m");
  assert.equal(fillText(text.cue, { closed: text.roadClosed, direction: "←", name: "AREA 8", metres: 3 }), "ROAD CLOSED · ← AREA 8 · 3m");
  assert.equal(fillText(GAME_DATA.visual.travelText.travelling, { area: "EAST" }), "Traveling to EAST…");
  assert.deepEqual(text.entranceSign, ["CENTRAL SAFEHOUSE", "SIDE ENTRANCE"]);
  assert.equal(text.compass.length, 8);
});

test("a bad template, a missing or unknown placeholder, or a stray brace is rejected at load", () => {
  assert.doesNotThrow(() => validateVisual(raw()));
  const bad = [
    (d) => (d.routeGuidance.text.exit = "EXIT →"),
    (d) => (d.routeGuidance.text.exit = "EXIT → {aera}"),
    (d) => (d.routeGuidance.text.cue = "{direction} {name}"),
    (d) => (d.routeGuidance.text.pistol = "PISTOL {x}"),
    (d) => (d.routeGuidance.text.pistol = ""),
    (d) => (d.routeGuidance.text.compass = ["→"]),
    (d) => (d.routeGuidance.text.entranceSign = ["lower case"]),
    (d) => (d.travelText.travelling = "Traveling…"),
    (d) => (d.travelText.loadFailed = "Could not {load"),
    (d) => (d.travelText.extra = "x"),
  ];
  for (const mutate of bad) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateVisual(d));
  }
  const fail = (why) => {
    throw TypeError(why);
  };
  assert.doesNotThrow(() => checkTemplate("t", "a {x} b", ["x"], fail, ["x"]));
});
