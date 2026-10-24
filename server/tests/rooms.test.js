import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadAreas } from "../areas.js";
import { createShards } from "../rooms.js";
import { decodeDown } from "../wire.js";

const rules = JSON.parse(fs.readFileSync(new URL("../rules.json", import.meta.url), "utf8"));
const areas = await loadAreas();
const make = () => {
  const events = [];
  const shards = createShards({ areas, rules, emit: (player, message) => events.push([player.sessionId, message]) });
  return { shards, events };
};
const join = (shards, n, areaId = "westminster", t = 0) => shards.join({ sessionId: "s" + n, areaId, name: "P" + n }, t);

test("area ids and spawns come from the game's registry rows", () => {
  assert.deepEqual([...areas.spawns.keys()], [...areas.registry.ids]);
  assert(areas.registry.ids.includes("westminster") && areas.registry.ids.includes("central-hub"));
  const { shards } = make();
  const a = join(shards, 1);
  assert.deepEqual({ x: a.view.x, z: a.view.z }, areas.spawns.get("westminster"));
});

test("four players share a shard; the fifth opens shard 2; a freed seat is filled first", () => {
  const { shards } = make();
  const seats = [1, 2, 3, 4, 5].map((n) => join(shards, n));
  assert(seats.every((s) => s.ok));
  assert.deepEqual(seats.slice(0, 4).map((s) => [s.view.shard, s.view.id]), [[1, 1], [1, 2], [1, 3], [1, 4]]);
  assert.deepEqual([seats[4].view.shard, seats[4].view.id], [2, 1]);
  assert.equal(seats[4].view.players.length, 0);
  shards.leave(seats[1].player);
  const sixth = join(shards, 6);
  assert.deepEqual([sixth.view.shard, sixth.view.id], [1, 2], "fill the lowest shard with a free seat first");
  assert.deepEqual(shards.snapshot().map((r) => [r.areaId, r.shardId, r.players.length]), [["westminster", 1, 4], ["westminster", 2, 1]]);
});

test("shards are per area, and an emptied shard disappears", () => {
  const { shards } = make();
  const a = join(shards, 1, "westminster"),
    b = join(shards, 2, "central-hub");
  assert.deepEqual([a.view.shard, b.view.shard], [1, 1]);
  shards.leave(a.player);
  assert.deepEqual(shards.snapshot().map((r) => r.areaId), ["central-hub"]);
});

test("join and leave tell the others, with the newcomer's spawn", () => {
  const { shards, events } = make();
  const a = join(shards, 1),
    b = join(shards, 2);
  assert.deepEqual(b.view.players.map((p) => p.id), [1]);
  assert.deepEqual(events.map(([to, m]) => [to, m.t, m.id]), [["s1", "enter", 2]]);
  shards.leave(b.player, "disconnected");
  assert.deepEqual(events.at(-1), ["s1", { t: "leave", id: 2, why: "disconnected" }]);
  assert(a.ok);
});

test("unknown areas, double joins and bad names are handled", () => {
  const { shards } = make();
  assert.equal(join(shards, 1, "atlantis").code, "unknown-area");
  assert(join(shards, 2).ok);
  assert.equal(join(shards, 2).code, "already-joined");
  const named = shards.join({ sessionId: "x", areaId: "westminster", name: "  <b>\u0007Zed</b>" + "y".repeat(80) }, 0);
  assert(named.player.name.length <= rules.maxNameLength && !/[<>\u0007]/.test(named.player.name));
  assert.equal(shards.join({ sessionId: "y", areaId: "westminster", name: 42 }, 0).player.name, "Survivor");
});

test("travel follows the registry's own links and lands at the target's spawn", () => {
  const { shards, events } = make();
  const a = join(shards, 1, "westminster"),
    other = join(shards, 2, "westminster");
  const target = areas.registry.links("westminster")[0].to;
  const unlinked = areas.registry.ids.find((id) => id !== "westminster" && !areas.registry.links("westminster").some((l) => l.to === id));
  assert.equal(shards.travel(a.player, unlinked, 0).code, "no-link");
  assert.equal(shards.travel(a.player, "atlantis", 0).code, "unknown-area");
  const moved = shards.travel(a.player, target, 10);
  assert(moved.ok);
  assert.deepEqual([moved.view.area, moved.view.shard], [target, 1]);
  assert.deepEqual({ x: moved.view.x, z: moved.view.z }, areas.spawns.get(target));
  assert.deepEqual(events.at(-1), ["s2", { t: "leave", id: 1, why: "travel" }]);
  assert.equal(other.player.room.players.size, 1);
});

test("movement: normal steps are taken, a teleport is snapped back, non-finite and out-of-range poses are dropped", () => {
  const { shards } = make();
  const { player } = join(shards, 1, "westminster", 0);
  const start = { x: player.x, z: player.z };
  const step = (x, z, t, seq) => shards.pose(player, { seq, x, z, heading: 7, anim: 1, flags: 2 }, t);
  assert.equal(step(start.x + 0.4, start.z, 66, 1), "ok");
  assert.deepEqual([player.x, player.heading, player.anim, player.flags, player.seq], [start.x + 0.4, 7, 1, 2, 1]);
  assert.equal(step(start.x + 400, start.z, 132, 2), "snapped");
  assert.equal(player.x, start.x + 0.4, "the server's position stands");
  assert.equal(player.seq, 2, "the ack still advances so the client can time the round trip");
  assert.equal(step(5000, 0, 200, 3), "drop");
  assert.equal(shards.stats().snapped, 1);
});

test("a tick carries every room-mate to every player, with each player's own ack", () => {
  const { shards } = make();
  const a = join(shards, 1),
    b = join(shards, 2),
    c = join(shards, 3, "central-hub");
  shards.pose(a.player, { seq: 41, x: a.player.x + 0.1, z: a.player.z, heading: 0, anim: 0, flags: 0 }, 66);
  shards.pose(b.player, { seq: 77, x: b.player.x, z: b.player.z + 0.1, heading: 0, anim: 0, flags: 0 }, 66);
  const packets = shards.tick(9);
  const forA = decodeDown(packets.get(a.player)),
    forC = decodeDown(packets.get(c.player));
  assert.deepEqual([forA.tick, forA.ack, forA.entities.map((e) => e.id)], [9, 41, [1, 2]]);
  assert.equal(decodeDown(packets.get(b.player)).ack, 77);
  assert.deepEqual(forC.entities.map((e) => e.id), [1], "other areas are separate rooms");
});
