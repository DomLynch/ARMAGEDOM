import test from "node:test";
import assert from "node:assert/strict";
import { createRemotePlayers, INTERP_DELAY_MS, KEEP_MS } from "../src/engine/remote-players.js";

const state = (players) => ({ t: "state", tick: 1, players });

test("a player is drawn between the two snapshots around the render time, 150 ms in the past", () => {
  const remote = createRemotePlayers();
  remote.apply(state([{ id: 5, x: 0, z: 0 }]), 1000);
  remote.apply(state([{ id: 5, x: 100, z: 200 }]), 1100);
  const mid = remote.sample(1050 + INTERP_DELAY_MS)[0];
  assert.equal(mid.id, 5);
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9 && Math.abs(mid.z - 1) < 1e-9, "halfway, in metres");
  const end = remote.sample(1100 + INTERP_DELAY_MS)[0];
  assert.ok(Math.abs(end.x - 1) < 1e-9 && Math.abs(end.z - 2) < 1e-9);
});

test("with no newer snapshot the player holds the last position instead of extrapolating", () => {
  const remote = createRemotePlayers();
  remote.apply(state([{ id: 5, x: 0, z: 0 }]), 1000);
  remote.apply(state([{ id: 5, x: 100, z: 0 }]), 1100);
  const late = remote.sample(5000)[0];
  assert.equal(late.x, 1);
  assert.equal(late.moving, false);
});

test("my own id is never drawn; players who left the layer disappear", () => {
  const remote = createRemotePlayers({ selfId: () => 7 });
  remote.apply(state([{ id: 7, x: 0, z: 0 }, { id: 8, x: 100, z: 100 }]), 1000);
  assert.deepEqual(remote.sample(2000).map((p) => p.id), [8]);
  remote.apply(state([{ id: 7, x: 0, z: 0 }]), 1100);
  assert.deepEqual(remote.sample(2000), []);
  assert.equal(remote.size, 0);
});

test("facing follows the direction of travel and moving reflects the speed", () => {
  const remote = createRemotePlayers();
  remote.apply(state([{ id: 5, x: 0, z: 0 }]), 1000);
  remote.apply(state([{ id: 5, x: 100, z: 0 }]), 1100); // 1 m in 0.1 s: running along +x
  const p = remote.sample(1050 + INTERP_DELAY_MS)[0];
  assert.ok(Math.abs(p.facing - Math.PI / 2) < 1e-9);
  assert.equal(p.moving, true);
  remote.apply(state([{ id: 5, x: 100, z: 0 }]), 1200); // stopped: keeps its facing
  const rest = remote.sample(1200 + INTERP_DELAY_MS)[0];
  assert.equal(rest.moving, false);
  assert.ok(Math.abs(rest.facing - Math.PI / 2) < 1e-9);
});

test("facing is the local player's heading for the same direction of travel (north, south, east, west)", () => {
  const localYaw = (fx, fz) => Math.atan2(fx, -fz); // actors.js: the local player's render yaw from its game-space facing
  for (const [name, dx, dz] of [["north", 0, -100], ["south", 0, 100], ["east", 100, 0], ["west", -100, 0]]) {
    const remote = createRemotePlayers();
    remote.apply(state([{ id: 5, x: 0, z: 0 }]), 1000);
    remote.apply(state([{ id: 5, x: dx, z: dz }]), 1100);
    const p = remote.sample(1050 + INTERP_DELAY_MS)[0];
    assert.ok(Math.abs(Math.cos(p.facing - localYaw(dx, dz)) - 1) < 1e-9, `${name} matches the local player`);
  }
});

test("a new area clears everyone at once, and old snapshots are trimmed", () => {
  const remote = createRemotePlayers();
  for (let at = 0; at <= 5000; at += 100) remote.apply(state([{ id: 5, x: at, z: 0 }]), at);
  assert.ok(remote.sample(5000)[0].x > 0);
  remote.clear();
  assert.equal(remote.size, 0);
  // The track never keeps more than KEEP_MS of history (plus the newest two points).
  const trimmed = createRemotePlayers();
  for (let at = 0; at <= 5000; at += 100) trimmed.apply(state([{ id: 5, x: at, z: 0 }]), at);
  assert.ok(trimmed.sample(0)[0].x >= (5000 - KEEP_MS - 100) / 100 - 1e-9, "the oldest points are gone");
});

test("malformed rows are ignored", () => {
  const remote = createRemotePlayers();
  remote.apply(state([{ id: "x", x: 1, z: 1 }, { id: 3, x: NaN, z: 1 }, { id: 4, x: 100, z: 100 }, null].filter(Boolean)), 0);
  assert.deepEqual(remote.sample(1000).map((p) => p.id), [4]);
});
