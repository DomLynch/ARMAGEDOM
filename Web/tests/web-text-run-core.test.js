import test from "node:test";
import assert from "node:assert/strict";
import { webText } from "../src/engine/web-text.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateWebText } from "../src/engine/game-data-web-text.js";

// The strings the run core showed before they moved to data/webText.json: the on-screen text must not change.
const RUN_CORE = [
  ["runCore.savingUnavailable.supplies", {}, "Run saving unavailable. Supplies kept."],
  ["runCore.savingUnavailable.contract", {}, "Saving unavailable. Contract and equipment kept."],
  ["runCore.savingUnavailable.equipment", {}, "Saving unavailable. Equipment kept."],
  ["runCore.savingUnavailable.rifle", {}, "Saving unavailable. Rifle and ammunition kept."],
  ["runCore.savedRunUnreadable", {}, "Saved run could not be read. Open the menu and choose Reset game to start fresh."],
  ["runCore.pickup.pistol", {}, "Pistol collected and equipped."],
  ["runCore.pickup.vest", { percent: Math.round(GAME_DATA.weapons.vest.reduction * 100) }, "Worn vest equipped · 10% protection."],
  ["runCore.pickup.rounds", { amount: 12 }, "Scavenged 12 spare rounds."],
  ["runCore.pickup.dressing", { amount: 3 }, "Dressing restored 3 health."],
  ["runCore.refusal.pistol-required", {}, "Collect the pistol first. Rounds kept."],
  ["runCore.refusal.reserve-full", {}, "Spare rounds full. Supply kept."],
  ["runCore.refusal.health-full", {}, "Health full. Dressing kept."],
  ["runCore.bossDrop", { name: "Ember Projector" }, "Ember Projector dropped."],
  [
    "runCore.vestEquipped",
    { percent: Math.round(GAME_DATA.weapons.vest.reduction * 100) },
    "Worn vest equipped · 10% protection from unblocked hits.",
  ],
];

test("run-core lines read from data are string-equal to the old literals", () => {
  for (const [id, vars, expected] of RUN_CORE) assert.equal(webText(id, vars), expected, id);
});

test("webText fails loudly on an unknown id or a missing placeholder value", () => {
  assert.throws(() => webText("runCore.nope"), /no text with id/);
  assert.throws(() => webText("runCore.pickup.rounds"), /needs \{amount\}/);
});

test("the webText validator rejects bad ids, empty text and stray braces", () => {
  const base = (texts) => ({ schema_version: 1, texts });
  assert.doesNotThrow(() => validateWebText(base({ "a.b": "Hello {name}." })));
  assert.throws(() => validateWebText(base({ "bad id": "x y" })), /not a valid text id/);
  assert.throws(() => validateWebText(base({ a: "  " })), /non-empty/);
  assert.throws(() => validateWebText(base({ a: "Oops {name" })), /stray brace/);
  assert.throws(() => validateWebText({ schema_version: 1, texts: {}, extra: 1 }));
});
