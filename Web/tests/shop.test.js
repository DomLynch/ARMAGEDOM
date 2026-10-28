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

function setup({ guest = false, market = createMockMarket({ cash: 100, items: { scrap: 3 } }), cash = 100 } = {}) {
  const views = [];
  let adapter = market;
  const controller = createShopController({
    api: () => adapter,
    isGuest: () => guest,
    localCash: () => cash,
    newId: (() => {
      let n = 0;
      return () => `req-${++n}`;
    })(),
    onChange: (v) => views.push(v),
  });
  return { controller, market, views, last: () => views.at(-1), offline: () => (adapter = null) };
}

test("the shop rows name hub NPCs that exist, and every row has words from data", () => {
  const npcs = new Set(GAME_DATA.hubNpcs.npcs.map((n) => n.id));
  for (const row of DATA.shops) assert.ok(npcs.has(row.npcId), row.shopId);
  assert.deepEqual(DATA.shops.map((r) => r.shopId), ["scrapper", "medic"]);
  assert.equal(DATA.shops.find((r) => r.shopId === "scrapper").npcId, "quartermaster-marsh");
  assert.equal(DATA.shops.find((r) => r.shopId === "medic").npcId, "medic-okafor");
  assert.ok(!GAME_DATA.hubNpcs.npcs.some((n) => n.id === "radio-reyes" && DATA.shops.some((r) => r.npcId === n.id)));
});

test("open shows the Buy tab with the stall's rows and the carried strip; close and tab switching work", async () => {
  const { controller, last } = setup();
  assert.equal(controller.open("scrapper"), true);
  await wait();
  const v = last();
  assert.equal(v.open, true);
  assert.equal(v.phase, "ready");
  assert.equal(v.tab, DATA.buyTabId);
  assert.deepEqual(v.rows.map((r) => r.itemId), ["scrap", "tape"]); // relic is not for sale
  assert.equal(v.cashText, "Cash 100");
  assert.equal(v.slots.length, DATA.inventorySlots);
  assert.equal(v.slots[0], "Scrap metal x3");
  controller.setTab(DATA.sellTabId);
  assert.deepEqual(last().rows.map((r) => r.itemId), ["scrap"]); // only what is carried and wanted
  controller.close();
  assert.equal(last().open, false);
  assert.equal(controller.open("nope"), false);
});

test("buy moves cash and the carried count; sell does the reverse; each shows a done line", async () => {
  const { controller, market, last } = setup();
  controller.open("scrapper");
  await wait();
  controller.step("scrap", 1);
  await controller.confirm("scrap"); // 2 x 10
  assert.equal(market.cash, 80);
  assert.equal(market.carried("scrap"), 5);
  assert.equal(last().cashText, "Cash 80");
  assert.equal(last().message.text, "Bought 2 x Scrap metal.");
  controller.setTab(DATA.sellTabId);
  controller.step("scrap", 2);
  await controller.confirm("scrap"); // 3 x 4
  assert.equal(market.cash, 92);
  assert.equal(market.carried("scrap"), 2);
  assert.equal(last().message.text, "Sold 3 x Scrap metal.");
  assert.equal(last().slots[0], "Scrap metal x2");
});

test("not enough cash and not enough items show clear text and send nothing", async () => {
  const { controller, market, last } = setup({ market: createMockMarket({ cash: 15, items: { scrap: 1 } }), cash: 15 });
  controller.open("scrapper");
  await wait();
  controller.step("scrap", 1);
  await controller.confirm("scrap"); // 20 > 15
  assert.equal(last().message.text, DATA.text.errors.insufficient_cash);
  assert.equal(market.calls.length, 0);
  controller.setTab(DATA.sellTabId);
  assert.equal(last().rows[0].qty, 2); // the quantity chosen on the Buy tab is kept...
  await controller.confirm("scrap"); // ...but cannot be sold: only 1 carried
  assert.equal(last().message.text, DATA.text.errors.insufficient_qty);
  assert.equal(market.calls.length, 0);
});

test("a server refusal is shown with its own text, an unknown code with the generic refusal", async () => {
  const { controller, last } = setup({ market: createMockMarket({ cash: 100, errors: { buy: "inventory_full" } }) });
  controller.open("scrapper");
  await wait();
  await controller.confirm("scrap");
  assert.equal(last().message.text, DATA.text.errors.inventory_full);
  const other = setup({ market: createMockMarket({ cash: 100, errors: { buy: "weird_new_code" } }) });
  other.controller.open("scrapper");
  await wait();
  await other.controller.confirm("scrap");
  assert.equal(other.last().message.text, DATA.text.errors.refused);
});

test("replay: an order that got no verdict is retried with the same request id and is charged once", async () => {
  const market = createMockMarket({ cash: 100 }),
    real = market.buy;
  let drop = true;
  market.buy = async (...args) => {
    const reply = await real(...args); // the server applied it...
    return drop ? { ok: false, error: "offline", offline: true } : reply; // ...but the answer was lost
  };
  const { controller, last } = setup({ market });
  controller.open("scrapper");
  await wait();
  await controller.confirm("scrap");
  assert.equal(last().message.text, DATA.text.errors.offline);
  drop = false;
  await controller.confirm("scrap"); // same item, same quantity: same request id
  const ids = market.calls.map((c) => c.requestId);
  assert.equal(new Set(ids).size, 1);
  assert.equal(market.cash, 90); // charged once
  assert.equal(last().message.text, DATA.text.replayed);
  await controller.confirm("scrap"); // a new order gets a new id
  assert.equal(new Set(market.calls.map((c) => c.requestId)).size, 2);
  assert.equal(market.cash, 80);
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
  const signedOut = setup({ market: createMockMarket({ errors: { stock: "signin" } }) });
  signedOut.controller.open("scrapper");
  await wait();
  assert.equal(signedOut.last().stateText, DATA.text.closedGuest);
});

