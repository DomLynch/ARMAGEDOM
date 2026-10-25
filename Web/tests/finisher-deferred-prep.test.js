import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createFinisherPresentation } from "../src/finisher-presentation.js";
import { createFinisherPrepPump } from "../src/engine/finisher-prep-pump.js";
import { selectFinisher } from "../src/finisher-selection.js";
import { FINISHER_DATA, finisherDefinition } from "../src/engine/finisher-data.js";

const config = FINISHER_DATA.preparation.deferred;

// A virtual clock; each step of a fake preparation costs `stepMs`.
function rig({ residents, stepMs = 0.5, steps = 40 }) {
  const clock = { t: 10_000 };
  const log = { steps: [], aborted: [], failed: [], settled: [] };
  const candidates = residents.map((r, i) => {
    const state = { done: false, started: 0 };
    return {
      key: r.name,
      entity: r.entity,
      isPrepared: () => state.done,
      start() {
        state.started++;
        return (function* () {
          try {
            for (let n = 0; n < steps; n++) {
              clock.t += stepMs;
              log.steps.push({ who: r.name, at: clock.t });
              if (r.failAt === n) throw Error("boom");
              yield "step";
            }
            state.done = true;
          } finally {
            if (!state.done) log.aborted.push(r.name);
          }
        })();
      },
      around: (run) => run(),
      settle: () => log.settled.push(r.name),
      fail: () => {
        state.done = true;
        log.failed.push(r.name);
      },
      state,
    };
  });
  const pump = createFinisherPrepPump({ config, now: () => clock.t });
  return { clock, log, candidates, pump };
}
const resident = (name, x, extra = {}) => ({ name, entity: { hp: 50, alerted: false, pos: { x, z: 0 }, ...extra } });

test("nothing is prepared in the first second after arrival", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3)] });
  pump.enter();
  for (let i = 0; i < 40; i++) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  const first = log.steps[0]?.at ?? Infinity;
  assert.ok(first >= 10_000 + config.startDelayMs, `first step at +${first - 10_000} ms`);
});

test("a slice never runs past the slice budget by more than one step", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3)], stepMs: 0.7 });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  const span = log.steps.at(-1).at - (log.steps[0].at - 0.7);
  assert.ok(span <= config.sliceMs + 0.7 + 1e-9, `one slice spanned ${span.toFixed(2)} ms`);
  assert.ok(log.steps.length >= 2 && log.steps.length < 40, "work is spread over frames, not done at once");
});

test("a long frame backs the pump off for the configured time", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3)] });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  const before = log.steps.length;
  // A frame longer than the back-off threshold.
  clock.t += config.backoffFrameMs + 5;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.equal(log.steps.length, before, "no work on the long frame");
  const resumeAt = clock.t + config.backoffMs;
  while (clock.t < resumeAt - 20) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  assert.equal(log.steps.length, before, "quiet for the whole back-off");
  clock.t = resumeAt + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.ok(log.steps.length > before, "resumes afterwards");
  assert.equal(pump.stats().backoffs, 1);
});

test("during a fight only the closest alerted resident is prepared; the rest wait until it is over plus a second", () => {
  const { clock, log, candidates, pump } = rig({
    residents: [
      resident("near", 2),
      resident("far", 30),
      resident("hostile", 20, { alerted: true }),
      resident("hostile-far", 25, { alerted: true }),
    ],
    steps: 4,
  });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  for (let i = 0; i < 60; i++) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  assert.deepEqual([...new Set(log.steps.map((s) => s.who))], ["hostile"], "only the closest alerted one");
  // The fight ends: nothing for quietAfterFightMs, then the nearest first.
  for (const c of candidates) c.entity.alerted = false;
  const ended = clock.t,
    seen = log.steps.length;
  while (clock.t < ended + config.quietAfterFightMs - 40) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  assert.equal(log.steps.length, seen, "quiet after the fight");
  for (let i = 0; i < 200 && log.steps.length < seen + 16; i++) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  assert.deepEqual([...new Set(log.steps.slice(seen).map((s) => s.who))].slice(0, 2), ["near", "hostile-far"]);
});

