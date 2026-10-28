import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createMarketApi } from "../src/engine/market-api.js";
import { createShopController, shopsOn } from "../src/engine/shop-core.js";
import { createShop } from "../src/engine/shop.js";
import { createMockMarket } from "./market-mock.js";

const DATA = GAME_DATA.shops;
const wait = () => new Promise((resolve) => setImmediate(resolve));

class Node {
  constructor(tag) {
    Object.assign(this, { tag, children: [], hidden: false, textContent: "", className: "", disabled: false, listeners: {}, attrs: {}, style: {} });
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  remove() {
    this.removed = true;
  }
  all() {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  byClass(name) {
    return this.all().filter((n) => n.className.split(" ").includes(name));
  }
}
const makeDoc = () => ({ body: new Node("body"), createElement: (tag) => new Node(tag), addEventListener() {} });

// The run's carried cash is a local number the controller moves by each trade's signed delta, like browser-session.js does.
function setup({ guest = false, cash = 500, items = { "hunter-cpu": 3, "ammo-pack": 1 }, market = createMockMarket({ cash, items }) } = {}) {
  const views = [],
    wallet = { cash };
  let adapter = market;
  const controller = createShopController({
    api: () => adapter,
    isGuest: () => guest,
    localCash: () => wallet.cash,
    onCash: (delta) => (wallet.cash += delta),
    newId: (() => {
      let n = 0;
      return () => `req-${++n}`;
    })(),
    onChange: (v) => views.push(v),
  });
  return { controller, market, wallet, views, last: () => views.at(-1), offline: () => (adapter = null) };
}

test("the shop rows name hub NPCs that exist and the server's one shop; Reyes has no stall", () => {
  const npcs = new Set(GAME_DATA.hubNpcs.npcs.map((n) => n.id));
  for (const row of DATA.shops) assert.ok(npcs.has(row.npcId), row.shopId);
  assert.deepEqual(DATA.shops.map((r) => r.shopId), ["scrapper", "medic"]);
  assert.ok(DATA.shops.every((r) => r.serverShop === "hub-trader"));
  assert.equal(DATA.shops[0].npcId, "quartermaster-marsh");
  assert.equal(DATA.shops[1].npcId, "medic-okafor");
  assert.deepEqual(DATA.shops[1].itemIds, ["medkit-pack", "vest-patch"]);
  assert.ok(!DATA.shops.some((r) => r.npcId === "radio-reyes"));
  assert.equal(new Set(DATA.shops.flatMap((r) => r.itemIds)).size, DATA.shops.flatMap((r) => r.itemIds).length); // no item on two stalls
});

test("open shows the Buy tab with only this stall's items and the carried strip; close and tab switching work", async () => {
  const { controller, last, market } = setup();
  assert.equal(controller.open("scrapper"), true);
  await wait();
  const v = last();
  assert.equal(v.open, true);
  assert.equal(v.phase, "ready");
  assert.equal(v.tab, DATA.buyTabId);
  assert.deepEqual(v.rows.map((r) => r.itemId), ["ammo-pack"]); // the parts are sell-only; medkit and vest patch are the medic's
  assert.equal(v.cashText, "Cash 500");
  assert.equal(v.slots.length, DATA.inventorySlots);
  assert.equal(v.slots[0], "Ammo Pack x1");
  assert.equal(market.calls.length, 0);
  controller.setTab(DATA.sellTabId);
  assert.deepEqual(last().rows.map((r) => r.itemId), ["ammo-pack", "hunter-cpu"]); // only what is carried and bought
  controller.close();
  assert.equal(last().open, false);
  assert.equal(controller.open("nope"), false);
});

test("buy moves cash by the signed delta and the carried count; sell does the reverse; each shows a done line", async () => {
  const { controller, market, wallet, last } = setup();
  controller.open("scrapper");
  await wait();
  controller.step("ammo-pack", 1);
  await controller.confirm("ammo-pack"); // 2 x 60
  assert.equal(wallet.cash, 380);
  assert.equal(market.carried("ammo-pack"), 3);
  assert.equal(last().cashText, "Cash 380");
  assert.equal(last().message.text, "Bought 2 x Ammo Pack.");
  controller.setTab(DATA.sellTabId);
  controller.step("hunter-cpu", 1);
  await controller.confirm("hunter-cpu"); // 2 x 150
  assert.equal(wallet.cash, 680);
  assert.equal(market.carried("hunter-cpu"), 1);
  assert.equal(last().message.text, "Sold 2 x Hunter CPU.");
  assert.equal(last().slots[0], "Ammo Pack x3");
  assert.equal(market.calls[0].shopId, "hub-trader");
});

test("not enough cash and not enough items show clear text and send nothing", async () => {
  const { controller, market, last } = setup({ cash: 100 });
  controller.open("scrapper");
  await wait();
  controller.step("ammo-pack", 1);
  await controller.confirm("ammo-pack"); // 120 > 100
  assert.equal(last().message.text, DATA.text.errors["insufficient-cash"]);
  controller.setTab(DATA.sellTabId);
  controller.step("hunter-cpu", 3);
  assert.equal(last().rows.find((r) => r.itemId === "hunter-cpu").qty, 3); // clamped to what is carried
  controller.step("ammo-pack", 1); // carried 1: the stepper stops there
  assert.equal(last().rows.find((r) => r.itemId === "ammo-pack").qty, 1);
  assert.equal(market.calls.length, 0);
});

test("a server refusal is shown with the writer's code text; an unknown code with the generic refusal", async () => {
  for (const [code, text] of [["inventory-full", DATA.text.errors["inventory-full"]], ["ceiling", DATA.text.errors.ceiling], ["weird-new", DATA.text.errors.refused]]) {
    const t = setup({ market: createMockMarket({ cash: 500, errors: { buy: code } }) });
    t.controller.open("scrapper");
    await wait();
    await t.controller.confirm("ammo-pack");
    assert.equal(t.last().message.text, text, code);
    assert.equal(t.wallet.cash, 500);
  }
  const sellOnly = setup({ market: createMockMarket({ cash: 500 }) });
  sellOnly.controller.open("scrapper");
  await wait();
  sellOnly.controller.setTab(DATA.sellTabId);
  await sellOnly.controller.confirm("hunter-cpu"); // nothing carried: not even listed
  assert.equal(sellOnly.market.calls.length, 0);
});

test("replay: an order that got no verdict is retried with the same request id and is charged once", async () => {
  const market = createMockMarket({ cash: 500 }),
    real = market.buy;
  let drop = true;
  market.buy = async (...args) => {
    const reply = await real(...args); // the server applied it...
    return drop ? { ok: false, error: "offline", offline: true } : reply; // ...but the answer was lost
  };
  const { controller, last, wallet } = setup({ market });
  controller.open("scrapper");
  await wait();
  await controller.confirm("ammo-pack");
  assert.equal(last().message.text, DATA.text.errors.offline);
  assert.equal(wallet.cash, 500); // no verdict yet: the phone has not applied anything
  drop = false;
  await controller.confirm("ammo-pack"); // same item, same quantity: same request id
  assert.equal(new Set(market.calls.map((c) => c.requestId)).size, 1);
  assert.equal(market.cash, 440); // charged once on the server
  assert.equal(wallet.cash, 440); // and applied once on the phone
  assert.equal(last().message.text, DATA.text.replayed);
  assert.equal(last().slots[0], "Ammo Pack x1"); // the present inventory
  await controller.confirm("ammo-pack"); // a new order gets a new id
  assert.equal(new Set(market.calls.map((c) => c.requestId)).size, 2);
  assert.equal(wallet.cash, 380);
});

test("closed state: a guest, no market and an unreachable market never throw and never trade", async () => {
  const guest = setup({ guest: true });
  guest.controller.open("scrapper");
  await wait();
  assert.equal(guest.last().phase, "closed");
  assert.equal(guest.last().stateText, DATA.text.closedGuest);
  assert.equal(guest.market.calls.length, 0);
  const none = setup();
  none.offline();
  none.controller.open("medic");
  assert.equal(none.last().stateText, DATA.text.closedOffline);
  await none.controller.confirm("medkit-pack"); // nothing to do, no throw
  const down = setup({ market: createMockMarket({ errors: { stock: "offline" } }) });
  down.controller.open("scrapper");
  await wait();
  assert.equal(down.last().phase, "offline");
  assert.equal(down.last().stateText, DATA.text.offline);
  for (const code of DATA.api.signedOutErrors) {
    const out = setup({ market: createMockMarket({ errors: { stock: code } }) });
    out.controller.open("scrapper");
    await wait();
    assert.equal(out.last().stateText, DATA.text.closedGuest);
  }
});

test("the medic stall sells its own items through the same controller", async () => {
  const { controller, wallet, market, last } = setup();
  controller.open("medic");
  await wait();
  assert.equal(last().shop.title, DATA.shops[1].title);
  assert.deepEqual(last().rows.map((r) => r.itemId), ["medkit-pack", "vest-patch"]);
  await controller.confirm("medkit-pack");
  assert.equal(wallet.cash, 380);
  assert.equal(market.calls[0].shopId, "hub-trader");
});

test("the off switch is named in data and turns the shops off", () => {
  assert.equal(DATA.offParam, "noshop");
  assert.equal(shopsOn(""), true);
  assert.equal(shopsOn(`?${DATA.offParam}=${DATA.offValue}`), false);
});

// A screen with the hub, the player and a camera whose projection keeps boxes predictable.
function scene({ player, area = DATA.area } = {}) {
  const world = {
    areaId: area,
    geometry: { ground: (p) => ({ x: p.x * 60, z: p.y * 60 }) },
    toRender: (g, h) => ({ project: () => ({ x: g.x / 10 - 0.4, y: -(g.z / 10) + 0.5 + h * 0.01, z: 0.5 }) }),
  };
  return {
    world,
    game: { player: { pos: player } },
    camera: { updateMatrixWorld() {} },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 812 }) },
  };
}
function mount({ blocked = false, search = "", market = createMockMarket({ cash: 500 }) } = {}) {
  const doc = makeDoc(),
    state = { blocked };
  const shop = createShop({ doc, market: () => market, isGuest: () => false, localCash: () => 500, onCash() {}, blocked: () => state.blocked, search });
  const spots = doc.body.children[0].children;
  return { shop, doc, state, spots, panel: () => doc.body.children[1] };
}
const marsh = DATA.shops[0];
const marshAt = (dx = 0) => {
  const npc = GAME_DATA.hubNpcs.npcs.find((n) => n.id === marsh.npcId);
  return { x: npc.at.x * 60 + dx, z: npc.at.y * 60 };
};

