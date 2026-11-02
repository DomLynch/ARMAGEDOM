// Forward-direction save check (alpha: saves survive an upgrade). The fixtures in fixtures/save-eras/ are real save
// records written by the frozen release builds (see helpers/record-save-era.mjs for the reason and the recipe).
// For every recorded case the CURRENT tree must: load it with runSaveInvalid false, hold the same state the old build
// held, and write a current-era record on its next save that itself restores to the same state.
// Needs no environment; the rollback direction lives in rollback-saves.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/rifle-fixture.js';
import {wolfFixture} from './helpers/wolf-fixture.js';
import {validateAreaMetadata} from '../src/engine/area-content.js';

const dir = new URL('./fixtures/save-eras/', import.meta.url);
const eras = fs.readdirSync(dir).filter(name => /^release-\d+\.json$/.test(name)).sort()
  .map(name => JSON.parse(fs.readFileSync(new URL(name, dir))));
const data = validateAreaMetadata(JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json', import.meta.url))), fixture().world.registry);
const bossWorld = Object.fromEntries(['bossEquipmentData', 'safehouseData', 'reaperData', 'markedData'].map(key => [key, data[key]]));
const json = value => JSON.parse(JSON.stringify(value));

// The fixture the recording was made in, built on the current tree, over the given records.
const build = {
  westminster: records => fixture({areaId: 'westminster', extraWorld: bossWorld, records}),
  bridge: records => fixture({records}),
  east: records => wolfFixture({records}),
};

function assertExpected(f, expected) {
  assert(!f.g.runSaveInvalid, 'current tree marked the recorded save invalid');
  assert.equal(f.g.player.hp, expected.hp);
  assert.deepEqual(json(f.g.progression), expected.progression);
  if (expected.bossEquipment !== undefined) assert.deepEqual(json(f.g.bossEquipment), expected.bossEquipment);
  if (expected.rifle !== undefined) assert.deepEqual(json(f.g.rifle), expected.rifle);
  assert.deepEqual(json(f.g.flameFuel), expected.flameFuel);
  if ('east8' in expected) {
    const wolf = f.g.enemies.find(e => e.placementKey === 'east-roamer-8');
    if (expected.east8 === null) assert(!wolf, 'dead East8 was revived');
    else {
      assert(wolf, 'alive East8 disappeared');
      assert.equal(wolf.hp, expected.east8.hp);
    }
  }
}

for (const era of eras)
  for (const c of era.cases)
    test('release ' + era.release + ' (' + era.sha.slice(0, 8) + ') save "' + c.name + '" loads in the current tree', () => {
      const f = build[c.world](new Map(c.records));
      f.restore();
      assertExpected(f, c.expected);

      // The next save writes the current-era record: same keys and versions as a fresh run writes, and it restores
      // to the state we changed (one hit point), with everything else as recorded.
      f.g.player.hp = Math.max(1, f.g.player.hp - 1);
      assert(f.p.persistRun(f.g), 'current tree could not save the loaded run');
      const fresh = build[c.world](new Map());
      fresh.restore();
      assert(fresh.p.persistRun(fresh.g));
      for (const [key, raw] of c.records) {
        const written = JSON.parse(f.records.get(key)), native = JSON.parse(fresh.records.get(key) ?? raw);
        assert.equal(written.version, native.version, key + ' version');
        assert.deepEqual(Object.keys(written).sort(), Object.keys(native).sort(), key + ' keys');
      }
      const cold = build[c.world](new Map(f.records));
      cold.restore();
      assertExpected(cold, {...c.expected, hp: f.g.player.hp});
    });

test('all recorded eras are present', () => {
  assert.deepEqual(eras.map(era => era.release), [222, 224, 225]);
});