test("a fight slice is shorter, and a step is skipped after a frame over the skip limit", () => {
  const { clock, log, candidates, pump } = rig({
    residents: [resident("a", 3, { alerted: true })],
    stepMs: 0.4,
  });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  const span = log.steps.at(-1).at - (log.steps[0].at - 0.4);
  assert.ok(span <= config.fightSliceMs + 0.4 + 1e-9, `fight slice spanned ${span.toFixed(2)} ms`);
  assert.ok(config.fightSliceMs < config.sliceMs);
  const before = log.steps.length;
  clock.t += config.fightSkipFrameMs + 2;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.equal(log.steps.length, before, "skipped after a long frame");
  clock.t += 16;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.ok(log.steps.length > before, "works again on a normal frame");
});

test("a resident that dies mid-preparation stops stepping but keeps what it finished", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3)], stepMs: 1, steps: 40 });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.ok(log.steps.length > 0 && !candidates[0].state.done);
  candidates[0].entity.hp = 0;
  clock.t += 16;
  const seen = log.steps.length;
  pump.pump(candidates, { x: 0, z: 0 });
  assert.deepEqual(log.settled, ["a"], "told to keep its pieces");
  assert.equal(log.steps.length, seen);
  assert.equal(pump.stats().running, 0);
});

test("a resident that leaves mid-preparation is dropped without settling", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3)], stepMs: 1, steps: 40 });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  pump.pump(candidates, { x: 0, z: 0 });
  clock.t += 16;
  pump.pump([], { x: 0, z: 0 });
  assert.deepEqual(log.aborted, ["a"]);
  assert.deepEqual(log.settled, []);
  assert.equal(pump.stats().running, 0);
});

test("a failing preparation is reported once and never retried", () => {
  const { clock, log, candidates, pump } = rig({ residents: [resident("a", 3, {})].map((r) => ({ ...r, failAt: 2 })) });
  pump.enter();
  clock.t += config.startDelayMs + 1;
  for (let i = 0; i < 30; i++) {
    clock.t += 16;
    pump.pump(candidates, { x: 0, z: 0 });
  }
  assert.deepEqual(log.failed, ["a"]);
  assert.equal(candidates[0].state.started, 1);
});

// --- the presentation: kill before preparation is done ---
const clips = [
  new T.AnimationClip("Death", 2.4, []),
  new T.AnimationClip("Hit", 1 / 3, []),
  new T.AnimationClip("Death_SplitCrown", 1, []),
];
function headFixture() {
  const scene = new T.Scene(),
    root = new T.Group(),
    model = new T.Group(),
    bone = new T.Bone();
  bone.name = "Head";
  bone.position.y = 1.7;
  model.add(bone);
  root.add(model);
  scene.add(root);
  const geometry = new T.CylinderGeometry(0.08, 0.08, 0.3, 12);
  geometry.translate(0, 1.7, 0);
  const count = geometry.attributes.position.count,
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  const material = new T.MeshStandardMaterial({ map: new T.Texture(), color: 0x805a3a }),
    skeleton = new T.Skeleton([bone]);
  for (const name of ["Photo", "PhotoEyes", "PhotoTeeth"]) {
    const mesh = new T.SkinnedMesh(geometry, material);
    mesh.name = name;
    model.add(mesh);
    mesh.bind(skeleton);
  }
  const neck = new T.Group();
  neck.name = "Recovered_donor_lower_neck";
  model.add(neck);
  return { scene, root, model };
}
const pistolKill = (support, victimId = 7) =>
  selectFinisher(
    {
      victimId,
      lethal: true,
      weapon: "pistol",
      impactDirection: { x: 1, z: 0 },
      nativeDeath: { clip: "Death", seconds: 2.4 },
    },
    { support, budget: 2, ordinal: 1 },
  );

