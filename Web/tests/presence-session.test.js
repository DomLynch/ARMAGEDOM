import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPresenceSession } from "../src/engine/presence-session.js";
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

function setup() {
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

test("guests are named by id until the server sends names", () => {
  assert.equal(guestName(12), "Guest 12");
  assert.equal(guestName(12, new Map([[12, "Sam"]])), "Sam");
});