test("proximity gate: the tap target shows only inside the row's radius, in the hub, and the panel closes when you walk away", async () => {
  const { shop, spots, state, panel } = mount();
  shop.update(scene({ player: marshAt(0) }));
  assert.equal(spots[0].hidden, false);
  assert.ok(Number.parseFloat(spots[0].style.width) >= DATA.hotspot.minPx);
  assert.ok(Number.parseFloat(spots[0].style.height) >= DATA.hotspot.minPx);
  assert.equal(spots[1].hidden, true); // Okafor is 8.5 away
  shop.update(scene({ player: marshAt(marsh.radius + 0.5) }));
  assert.equal(spots[0].hidden, true);
  shop.update(scene({ player: marshAt(0), area: "east" }));
  assert.equal(spots[0].hidden, true);
  // Tapping the NPC opens the panel; walking out closes it.
  shop.update(scene({ player: marshAt(0) }));
  spots[0].listeners.click();
  await wait();
  assert.equal(panel().hidden, false);
  assert.equal(panel().byClass("shop-title")[0].textContent, marsh.title);
  shop.update(scene({ player: marshAt(0) }));
  assert.equal(spots[0].hidden, true); // the target steps aside while the panel is open
  shop.update(scene({ player: marshAt(marsh.radius + 0.5) }));
  assert.equal(panel().hidden, true);
  // The field menu (blocked) hides the target and closes an open shop.
  shop.update(scene({ player: marshAt(0) }));
  spots[0].listeners.click();
  await wait();
  state.blocked = true;
  shop.update(scene({ player: marshAt(0) }));
  assert.equal(panel().hidden, true);
  assert.equal(spots[0].hidden, true);
});

