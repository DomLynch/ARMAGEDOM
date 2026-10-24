import test from "node:test";
import assert from "node:assert/strict";
import { areaPresenceRows, loadContent, ARRIVAL, PLAYER_RADIUS } from "../scripts/area-presence-rows.mjs";
import { walkArea, registry, inLink } from "../scripts/stuck-walk.mjs";
import { worldSpawnRows } from "../src/engine/world-events.js";

// The presence layer's per-area data, generated from the registered layouts: every point must be real ground.
const content = loadContent();
const rows = areaPresenceRows(content);
const walks = new Map(registry.ids.map((id) => [id, walkArea(id, { dead: false })]));
const metres = (p) => ({ x: p.x / 100, z: p.z / 100 });
const U16 = 65535;

test("one row per registered area, same order, area ids are strings the wire accepts", () => {
  assert.deepEqual(
    rows.map((r) => r.area),
    registry.ids,
  );
  for (const r of rows) assert.match(r.area, /^[a-z][a-z0-9-]{0,31}$/);
});

test("generation is deterministic", () => {
  assert.deepEqual(areaPresenceRows(content), rows);
});

for (const row of rows) {
  const { geo, inMain } = walks.get(row.area);
  test(`${row.area}: bounds enclose the road and fit u16 centimetres from the origin`, () => {
    const xs = row.road.map((p) => p.x),
      zs = row.road.map((p) => p.z);
    assert.deepEqual(row.bounds, {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    });
    assert.deepEqual(row.originCm, { x: row.bounds.minX, z: row.bounds.minZ });
    assert.ok(row.bounds.maxX - row.bounds.minX <= U16 && row.bounds.maxZ - row.bounds.minZ <= U16);
    assert.equal(row.playerRadiusCm, PLAYER_RADIUS * 100);
    assert.equal(row.blockers.length, geo.blockers.length);
  });

  test(`${row.area}: ${ARRIVAL.min} to ${ARRIVAL.max} arrival points, each walkable, clear, apart and off the exits`, () => {
    assert.ok(row.arrivals.length >= ARRIVAL.min && row.arrivals.length <= ARRIVAL.max, "arrival count");
    assert.equal(new Set(row.arrivals.map((a) => a.id)).size, row.arrivals.length);
    for (const a of row.arrivals) {
      assert.match(a.id, /^[a-z][a-z0-9-]{0,31}:a[1-4]$/);
      const p = metres(a);
      assert.ok(geo.clear(p, PLAYER_RADIUS), `${a.id} is clear at the player radius`);
      assert.ok(geo.clear(p, ARRIVAL.margin - 0.01), `${a.id} keeps its wall margin after rounding to centimetres`);
      assert.ok(inMain(p), `${a.id} is in the region the player can walk from the entry`);
      assert.ok(!registry.links(row.area).some((l) => inLink(l, geo.point(p))), `${a.id} is outside every exit zone`);
      assert.ok(a.from === null || registry.ids.includes(a.from));
    }
    for (let i = 0; i < row.arrivals.length; i++)
      for (let j = i + 1; j < row.arrivals.length; j++) {
        const gap = Math.hypot(row.arrivals[i].x - row.arrivals[j].x, row.arrivals[i].z - row.arrivals[j].z);
        assert.ok(
          gap >= ARRIVAL.spacing * 100 - 1,
          `${row.arrivals[i].id} and ${row.arrivals[j].id} are ${gap} cm apart`,
        );
      }
  });

  test(`${row.area}: exit zones match the registry links and enemy rows match worldSpawnRows`, () => {
    assert.deepEqual(
      row.exits.map((e) => e.to),
      registry.links(row.area).map((l) => l.to),
    );
    for (const e of row.exits) assert.equal(e.zone.length, 4);
    const expected = worldSpawnRows(content)
      .filter((s) => s.area === row.area)
      .map((s) => s.instance);
    assert.deepEqual(
      row.enemies.map((e) => e.instance),
      expected,
    );
    for (const e of row.enemies) {
      assert.ok(geo.clear(metres(e.home), 0), `${e.instance} home is inside the road and outside the blockers`);
      assert.ok(inMain(metres(e.home)), `${e.instance} home is walkable from the entry`);
    }
  });
}
