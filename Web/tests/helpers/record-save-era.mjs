// Records real save records written by a FROZEN release build, for the forward-direction replay in
// tests/save-eras-forward.test.js. Run it once per release with the frozen checkout as the first argument; the
// output is committed as tests/fixtures/save-eras/release-<N>.json and is not regenerated without a written reason.
//   node tests/helpers/record-save-era.mjs <frozen-root> <release> <git-sha> <out.json> [--fallback]
// --fallback adds the unplaceable-drop cases; only builds that contain the boss-drop save fix (223 and later) can write them.
// Everything here runs the FROZEN code (its helpers, fixtures, persistence); nothing imports the current tree.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const [root, release, sha, outFile, ...flags] = process.argv.slice(2);
assert(root && release && sha && outFile, 'usage: record-save-era.mjs <frozen-root> <release> <git-sha> <out.json> [--fallback]');
const withFallback = flags.includes('--fallback');
const url = p => pathToFileURL(root + '/' + p);
const read = p => JSON.parse(fs.readFileSync(url('Web/public/' + p)));
const {fixture} = await import(url('Web/tests/helpers/rifle-fixture.js'));
const {wolfFixture} = await import(url('Web/tests/helpers/wolf-fixture.js'));
const {createAreaRegistry} = await import(url('Web/src/area-registry.js'));
const {validateAreaMetadata} = await import(url('Web/src/engine/area-content.js'));
const {stageProgressionDeath} = await import(url('Web/src/engine/progression-runtime.js'));
const {issueSupply} = await import(url('Web/src/supplies.js'));

const RUN_KEY = 'armagedom:marked-run:v18';
const registry = createAreaRegistry({manifest: read('world/manifest.json')});
const data = validateAreaMetadata(read('world/area-content.json'), registry);
const bossWorld = Object.fromEntries(['bossEquipmentData', 'safehouseData', 'reaperData', 'markedData'].map(k => [k, data[k]]));
const json = value => JSON.parse(JSON.stringify(value));

function killBoss(f, field) {
  const g = f.g, e = g.enemies.find(e => e.placementKey === data.bossEquipmentData[field].source.placementKey);
  assert(e, field);
  e.hp = 0;
  g.supplies = issueSupply(g.supplies, {areaId: f.world.areaId, placementKey: e.placementKey, position: e.pos, hp: 0, rules: g.lootRules, cycle: g.animalCycle}).state;
  stageProgressionDeath(g, e, 'knife', e.maxHP);
  g.corpses.push(e);
  return e;
}
function wall(f, e, radius) {
  const clear = f.world.geometry.clear.bind(f.world.geometry);
  f.world.geometry.clear = (p, r) => Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > radius && clear(p, r);
}
function expected(f, extra = {}) {
  const g = f.g, stored = f.records.get(RUN_KEY);
  return json({
    hp: g.player.hp,
    progression: g.progression,
    ...(g.bossEquipment !== undefined && {bossEquipment: g.bossEquipment}),
    ...(g.rifle !== undefined && {rifle: g.rifle}),
    flameFuel: stored ? JSON.parse(stored).flameFuel : g.flameFuel,
    ...extra,
  });
}
const record = (name, world, f, extra) => ({name, world, records: [...f.records.entries()], expected: expected(f, extra)});
const cases = [];

// world "westminster": bossWorld data on the Westminster layout. world "bridge": the plain rifle fixture. world "east": wolf fixture.
const westminster = () => { const f = fixture({areaId: 'westminster', extraWorld: bossWorld}); f.restore(); return f; };

{
  const f = westminster();
  f.g.player.hp = Math.max(1, f.g.player.hp - 17);
  assert(f.p.persistRun(f.g));
  cases.push(record('ordinary', 'westminster', f));
}
for (const [name, radius] of [['boss-drop-pending', 0], ...(withFallback ? [['boss-drop-pending-fallback', 1.2]] : [])]) {
  const f = westminster(), e = killBoss(f, 'emberProjector');
  if (radius) wall(f, e, radius);
  assert(f.p.persistRun(f.g), name);
  assert.equal(f.g.bossEquipment.emberProjector.status, 'pending');
  if (radius) assert(Math.hypot(f.g.bossEquipment.emberProjector.dropPosition.x - e.pos.x, f.g.bossEquipment.emberProjector.dropPosition.z - e.pos.z) > radius);
  cases.push(record(name, 'westminster', f));
}
for (const [name, radius] of [['rifle-drop-pending', 0], ...(withFallback ? [['rifle-drop-pending-fallback', 1.2]] : [])]) {
  const f = fixture();
  f.restore();
  const warden = f.g.enemies.find(e => e.placementKey === 'boss-warden-v1');
  if (radius) wall(f, warden, radius);
  assert(f.kill(), name);
  assert.equal(f.g.rifle.status, 'pending');
  cases.push(record(name, 'bridge', f));
}
for (const dead of [false, true]) {
  const f = wolfFixture({records: new Map()});
  f.restore();
  const e = f.g.enemies.find(e => e.placementKey === 'east-roamer-8');
  assert(e);
  if (dead) {
    e.hp = 0;
    f.g.supplies = issueSupply(f.g.supplies, {areaId: 'east', placementKey: e.placementKey, position: e.pos, hp: 0, rules: f.g.lootRules, cycle: f.g.animalCycle}).state;
    stageProgressionDeath(f.g, e, 'knife', 40);
    f.g.corpses.push(e);
  }
  assert(f.p.persistRun(f.g));
  cases.push(record(dead ? 'east8-dead' : 'east8-alive', 'east', f, {east8: dead ? null : {hp: e.hp}}));
}
for (const [name, ticks] of [['flame-partly-spent', 100], ['flame-empty', 6200]]) {
  const f = westminster();
  killBoss(f, 'emberProjector');
  assert(f.p.persistRun(f.g));
  const itemId = data.bossEquipmentData.emberProjector.itemId;
  f.g.player.pos = {...f.g.bossEquipment.emberProjector.dropPosition};
  assert(f.p.dispatchBossEquipment(f.g, {type: 'claimPickup', pickupId: itemId}, true).ok);
  assert(f.p.dispatchBossEquipment(f.g, {type: 'equip', itemId, equipped: true}, true).ok);
  for (let i = 0; i < ticks; i++) {
    f.g.tick++;
    f.g.time += 1 / 60;
    assert(f.p.dispatchFlame(f.g, {type: 'save'}, {seconds: 1 / 60, active: true}, true).ok);
  }
  cases.push(record(name, 'westminster', f));
}

fs.mkdirSync(new URL('.', pathToFileURL(outFile)), {recursive: true});
fs.writeFileSync(outFile, JSON.stringify({
  release: Number(release),
  sha,
  reason: 'Recorded once from the frozen release build so the current tree can be shown to load real saves written by it (alpha: saves survive an upgrade). Do not regenerate without a written reason.',
  cases,
}, null, 1) + '\n');
console.log('recorded', cases.map(c => c.name).join(', '), '->', outFile);