test("the off switch hides every tap target even next to the NPC", () => {
  const { shop, spots } = mount({ search: `?${DATA.offParam}=${DATA.offValue}` });
  shop.update(scene({ player: marshAt(0) }));
  assert.ok(spots.every((s) => s.hidden));
});

test("the panel draws the Buy rows and a Market closed state for a guest", async () => {
  const { shop, spots, panel } = mount();
  shop.update(scene({ player: marshAt(0) }));
  spots[0].listeners.click();
  await wait();
  const root = panel();
  assert.equal(root.byClass("shop-row").length, 1);
  assert.equal(root.byClass("shop-confirm")[0].textContent, "Buy $60");
  assert.equal(root.byClass("shop-slot").length, DATA.inventorySlots);
  await root.byClass("shop-confirm")[0].listeners.click();
  await wait();
  assert.equal(root.byClass("shop-note")[0].textContent, "Bought 1 x Ammo Pack.");
  const closedDoc = makeDoc(),
    closed = createShop({ doc: closedDoc, market: () => null, isGuest: () => true, localCash: () => null, onCash() {}, blocked: () => false });
  closed.open("scrapper");
  assert.equal(closed.controller.view().stateText, DATA.text.closedGuest);
  assert.equal(closedDoc.body.children[1].byClass("shop-title")[0].textContent, DATA.text.closedTitle);
  assert.equal(closedDoc.body.children[1].byClass("shop-cash")[0].hidden, true);
});

