import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateLoot } from "../src/engine/game-data-loot.js";
import { createInventoryApi, createMockInventoryApi, lootFromReply, normalizeRows } from "../src/engine/inventory-api.js";
import { createLootStore, lootOn } from "../src/engine/loot.js";
import { createLootSession } from "../src/engine/loot-session.js";
import { createSaveClient } from "../src/engine/save-client.js";
import { createFirstTimeHints } from "../src/first-time-hints.js";

const LOOT = GAME_DATA.loot;
const jwt = (sub) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.s`;
const run = () => ({ time: 5, message: "", messageUntil: 0, events: [], enemies: [], player: { hp: 10, pos: { x: 1, z: 2 } } });

// A tiny DOM: elements with children, text, attributes, a style map and click handlers.
class Node {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.textContent = "";
    this.hidden = false;
    this.attrs = new Map();
    this.style = { setProperty() {} };
    this.listeners = new Map();
    this.className = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attrs.set(k, v);
  }
  addEventListener(type, fn) {
    this.listeners.set(type, fn);
  }
  removeEventListener(type) {
    this.listeners.delete(type);
  }
  all() {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  text() {
    return [this.textContent, ...this.children.map((c) => c.text())].join(" ");
  }
}
function fakeDoc() {
  const nodes = new Map();
  for (const id of ["menu-items", "items-strip", "items-card", "items-status", "items-more", "items-title", "items-intro", "menu-tab-items"])
    nodes.set(id, new Node(id));
  return { nodes, getElementById: (id) => nodes.get(id) ?? null, createElement: () => new Node() };
}
const slots = (doc) => doc.nodes.get("items-strip").children;

test("loot data is valid and ships on with a named off switch", () => {
  validateLoot(structuredClone(LOOT));
  assert.equal(LOOT.enabled, true);
  assert.equal(LOOT.offSwitch, "noloot");
  assert.equal(lootOn(""), true);
  assert.equal(lootOn("?noloot=1"), false);
  assert.equal(lootOn("?noloot=0"), true);
  for (const id of ["hunter-cpu", "roach-mandibles", "salamander-gland", "military-battery", "robot-parts", "drone-chip"])
    assert.ok(LOOT.items[id], id);
});

test("the adapter keeps only well-formed whole-quantity rows and merges duplicates", () => {
  assert.deepEqual(normalizeRows([{ item_id: "a", qty: 1 }, { item_id: "a", qty: 2 }, { item_id: "b", qty: 0 }, { qty: 3 }, null, { item_id: "c", qty: 1.5 }]), [
    { item_id: "a", qty: 3 },
  ]);
  assert.deepEqual(normalizeRows("nope"), []);
  assert.deepEqual(lootFromReply({ credited: 5, loot: [{ item_id: "hunter-cpu", qty: 1 }] }), [{ item_id: "hunter-cpu", qty: 1 }]);
  assert.deepEqual(lootFromReply({ credited: 5 }), []);
  assert.deepEqual(lootFromReply(undefined), []);
});

test("a kill credit that returns loot shows the toast, a glint at the body and the first-drop hint", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const op = url.split("/").pop();
    sent.push(op);
    const body = op === "claim_pickup" ? { credited: 5, loot: [{ item_id: "hunter-cpu", qty: 1 }] } : op === "active" ? { character: "c1" } : {};
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
  };
  const g = run(),
    mock = createMockInventoryApi(),
    store = createLootStore({ api: mock });
  await store.refresh();
  const client = createSaveClient({
    baseUrl: "/arma/api",
    getToken: async () => jwt("acct"),
    storage: null,
    fetchImpl,
    onLoot: (rows, at) => store.receive(g, lootFromReply({ loot: rows }), at),
  });
  await client.claimPickup("kill:boss", 30, { x: 7, z: 9 });
  assert.equal(g.message, "Hunter CPU x1");
  assert.equal(g.messageUntil, g.time + LOOT.toastSeconds);
  assert.deepEqual(
    g.loot.glints.map((q) => [q.x, q.z]),
    [[7, 9]],
  );
  assert.deepEqual(store.items, [{ item_id: "hunter-cpu", qty: 1 }]);
  const hints = createFirstTimeHints({ storage: null });
  g.time += LOOT.toastSeconds + 1;
  assert.match(hints.current(g), /Rare drop/);
});

test("a kill credit with no loot (or loot with the feature off) changes nothing", async () => {
  const g = run(),
    store = createLootStore({ api: createMockInventoryApi() });
  assert.equal(store.receive(g, [], undefined), false);
  assert.equal(g.message, "");
  assert.equal(g.loot, undefined);
});

test("two drops in one credit join into one toast; quantity adds up", async () => {
  const g = run(),
    store = createLootStore({ api: createMockInventoryApi({ items: [{ item_id: "drone-chip", qty: 1 }] }) });
  await store.refresh();
  store.receive(g, [{ item_id: "drone-chip", qty: 1 }, { item_id: "robot-parts", qty: 2 }]);
  assert.equal(g.message, "Drone Chip x1, Robot Parts x2");
  assert.deepEqual(store.items, [
    { item_id: "drone-chip", qty: 2 },
    { item_id: "robot-parts", qty: 2 },
  ]);
});

test("the inventory strip shows four slots with quantity, a card on tap, and the server's names and sell price", async () => {
  const doc = fakeDoc(),
    mock = createMockInventoryApi({
      items: ["hunter-cpu", "roach-mandibles", "salamander-gland", "military-battery", "robot-parts"].map((item_id, i) => ({ item_id, qty: i + 1 })),
      defs: [{ id: "hunter-cpu", name: "Hunter CPU Mk2", kind: "part", rarity: "epic", base_price: 90, sell_price: 45 }],
    }),
    session = createLootSession({ search: "", doc, request: async () => ({}), getGame: () => run() });
  assert.equal(session.on, true);
  session.dispose();
  const store = createLootStore({ api: mock });
  const { createInventoryView } = await import("../src/engine/inventory-view.js");
  const view = createInventoryView({ store, doc });
  await store.refresh();
  assert.equal(slots(doc).length, LOOT.slots);
  assert.match(slots(doc)[0].text(), /Hunter CPU Mk2/);
  assert.match(slots(doc)[0].text(), /x1/);
  assert.equal(doc.nodes.get("items-more").textContent, "+1 more kinds");
  assert.equal(doc.nodes.get("menu-tab-items").textContent, LOOT.text.tab);
  slots(doc)[0].onclick();
  const card = doc.nodes.get("items-card");
  assert.equal(card.hidden, false);
  assert.match(card.text(), /Sells for \$45/);
  assert.match(card.text(), /part · epic/);
  slots(doc)[0].onclick();
  assert.equal(card.hidden, true);
  slots(doc)[2].onclick();
  assert.match(card.text(), /Sell value shown at the Scrapper/);
  assert.match(card.text(), /Hums with a slow orange heat/);
  view.dispose();
});

test("an empty account and an offline server show a friendly note and never throw", async () => {
  const doc = fakeDoc(),
    store = createLootStore({ api: createMockInventoryApi() });
  const { createInventoryView } = await import("../src/engine/inventory-view.js");
  createInventoryView({ store, doc });
  await store.refresh();
  assert.equal(doc.nodes.get("items-status").textContent, LOOT.text.empty);
  assert.equal(slots(doc).length, LOOT.slots);
  assert.ok(slots(doc).every((s) => s.disabled));
  const offline = createLootStore({ api: createMockInventoryApi({ fail: true }) });
  createInventoryView({ store: offline, doc });
  await offline.refresh();
  assert.equal(doc.nodes.get("items-status").textContent, LOOT.text.offline);
  const none = createLootStore({ api: null });
  assert.equal(await none.refresh(), "offline");
  const throwing = createLootStore({
    api: createInventoryApi({
      send: async () => {
        throw Error("boom");
      },
    }),
  });
  assert.equal(await throwing.refresh(), "offline");
  assert.deepEqual(throwing.items, []);
  const guest = createInventoryApi({ send: async () => ({ error: "no-token" }) });
  assert.deepEqual(await guest.get(), { ok: false, items: [], reason: "no-token" });
});

test("?noloot=1 hides the tab, makes no request and ignores returned loot", async () => {
  const doc = fakeDoc(),
    asked = [],
    g = run(),
    session = createLootSession({
      search: "?noloot=1",
      doc,
      request: async (op) => {
        asked.push(op);
        return {};
      },
      getGame: () => g,
    });
  assert.equal(session.on, false);
  assert.equal(doc.nodes.get("menu-tab-items").hidden, true);
  session.onLoot([{ item_id: "hunter-cpu", qty: 1 }], { x: 1, z: 1 });
  await session.refresh();
  assert.equal(g.message, "");
  assert.deepEqual(asked, []);
});

test("the live session asks inventory_get with the contract's op names", async () => {
  const doc = fakeDoc(),
    asked = [],
    session = createLootSession({
      search: "",
      doc,
      request: async (op) => {
        asked.push(op);
        return op === LOOT.ops.inventory ? [{ item_id: "drone-chip", qty: 2 }] : [{ id: "drone-chip", name: "Drone Chip", sell_price: 12 }];
      },
      getGame: () => run(),
    });
  assert.equal(await session.refresh(), "ok");
  assert.deepEqual(asked, ["inventory_get", "item_defs"]);
  assert.match(slots(doc)[0].text(), /Drone Chip/);
  session.dispose();
});
