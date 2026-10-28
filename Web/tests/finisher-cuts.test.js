import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import CUT_MANIFEST from "../src/data/pitbornCutManifest.json" with { type: "json" };
import { validatePitbornCutManifest, validatePitbornCuts } from "../src/engine/game-data-pitborn-cuts.js";
import {
  createLateCuts,
  cutsEnabled,
  finisherSteps,
  manifestUnits,
  pickCutFinisher,
  planCut,
} from "../src/engine/finisher-cuts.js";

const CFG = GAME_DATA.pitbornCuts;
const fresh = () => ({ last: null, misses: 0, ordinal: 0 });
const clone = () => structuredClone(CFG);
const ALL = new Set(CFG.units);
const has = (set) => (u) => set.has(u);

test("the cut rows validate, and a bad row is refused", () => {
  assert.doesNotThrow(() => validatePitbornCuts(clone()));
  const unit = clone();
  unit.finishers.decapitation.unit = "tail";
  assert.throws(() => validatePitbornCuts(unit), /tail/);
  const twice = clone();
  twice.bindings[1].weapons.push("pistol");
  assert.throws(() => validatePitbornCuts(twice), /bound twice/);
  const colour = clone();
  colour.capTint.flesh = "red";
  assert.throws(() => validatePitbornCuts(colour), /hex/);
  const visual = clone();
  visual.finishers.opened.fallback = "belly_open";
  assert.throws(() => validatePitbornCuts(visual), /detaches/);
  const pool = clone();
  pool.bindings[0].pool[0].id = "burst";
  assert.throws(() => validatePitbornCuts(pool), /burst/);
});

test("the rows mirror Frankendom V3's six finishers and only name units of the cut contract", () => {
  assert.deepEqual(Object.keys(CFG.finishers).sort(), [
    "decapitation",
    "dismember",
    "hamstringCut",
    "opened",
    "runThrough",
    "splitCrown",
  ]);
  // the package's severable units: six that detach and two visual-only ones (physics docs/CUT-CONTRACT.md)
  assert.deepEqual([...CFG.units].sort(), [
    "arm_left",
    "arm_right",
    "belly_open",
    "head",
    "head_split",
    "leg_left",
    "leg_right",
    "torso_waist",
  ]);
  for (const b of CFG.bindings) for (const p of b.pool) assert.ok(CFG.finishers[p.id], p.id);
});

test("the pick is deterministic: the same victim, weapon and history roll the same finishers", () => {
  const run = () => {
    const st = fresh();
    return Array.from({ length: 20 }, (_, i) => pickCutFinisher({ weapon: "shotgun" }, `hunter-${i}`, st));
  };
  assert.deepEqual(run(), run());
});

test("a finisher never repeats back to back while the pool has another", () => {
  const st = fresh();
  let last = null;
  for (let i = 0; i < 200; i++) {
    const id = pickCutFinisher({ weapon: "knife" }, `h${i}`, st);
    if (id === null) continue;
    assert.notEqual(id, last);
    last = id;
  }
});

test("each weapon rolls only its own pool, and the pool is reachable", () => {
  for (const b of CFG.bindings)
    for (const weapon of b.weapons) {
      const seen = new Set(),
        st = fresh();
      for (let i = 0; i < 600; i++) {
        const id = pickCutFinisher({ weapon }, `v${i}`, st);
        if (id !== null) seen.add(id);
      }
      assert.ok([...seen].every((id) => b.pool.some((p) => p.id === id)), `${weapon} rolled outside its pool`);
      assert.deepEqual([...seen].sort(), b.pool.map((p) => p.id).sort(), `${weapon} never rolled one of its pool`);
    }
});

test("a weapon with no row (flame, bites, unknown) keeps its own death", () => {
  for (const weapon of ["flamethrower", "teeth", undefined]) assert.equal(pickCutFinisher({ weapon }, "h", fresh()), null);
  assert.equal(pickCutFinisher(undefined, "h", fresh()), null);
});

test("pity: with a zero chance the third kill still gets a finisher, and about nine in ten do at the shipped chance", () => {
  const zero = { ...clone(), chance: 0 },
    st = fresh(),
    rolls = Array.from({ length: 9 }, (_, i) => pickCutFinisher({ weapon: "pistol" }, `p${i}`, st, zero));
  assert.deepEqual(
    rolls.map((r) => r !== null),
    [false, false, true, false, false, true, false, false, true],
  );
  const st2 = fresh();
  let cut = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) if (pickCutFinisher({ weapon: "rifle" }, `r${i}`, st2) !== null) cut++;
  assert.ok(cut / n > 0.85 && cut / n <= 1, `${cut / n} of kills got a finisher`);
});

