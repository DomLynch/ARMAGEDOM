import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FLAME_PILOT_PROFILE} from '../src/engine/flame-fuel-state.js';
import {validateFlameData} from '../src/engine/flame-data.js';
import {publicAreaRegistry as registry} from '../src/area-registry.js';

// The profile constant once said "area8" while area-content.json said "westminster". validateFlameData lets the JSON win,
// so the live game used "westminster" and the constant was a dead second copy. They must now agree.
const content = JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url)));

test('the flame profile constant names the same area as the area-content row', () => {
  assert.equal(FLAME_PILOT_PROFILE.areaId, content.flame.areaId);
  assert.equal(FLAME_PILOT_PROFILE.areaId, 'westminster');
});

test('the validated runtime flame data takes its area from the content row', () => {
  assert.equal(validateFlameData(content.flame, registry).areaId, content.flame.areaId);
  assert.equal(validateFlameData({...content.flame, areaId: 'east'}, registry).areaId, 'east');
});
