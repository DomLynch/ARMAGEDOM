import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance, validateCreatures } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";
import { sweepCValues } from "./helpers/sweep-c-values.js";

// Sweep batch C: bridge-steering.js, drone-laser.js, finisher-crown.js, finisher-cosmetics.js and sever-blood-effect.js lose their last tuning
// numbers. The steering margins, stall limits and the laser trail are creatures.json `bridgeSteering` and `droneLaser`; the crown split,
// the corpse glow pulse and the blood effect looks are appearance.json `crownSplit`, `finisherCosmetics` and `severBloodEffect`. The fixture
// is every value the five modules computed before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/sweep-c-pre-data.json", import.meta.url)));
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));
const rawCreatures = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/creatures.json", import.meta.url))));
const FILES = [
  "bridge-steering.js",
  "drone-laser.js",
  "finisher-crown.js",
  "engine/finisher-cosmetics.js",
  "engine/sever-blood-effect.js",
];

test("every value the five modules compute equals the old one exactly", () => {
  const now = sweepCValues();
  for (const part of Object.keys(old)) assert.deepEqual(now[part], old[part], part);
  assert.equal(old.bridge.steps.length, 72);
  assert.equal(Object.keys(old.cosmetics).length, 36);
  assert.equal(old.crown.budget.tight, "throws Crown vertex budget exceeded");
  assert(new Set(old.bridge.steps.map((s) => JSON.stringify(s.trace))).size >= 6, "the steering scenarios differ");
  assert(
    new Set(old.bridge.steps.map((s) => JSON.stringify(s.end))).size >= 8,
    "the steering scenarios end in different places",
  );
});

test("the numbers are frozen data read through game-data.js", () => {
  assert.deepEqual(GAME_DATA.creatures.bridgeSteering, {
    edgeMargin: 0.061,
    leash: 12,
    progressStep: 0.08,
    stallSeconds: 0.75,
    waypointReach: 0.15,
  });
  assert.deepEqual(GAME_DATA.creatures.droneLaser, { trailMetres: 0.6, width: 0.12 });
  assert.equal(GAME_DATA.appearance.crownSplit.cutColor, "#49251f");
  assert(Object.isFrozen(GAME_DATA.appearance.severBloodEffect));
});

test("the loader rejects broken blocks", () => {
  const brokenAppearance = (mutate) => () => {
    const d = rawAppearance();
    mutate(d);
    validateAppearance(d);
  };
  const brokenCreatures = (mutate) => () => {
    const d = rawCreatures();
    mutate(d);
    validateCreatures(d);
  };
  assert.doesNotThrow(brokenAppearance(() => {}));
  assert.doesNotThrow(brokenCreatures(() => {}));
  for (const key of ["crownSplit", "finisherCosmetics", "severBloodEffect"])
    assert.throws(
      brokenAppearance((d) => {
        delete d[key];
      }),
      key,
    );
  for (const key of ["bridgeSteering", "droneLaser"])
    assert.throws(
      brokenCreatures((d) => {
        delete d[key];
      }),
      key,
    );
  assert.throws(
    brokenAppearance((d) => {
      d.crownSplit.cutColor = "49251f";
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      d.crownSplit.maxVertices = 5;
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      d.finisherCosmetics.hotMix = 2;
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      d.severBloodEffect.jetSegments = 8.5;
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      d.severBloodEffect.poolSegments = 2;
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      d.severBloodEffect.color = 0x831428;
    }),
  );
  assert.throws(
    brokenAppearance((d) => {
      delete d.severBloodEffect.groundLift;
    }),
  );
  assert.throws(
    brokenCreatures((d) => {
      d.bridgeSteering.stallSeconds = 0;
    }),
  );
  assert.throws(
    brokenCreatures((d) => {
      d.bridgeSteering.leash = "12";
    }),
  );
  assert.throws(
    brokenCreatures((d) => {
      d.bridgeSteering.extra = 1;
    }),
  );
  assert.throws(
    brokenCreatures((d) => {
      d.droneLaser.width = 99;
    }),
  );
  assert.throws(
    brokenCreatures((d) => {
      delete d.droneLaser.trailMetres;
    }),
  );
});

test("the five modules keep no tuning number and the baseline no longer lists them", () => {
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of FILES) {
    assert.equal(
      countNumberLiterals(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).count,
      baseline.numberLiterals[file] ?? 0, // the tightened gate (2, 3, 4, 10, 0.5, named constants count): the entry is the ratchet
      file,
    );
  }
});
