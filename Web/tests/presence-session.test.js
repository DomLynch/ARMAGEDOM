import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPresenceSession, percentile, chooseFullLook } from "../src/engine/presence-session.js";
import { createRemotePlayersView, guestName } from "../src/engine/remote-players-view.js";
import { INTERP_DELAY_MS } from "../src/engine/remote-players.js";

class FakeSocket {
  static all = [];
  constructor(url, protocols) {
    Object.assign(this, { url, protocols, readyState: 0, sent: [] });
    FakeSocket.all.push(this);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
  receive(message) {
    this.onmessage({ data: JSON.stringify(message) });
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const toRender = (p, y = 0) => new THREE.Vector3(p.x, y, p.z);

function setup(extra = {}) {
  FakeSocket.all = [];
  const clock = { ms: 10000 },
    s = {
      scene: new THREE.Scene(),
      world: { areaId: "westminster", toRender },
      game: { player: { pos: { x: 1, z: 2 } } },
      traveling: false,
    },
    session = createPresenceSession(s, {
      config: { url: "wss://example.test/presence" },
      getToken: async () => "tok",
      WebSocketImpl: FakeSocket,
      now: () => clock.ms,
      ...extra,
    });
  return { s, clock, session, socket: () => FakeSocket.all.at(-1) };
}
async function inWorld(t, area = "westminster") {
  t.session.update();
  await flush();
  t.socket().open();
  t.socket().receive({ t: "welcome", id: 3, area, x: 100, z: 200, arrival: null });
}

test("with the flag off no session exists, so the game is exactly the single-player game", () => {
  assert.equal(createPresenceSession({}, { config: null }), null);
});

test("the first frame joins the area the phone is in, at the player's position", async () => {
  const t = setup();
  t.session.update();
  await flush();
  t.socket().open();
  assert.deepEqual(t.socket().sent, [{ t: "join", area: "westminster", x: 100, z: 200 }]);
});

test("other players are drawn at their interpolated positions with a name tag; my own id is not", async () => {
  const t = setup();
  await inWorld(t);
  t.socket().receive({ t: "state", tick: 1, players: [{ id: 3, x: 100, z: 200 }, { id: 9, x: 500, z: 600 }] });
  t.clock.ms += 100;
  t.socket().receive({ t: "state", tick: 2, players: [{ id: 3, x: 100, z: 200 }, { id: 9, x: 700, z: 600 }] });
  t.clock.ms += INTERP_DELAY_MS - 50;
  t.session.update();
  const view = t.session.view;
  assert.equal(view.count, 1, "only the other player");
  const figure = view.group.children[0];
  assert.equal(figure.name, "Player 9");
  assert.ok(figure.position.x > 5 && figure.position.x < 7, `x ${figure.position.x}`);
  assert.equal(figure.position.z, 6);
  t.socket().receive({ t: "state", tick: 3, players: [{ id: 3, x: 100, z: 200 }] });
  t.session.update();
  assert.equal(view.count, 0, "gone when they leave the layer");
});

test("changing area asks the server to travel and forgets the old layer's players", async () => {
  const t = setup();
  await inWorld(t);
  t.socket().receive({ t: "state", tick: 1, players: [{ id: 9, x: 500, z: 600 }] });
  t.session.update();
  assert.equal(t.session.view.count, 1);
  // The player runs on inside the old area: the 80 ms throttle leaves this last position unsent when the area changes.
  t.s.game.player.pos = { x: 1.2, z: 2 };
  t.clock.ms += 10;
  t.session.update();
  assert.equal(t.socket().sent.filter((m) => m.t === "loc").length, 0, "throttled, so not sent yet");
  t.s.world.areaId = "south";
  t.s.game.player.pos = { x: 40, z: 1 }; // the game has already moved the player to the new area
  t.session.update();
  const tail = t.socket().sent.slice(-2);
  assert.deepEqual(tail, [{ t: "loc", x: 120, z: 200 }, { t: "travel", to: "south" }], "the last old-area position goes first");
  assert.equal(t.session.view.count, 0);
  t.socket().receive({ t: "welcome", id: 3, area: "south", x: 4000, z: 100, arrival: "south:from-westminster" });
  assert.equal(t.session.client.area, "south");
});

test("when the server refuses the travel the session rejoins the area the phone is really in", async () => {
  const t = setup();
  await inWorld(t);
  t.s.world.areaId = "south";
  t.session.update();
  const before = FakeSocket.all.length;
  t.socket().receive({ t: "refuse", reason: "travel" });
  await flush();
  assert.equal(FakeSocket.all.length, before + 1, "a fresh socket");
  t.socket().open();
  assert.deepEqual(t.socket().sent, [{ t: "join", area: "south", x: 100, z: 200 }]);
});

test("nothing is reported while the game is travelling or has no run", async () => {
  const t = setup();
  t.s.traveling = true;
  t.session.update();
  await flush();
  assert.equal(FakeSocket.all.length, 0);
  t.s.traveling = false;
  t.s.game = null;
  t.session.update();
  assert.equal(FakeSocket.all.length, 0);
});

test("dispose closes the socket and removes the figures from the scene", async () => {
  const t = setup();
  await inWorld(t);
  t.socket().receive({ t: "state", tick: 1, players: [{ id: 9, x: 500, z: 600 }] });
  t.clock.ms += 400;
  t.session.update();
  assert.ok(t.s.scene.children.length > 0);
  t.session.dispose();
  assert.equal(t.s.scene.children.length, 0);
  assert.equal(t.session.client.connected, false);
});

test("the state interval p50/p95 is logged every 100 states, and only a session that exists logs", async () => {
  const lines = [],
    t = setup({ log: (line) => lines.push(line) });
  await inWorld(t);
  for (let i = 0; i < 101; i++) {
    t.clock.ms += i % 10 === 0 ? 180 : 100;
    t.socket().receive({ t: "state", tick: i, players: [] });
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[arma-world\] state interval ms p50=100 p95=180 n=100/);
  assert.equal(percentile([], 0.95), 0);
});

test("with the world on, the server's arrival point is honoured on join and on travel; a resumed position is not overridden", async () => {
  const t = setup();
  t.session.update();
  await flush();
  t.socket().open();
  t.socket().receive({ t: "welcome", id: 3, area: "westminster", x: 450, z: -120, arrival: "westminster:a2" });
  assert.deepEqual(t.s.game.player.pos, { x: 4.5, z: -1.2 }, "placed on the arrival, centimetres to metres");
  t.s.game.player.pos = { x: 9, z: 9 };
  t.socket().receive({ t: "welcome", id: 3, area: "westminster", x: 100, z: 100, arrival: null });
  assert.deepEqual(t.s.game.player.pos, { x: 9, z: 9 }, "arrival null: the phone's own position stands");
  t.s.world.areaId = "south";
  t.session.update();
  t.socket().receive({ t: "welcome", id: 3, area: "south", x: 4000, z: 100, arrival: "south:from-westminster" });
  assert.deepEqual(t.s.game.player.pos, { x: 40, z: 1 }, "travel arrival");
  t.socket().receive({ t: "welcome", id: 3, area: "central-hub", x: 1, z: 1, arrival: "central-hub:a1" });
  assert.deepEqual(t.s.game.player.pos, { x: 40, z: 1 }, "a welcome for another area than the phone's is ignored");
});

test("a player's display name is shown on the tag when the server sends one, else Guest <id>; a late name replaces it", async () => {
  const t = setup();
  await inWorld(t);
  t.socket().receive({ t: "state", tick: 1, players: [{ id: 9, x: 500, z: 600, name: "Survivor-1234" }, { id: 10, x: 0, z: 0 }] });
  t.clock.ms += 400;
  t.session.update();
  assert.deepEqual([...t.session.view.labels()], [
    [9, "Survivor-1234"],
    [10, "Guest 10"],
  ]);
  t.socket().receive({ t: "state", tick: 2, players: [{ id: 9, x: 500, z: 600, name: "Survivor-1234" }, { id: 10, x: 0, z: 0, name: "Sam" }] });
  t.clock.ms += 100;
  t.session.update();
  assert.equal(t.session.view.labels().get(10), "Sam");
  t.socket().receive({ t: "state", tick: 3, players: [{ id: 10, x: 0, z: 0, name: "x".repeat(60) }] });
  t.clock.ms += 100;
  t.session.update();
  assert.equal(t.session.view.labels().get(10).length, 24, "long names are cut");
});

test("the view pools one figure per player and frees what leaves", () => {
  const scene = new THREE.Scene(),
    view = createRemotePlayersView({ scene, toRender });
  view.update([{ id: 1, x: 0, z: 0, facing: 0 }, { id: 2, x: 1, z: 1, facing: 1 }]);
  const first = view.group.children[0];
  view.update([{ id: 1, x: 2, z: 2, facing: 0.5 }]);
  assert.equal(view.count, 1);
  assert.equal(view.group.children[0], first, "the same figure is reused");
  assert.equal(first.position.x, 2);
  view.dispose();
  assert.equal(scene.children.length, 0);
});

test("an optional survivor kit supplies the figure; the view keeps the pool, position, facing and tag, and falls back to the capsule", () => {
  const scene = new THREE.Scene(),
    calls = [];
  const kit = {
    spawn(id) {
      calls.push(["spawn", id]);
      if (id === 2) return null; // model not loaded for this one
      const root = new THREE.Group();
      return {
        root,
        update: (state) => calls.push(["update", id, state.moving, state.facing]),
        dispose: () => calls.push(["dispose", id]),
      };
    },
  };
  const view = createRemotePlayersView({ scene, toRender, survivors: kit });
  view.update([
    { id: 1, x: 3, z: 4, facing: 0.5, moving: true },
    { id: 2, x: 0, z: 0, facing: 0, moving: false },
  ]);
  const [one, two] = view.group.children;
  assert.equal(one.name, "Player 1");
  assert.equal(one.position.x, 3);
  assert.equal(one.rotation.y, 0.5);
  assert.ok(two.children.length >= 1 && two.children[0].children.length === 2, "the capsule fallback for the one the kit could not make");
  assert.deepEqual(calls.filter((c) => c[0] === "update"), [["update", 1, true, 0.5]]);
  view.update([{ id: 1, x: 3, z: 4, facing: 0.5, moving: false }]);
  assert.deepEqual(calls.filter((c) => c[0] === "spawn").length, 2, "one spawn per player, then pooled");
  view.dispose();
  assert.ok(calls.some((c) => c[0] === "dispose" && c[1] === 1));
});

test("only the chosen players get the full survivor look; a player who drops out of the set goes back to the capsule and frees the kit's figure", () => {
  const scene = new THREE.Scene(),
    live = new Set();
  const kit = {
    spawn(id) {
      live.add(id);
      return { root: new THREE.Group(), update() {}, dispose: () => live.delete(id) };
    },
  };
  const view = createRemotePlayersView({ scene, toRender, survivors: () => kit });
  const at = (id, x) => ({ id, x, z: 0, facing: 0, moving: false });
  const players = [1, 2, 3, 4, 5, 6].map((id) => at(id, id));
  view.update(players, new Set([1, 2, 3, 4]));
  assert.deepEqual([...live].sort(), [1, 2, 3, 4]);
  view.update(players, new Set([2, 3, 4, 5]));
  assert.deepEqual([...live].sort(), [2, 3, 4, 5], "1 gave its figure back, 5 got one");
  const one = view.group.children.find((c) => c.name === "Player 1");
  assert.equal(one.children.length, 1, "player 1 is a capsule again");
  view.update(players, new Set());
  assert.equal(live.size, 0);
  view.update([], new Set());
  view.dispose();
});

test("chooseFullLook picks the nearest four, keeps a current one until it falls past rank 6, and ignores ids that left", () => {
  const me = { x: 0, z: 0 },
    row = (id, d) => ({ id, x: d, z: 0 });
  const five = [row(1, 1), row(2, 2), row(3, 3), row(4, 4), row(5, 5)];
  assert.deepEqual([...chooseFullLook(five, me)].sort(), [1, 2, 3, 4]);
  // 5 becomes nearer than 4, but 4 is still inside rank 6: it stays, and the set stays at four with the nearest of the rest.
  const swapped = [row(1, 1), row(2, 2), row(3, 3), row(5, 3.5), row(4, 4)];
  assert.deepEqual([...chooseFullLook(swapped, me, new Set([1, 2, 3, 4]))].sort(), [1, 2, 3, 4], "no flicker");
  // Far down the ranking it is dropped and the next nearest takes the place.
  const far = [row(1, 1), row(2, 2), row(3, 3), row(5, 4), row(6, 5), row(7, 6), row(8, 7), row(4, 9)];
  assert.ok(!chooseFullLook(far, me, new Set([1, 2, 3, 4])).has(4));
  assert.equal(chooseFullLook(far, me, new Set([1, 2, 3, 4])).size, 4);
  assert.deepEqual([...chooseFullLook([row(9, 1)], me, new Set([1, 2, 3, 4]))], [9], "ids that left are forgotten");
  assert.equal(chooseFullLook([], me).size, 0);
});

test("guests are named by id until the server sends names", () => {
  assert.equal(guestName(12), "Guest 12");
  assert.equal(guestName(12, "Sam"), "Sam");
});