test("the steps: the unit at atS, then the also units alsoAtS later; a unit the body lacks is skipped or stood in for", () => {
  const dismember = CFG.finishers.dismember;
  assert.deepEqual(finisherSteps(dismember, has(ALL)), [
    { unit: "arm_right", atS: 0 },
    { unit: "arm_left", atS: dismember.alsoAtS },
    { unit: "leg_right", atS: dismember.alsoAtS },
  ]);
  const noVisual = new Set([...ALL].filter((u) => u !== "belly_open" && u !== "head_split"));
  assert.deepEqual(finisherSteps(CFG.finishers.opened, has(noVisual)), [{ unit: "torso_waist", atS: 0 }]); // the waist stands in
  assert.deepEqual(finisherSteps(CFG.finishers.runThrough, has(noVisual)), []); // the blade stays: no cut at all
  assert.deepEqual(finisherSteps(CFG.finishers.splitCrown, has(noVisual)), [{ unit: "head", atS: 0 }]); // plain head cut
  assert.deepEqual(finisherSteps(CFG.finishers.splitCrown, has(ALL)), [
    { unit: "head", atS: 0 },
    { unit: "head_split", atS: 0 },
  ]);
  assert.deepEqual(finisherSteps(CFG.finishers.hamstringCut, has(ALL)).map((s) => s.unit), ["leg_right", "leg_left"]);
});

test("the plan is null when the body carries none of the finisher's units", () => {
  const st = fresh(),
    forced = { ...clone(), chance: 1 };
  assert.equal(planCut({ weapon: "pistol" }, "x", () => false, st, forced), null);
  const plan = planCut({ weapon: "pistol" }, "y", has(ALL), fresh(), forced);
  assert.ok(plan && plan.steps.length >= 1 && forced.finishers[plan.id] === plan.row);
});

test("the manifest's units come from its regions, caps and optional cuts", () => {
  const manifest = {
    regions: [{ detached_by: "head" }, { detached_by: "arm_left" }, { detached_by: "head", separated_by: "head_split" }],
    caps: [{ shown_when_cut: "torso_waist" }],
    optional_units: { head_split: { enabled: true }, belly_open: { enabled: true } },
  };
  assert.deepEqual([...manifestUnits(manifest)].sort(), ["arm_left", "belly_open", "head", "head_split", "torso_waist"]);
  assert.equal(manifestUnits(undefined).size, 0);
  assert.equal(manifestUnits({ optional_units: { belly_open: { enabled: false } } }).size, 0);
});

test("late cuts come due in order and only once", () => {
  const late = createLateCuts();
  late.add("arm_left", 0.35);
  late.add("leg_right", 0.35);
  late.add("leg_left", 0.7);
  assert.deepEqual(late.tick(0.2), []);
  assert.deepEqual(late.tick(0.2), ["arm_left", "leg_right"]);
  assert.equal(late.pending, 1);
  assert.deepEqual(late.tick(0.5), ["leg_left"]);
  assert.deepEqual(late.tick(1), []);
});

test("the cut GLB is a deferred actor model pinned to the physics cut receipt, never loaded at start", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url))),
    row = manifest.models[CFG.cutModel],
    glb = readFileSync(new URL(`../public/assets/${row.url}`, import.meta.url)),
    hunter = manifest.models[CFG.rigRef];
  assert.equal(row.deferred, true); // area load and the idle preload never fetch it
  assert.equal(glb.length, row.bytes);
  assert.equal(createHash("sha256").update(glb).digest("hex"), row.sha256);
  assert.equal(row.sha256, "b677d29d085cdc27b8b54d87f6814b210d11099a045cfef456ae22946ab82377"); // physics #62 receipt
  assert.equal(row.provenance.sourceSHA256, hunter.sha256); // cut from the hunter body in the game, horn-free
});

test("the cut manifest is the physics contract's, for the hunter body, and the game's units all exist in it", () => {
  assert.doesNotThrow(() => validatePitbornCutManifest(CUT_MANIFEST));
  assert.deepEqual(GAME_DATA.pitbornCutManifest, CUT_MANIFEST); // the game reads the same file through the loader
  assert.throws(() => validatePitbornCutManifest({ ...CUT_MANIFEST, schema: "cut-pieces/2" }), /schema/);
  assert.equal(CUT_MANIFEST.schema, "cut-pieces/1");
  assert.equal(CUT_MANIFEST.body, "hunter-pitborn-106");
  assert.equal(CUT_MANIFEST.rig, "mixamo-106");
  assert.equal(CUT_MANIFEST.regions.length, 7);
  assert.equal(CUT_MANIFEST.caps.length, 12);
  const units = manifestUnits(CUT_MANIFEST);
  for (const u of ["head", "arm_left", "arm_right", "leg_left", "leg_right", "torso_waist"]) assert.ok(units.has(u), u);
  // this cut GLB was made without the optional visual cuts: the rows fall back (opened -> waist) or skip (run through)
  assert.equal(units.has("belly_open"), false);
  assert.equal(units.has("head_split"), false);
});

test("?cuts=0 turns the cuts off and nothing else does", () => {
  assert.equal(cutsEnabled(""), CFG.defaultOn);
  assert.equal(cutsEnabled(`?${CFG.flagParam}=${CFG.offValue}`), false);
  assert.equal(cutsEnabled("?physics=0"), CFG.defaultOn);
});