test("market adapter: speaks the writer's routes and maps the contract's answers; it never throws", async () => {
  const seen = [];
  const reply = (status, body) => async (url, init) => (
    seen.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }),
    { ok: status < 400, status, json: async () => body }
  );
  const make = (fetchImpl, getToken = async () => "tok") => createMarketApi({ baseUrl: "https://x.test/arma/api", getToken, fetchImpl });
  const api = make(reply(200, { stock: [{ item_id: "a", name: "A", buy_price: 5, sell_price: null }] }));
  assert.deepEqual(await api.stock("hub-trader"), { ok: true, rows: [{ itemId: "a", name: "A", buyPrice: 5, sellPrice: null }] });
  assert.equal(seen[0].url, `https://x.test/arma/api/${DATA.api.calls.stock}`);
  assert.deepEqual(seen[0].body, { shop_id: "hub-trader" });
  assert.equal(seen[0].auth, "Bearer tok");
  const buy = make(reply(200, { ok: true, cash: 90, bank: 0, delta: -10, ceiling: 99, inventory: [{ item_id: "a", qty: 2 }], replayed: true }));
  assert.deepEqual(await buy.buy("hub-trader", "a", 2, "r1"), { ok: true, delta: -10, items: [{ itemId: "a", qty: 2 }], replayed: true, error: undefined });
  assert.equal(seen.at(-1).url, `https://x.test/arma/api/${DATA.api.calls.buy}`);
  assert.deepEqual(seen.at(-1).body, { shop_id: "hub-trader", item_id: "a", qty: 2, request_id: "r1" });
  const inv = make(reply(200, { inventory: [{ item_id: "a", qty: 1 }] }));
  assert.deepEqual((await inv.inventory()).items, [{ itemId: "a", qty: 1 }]);
  assert.equal(seen.at(-1).url, `https://x.test/arma/api/${DATA.api.calls.inventory}`);
  assert.equal((await make(reply(200, { ok: false, error: "insufficient-qty" })).sell("s", "a", 1, "r")).error, "insufficient-qty");
  assert.deepEqual(await make(reply(401, { error: "token" })).stock("s"), { ok: false, error: "signin" });
  assert.deepEqual(await make(reply(403, { error: "no-character" })).stock("s"), { ok: false, error: "no-character", offline: false });
  assert.equal((await make(reply(429, { error: "rate-limited", retryMs: 1000 })).buy("s", "a", 1, "r")).error, "rate-limited");
  assert.equal((await make(reply(DATA.api.serverErrorFrom, {})).stock("s")).offline, true);
  const thrown = await make(async () => {
    throw new Error("network");
  }).inventory();
  assert.deepEqual(thrown, { ok: false, error: "offline", offline: true });
  assert.deepEqual(await make(reply(200, {}), async () => null).inventory(), { ok: false, error: "signin" });
  assert.equal(createMarketApi({ baseUrl: "", getToken: async () => "t" }), null);
});
