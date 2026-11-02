import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {remoteCostProblems} from '../src/engine/render-budget.js';
import {GAME_DATA, validateRenderBudget} from '../src/engine/game-data.js';

// The measured numbers from PR 115 (Mac M5, Westminster, 375x812@2): 0 remotes and 8 remotes.
const zero = {drawCalls: 97, triangles: 307303, remotes: 0};
const eight = {drawCalls: 151, triangles: 402981, remotes: 8};

test('the measured cost of 8 remotes is within the provisional budget', () => {
  assert.deepEqual(remoteCostProblems(zero, eight), []);
  assert.equal(GAME_DATA.renderBudget.provisional, true);
});

test('a remote that costs more than 8 draw calls or 15k triangles fails, whatever the totals', () => {
  assert.match(remoteCostProblems(zero, {...eight, drawCalls: 97 + 8 * 8 + 1})[0], /draw calls, budget 8/);
  assert.match(remoteCostProblems(zero, {...eight, triangles: 307303 + 8 * 15000 + 8})[0], /triangles, budget 15000/);
  // Two remotes that are too dear are still caught even though the scene is nowhere near the total budget.
  assert.equal(remoteCostProblems(zero, {drawCalls: 97 + 2 * 9, triangles: 307303, remotes: 2}).length, 1);
});

test('the scene total is judged at the budget remote count, so a cheap scene with dear remotes cannot hide', () => {
  const heavyScene = {drawCalls: 185, triangles: 307303, remotes: 0};
  const problems = remoteCostProblems(heavyScene, {...heavyScene, drawCalls: 185 + 8 * 4, remotes: 8});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /217 draw calls with 8 remotes, budget 200/);
  assert.match(remoteCostProblems({...zero, triangles: 460000}, {...eight, triangles: 460000 + 8 * 6000})[0], /508000 triangles/);
});

test('a measurement that is not usable fails loudly instead of passing', () => {
  assert.match(remoteCostProblems(undefined, eight)[0], /needs a measurement/);
  assert.match(remoteCostProblems(eight, eight)[0], /needs a measurement/);
  assert.match(remoteCostProblems(zero, {...zero})[0], /no remote players/);
});

test('the loader validates renderBudget.json', () => {
  const file = JSON.parse(fs.readFileSync(new URL('../src/data/renderBudget.json', import.meta.url)));
  const broken = mutate => {
    const d = structuredClone(file);
    mutate(d);
    return () => validateRenderBudget(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken(d => { d.extra = 1; }));
  assert.throws(broken(d => { delete d.perRemote; }));
  assert.throws(broken(d => { d.westminster.maxDrawCalls = 0; }));
  assert.throws(broken(d => { d.perRemote.maxTriangles = -1; }));
  assert.throws(broken(d => { d.provisional = 'yes'; }));
});
