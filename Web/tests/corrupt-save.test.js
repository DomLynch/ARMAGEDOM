// What a player gets when the stored run record is unreadable (truncated, garbage, wrong shape).
// The run is flagged invalid with the on-screen message and ordinary saves are refused, so the bad record is not
// overwritten behind the player's back. In the live game (Westminster, an expedition world) Retry is refused while
// the save is invalid (the Retry / Try again buttons are disabled in the HUD); the way out is the menu's "Reset game",
// which is core `reset` (resetRun). The recovered run must be valid, save, and restore in a cold start.
// (Worlds without expedition data take a different message and Retry path; the live game has none, so they are not tested.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';

const data = validateAreaMetadata(JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url))), fixture().world.registry);
const bossWorld = Object.fromEntries(['bossEquipmentData', 'safehouseData', 'reaperData', 'markedData'].map(key => [key, data[key]]));

const worlds = [
  {
    name: 'Westminster (expedition)',
    make: records => fixture({areaId: 'westminster', extraWorld: bossWorld, records}),
    message: /Saved run could not be read\. Open the menu and choose Reset game to start fresh\./,
    retryRefused: true,
    recover: f => f.p.resetRun().ok,
  },
];

for (const world of worlds) {
  // A genuine record from a played run, and the key it lives under.
  const played = world.make(new Map());
  played.restore();
  played.g.player.hp = Math.max(1, played.g.player.hp - 17);
  assert(played.p.persistRun(played.g));
  const [[key, good]] = [...played.records.entries()];
  const parsed = JSON.parse(good);
  const bad = {
    'truncated JSON': good.slice(0, Math.floor(good.length / 2)),
    'truncated at the last byte': good.slice(0, -1),
    'garbage text': 'not a save at all',
    'empty object': '{}',
    'array': '[]',
    'valid JSON, wrong version': JSON.stringify({...parsed, version: 99}),
    'valid JSON, missing field': JSON.stringify(Object.fromEntries(Object.entries(parsed).filter(([k]) => k !== 'progression'))),
  };

  for (const [name, raw] of Object.entries(bad))
    test(world.name + ': unreadable record (' + name + ') flags the run, shows the message, and the player can recover', () => {
      const records = new Map([[key, raw]]);
      const f = world.make(records);
      f.restore();
      assert.equal(f.g.runSaveInvalid, true);
      assert.equal(f.g.finished, true);
      assert.equal(f.g.player.hp, 0);
      assert.match(f.g.message, world.message);
      assert(f.g.messageUntil > f.g.time, 'message is on screen');

      // Ordinary saves must not overwrite the unreadable record.
      assert.equal(f.p.persistRun(f.g), false);
      assert.equal(records.get(key), raw);

      // Retry is refused where the expedition owns recovery; the unreadable record is still untouched.
      if (world.retryRefused) {
        assert.equal(f.p.retry(), false);
        assert.equal(records.get(key), raw);
        assert.equal(f.g.runSaveInvalid, true);
      }

      // The recovery path gives a working fresh run that saves, and what it saved restores in a cold start.
      assert.equal(world.recover(f), true);
      assert(!f.g.runSaveInvalid, 'fresh run is valid');
      assert(f.g.player.hp > 0 && !f.g.finished);
      assert.equal(f.p.persistRun(f.g), true);
      assert.notEqual(records.get(key), raw);
      const cold = world.make(new Map(records));
      cold.restore();
      assert(!cold.g.runSaveInvalid);
      assert.equal(cold.g.player.hp, f.g.player.hp);
    });

  test(world.name + ': a missing record is a normal first run, not an invalid save', () => {
    const f = world.make(new Map());
    f.restore();
    assert(!f.g.runSaveInvalid);
    assert(f.g.player.hp > 0 && !f.g.finished);
    assert(f.p.persistRun(f.g));
  });
}