test("the medic stall sells its own rows through the same controller", async () => {
  const { controller, market, last } = setup({ market: createMockMarket({ cash: 100 }) });
  controller.open("medic");
  await wait();
  assert.equal(last().shop.title, DATA.shops[1].title);
  await controller.confirm("medkit-pack");
  assert.equal(market.cash, 60);
  assert.equal(market.calls[0].shopId, "medic");
});

test("local cash shows until the server answers with its own", async () => {
  const { controller, last } = setup({ cash: 55 });
  controller.open("scrapper");
  await wait();
  assert.equal(last().cashText, "Cash 55");
  await controller.confirm("tape");
  assert.equal(last().cashText, "Cash 94");
});

test("the off switch is named in data and turns the shops off", () => {
  assert.equal(DATA.offParam, "noshop");
  assert.equal(shopsOn(""), true);
  assert.equal(shopsOn(`?${DATA.offParam}=${DATA.offValue}`), false);
});

// A screen with the hub, the player and a camera whose projection is the identity on (x, z) so boxes are predictable.
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
function mount({ blocked = false, search = "", market = createMockMarket({ cash: 100 }) } = {}) {
  const doc = makeDoc(),
    state = { blocked };
  const shop = createShop({ doc, market: () => market, isGuest: () => false, localCash: () => null, blocked: () => state.blocked, search });
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

test("the panel draws the Buy rows with 48px-class controls and a Market closed state for a guest", async () => {
  const { shop, spots, panel } = mount();
  shop.update(scene({ player: marshAt(0) }));
  spots[0].listeners.click();
  await wait();
  const root = panel();
  assert.equal(root.byClass("shop-row").length, 2);
  assert.equal(root.byClass("shop-confirm")[0].textContent, "Buy $10");
  assert.equal(root.byClass("shop-slot").length, DATA.inventorySlots);
  const confirm = root.byClass("shop-confirm")[0];
  await confirm.listeners.click();
  await wait();
  assert.equal(root.byClass("shop-note")[0].textContent, "Bought 1 x Scrap metal.");
  const closed = createShop({ doc: makeDoc(), market: () => null, isGuest: () => true, localCash: () => null, blocked: () => false });
  closed.open("scrapper");
  assert.equal(closed.controller.view().stateText, DATA.text.closedGuest);
});

test("market adapter: maps the contract's rows, the trade reply and offline/refusal verdicts; it never throws", async () => {
  const seen = [];
  const reply = (status, body) => async (url, init) => (
    seen.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }),
    { ok: status < 400, status, json: async () => body }
  );
  const make = (fetchImpl, getToken = async () => "tok") => createMarketApi({ url: "https://x.test", anonKey: "k", getToken, fetchImpl });
  const api = make(reply(200, [{ item_id: "a", name: "A", buy_price: 5, sell_price: null }]));
  assert.deepEqual(await api.stock("scrapper"), { ok: true, rows: [{ itemId: "a", name: "A", buyPrice: 5, sellPrice: null }] });
  assert.equal(seen[0].url, `https://x.test${DATA.api.rpcPath}${DATA.api.calls.stock}`);
  assert.deepEqual(seen[0].body, { shop_id: "scrapper" });
  assert.equal(seen[0].auth, "Bearer tok");
  const buy = make(reply(200, { ok: true, cash: 90, inventory: [{ item_id: "a", qty: 2 }], replayed: true }));
  assert.deepEqual(await buy.buy("scrapper", "a", 2, "r1"), { ok: true, cash: 90, items: [{ itemId: "a", qty: 2 }], replayed: true, error: undefined });
  assert.deepEqual(seen.at(-1).body, { shop_id: "scrapper", item_id: "a", qty: 2, request_id: "r1" });
  assert.deepEqual((await make(reply(200, [{ item_id: "a", qty: 1 }])).inventory()).items, [{ itemId: "a", qty: 1 }]);
  assert.equal((await make(reply(200, { ok: false, error: "insufficient_cash" })).sell("s", "a", 1, "r")).error, "insufficient_cash");
  assert.deepEqual(await make(reply(401, {})).stock("s"), { ok: false, error: "signin" });
  assert.equal((await make(reply(DATA.api.serverErrorFrom, {})).stock("s")).offline, true);
  assert.equal((await make(reply(400, { message: "unknown_item" })).buy("s", "a", 1, "r")).error, "unknown_item");
  const thrown = await make(async () => {
    throw new Error("network");
  }).inventory();
  assert.deepEqual(thrown, { ok: false, error: "offline", offline: true });
  assert.deepEqual(await make(reply(200, []), async () => null).inventory(), { ok: false, error: "signin" });
  assert.equal(createMarketApi({ url: "", anonKey: "k", getToken: async () => "t" }), null);
});