test("a kill before preparation is done falls back to a plain death and never builds anything on the spot", () => {
  const f = headFixture(),
    p = createFinisherPresentation({ ...f, clips, isBlocked: () => false, deferPreparation: true });
  assert.equal(p.isPrepared(), false);
  assert.ok(!p.support.some((s) => ["pistol-decapitation", "decapitation", "split-crown", "opened"].includes(s.id)));
  const outcome = pistolKill(p.support);
  // Whatever the sim picks from what is prepared, the presentation plays a complete ordinary death.
  const recipe = p.start({ ...outcome, direction: { x: 1, z: 0 } });
  assert.deepEqual(recipe.parts, [], `played ${recipe.id}, which detaches nothing`);
  assert.equal(recipe.cost, 0);
  assert.equal(p.stats().detached, false);
  assert.ok(Number.isFinite(p.pose(0.5).phase));
  assert.equal(p.stats().ownedGeometries, 0, "no geometry was built for the kill");
  p.dispose();
});

test("a kill mid-preparation keeps the finished pieces: the recipe the sim picked still plays", () => {
  const f = headFixture(),
    p = createFinisherPresentation({
      ...f,
      clips,
      isBlocked: () => false,
      deferPreparation: true,
      prepareCrown: true,
    }),
    steps = p.prepare();
  // The head is done (its recipes are offered) while the crown is still being cut.
  let done = false;
  while (!p.support.some((s) => s.id === "pistol-decapitation") && !(done = steps.next().done));
  assert.ok(!done && !p.support.some((s) => s.id === "split-crown"), "killed between the head and the crown");
  const sim = p.support.find((s) => s.id === "pistol-decapitation");
  // The resident dies now: the pump settles the preparation, then stops stepping.
  p.settle();
  steps.return();
  assert.equal(p.isPrepared(), false);
  assert.ok(p.support.includes(sim), "recipe still offered");
  assert.ok(!p.support.some((s) => s.id === "split-crown"), "the crown in progress is dropped");
  assert.ok(p.stats().ownedGeometries > 0, "the head was not released");
  const recipe = p.start({
    recipeId: sim.id,
    damageType: finisherDefinition(sim.id).damageType,
    direction: { x: 1, z: 0 },
  });
  assert.equal(recipe.id, "pistol-decapitation");
  assert.deepEqual(recipe.parts, ["head"]);
  assert.deepEqual([...p.prepare()], [], "never prepares again once settled");
  p.dispose();
  assert.equal(p.stats().ownedGeometries, 0, "released with the view");
});

test("preparing later adds the recipes, and the same array the sim holds sees them", () => {
  const f = headFixture(),
    p = createFinisherPresentation({ ...f, clips, isBlocked: () => false, deferPreparation: true }),
    held = p.support;
  for (const _ of p.prepare());
  assert.equal(p.isPrepared(), true);
  assert.equal(p.support, held, "same array reference");
  assert.ok(held.some((s) => s.id === "pistol-decapitation"));
  const outcome = pistolKill(held);
  assert.ok(outcome);
  p.dispose();
});

test("preparing late gives the same recipes as preparing up front", () => {
  const eager = createFinisherPresentation({ ...headFixture(), clips, isBlocked: () => false });
  const late = createFinisherPresentation({ ...headFixture(), clips, isBlocked: () => false, deferPreparation: true });
  for (const _ of late.prepare());
  const ids = (p) => p.support.map((s) => s.id).sort();
  assert.deepEqual(ids(late), ids(eager));
  assert.equal(late.stats().vertices, eager.stats().vertices);
  assert.equal(finisherDefinition("pistol-decapitation").damageType, "bullet");
  eager.dispose();
  late.dispose();
});

test("preparing twice, or after dispose, builds nothing more", () => {
  const f = headFixture(),
    p = createFinisherPresentation({ ...f, clips, isBlocked: () => false, deferPreparation: true });
  for (const _ of p.prepare());
  const geometries = p.stats().ownedGeometries;
  assert.ok(geometries > 0);
  assert.equal(p.prepare().next().done, true, "already prepared: nothing to do");
  assert.equal(p.stats().ownedGeometries, geometries);
  p.dispose();
  assert.equal(p.prepare().next().done, true, "disposed: nothing to do");
  assert.equal(p.stats().ownedGeometries, 0);
});
