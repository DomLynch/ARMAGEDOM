// The shop panel's brain, with no DOM: which shop is open, the Buy/Sell tab, the stall's rows, what the player carries, the quantities,
// and one order at a time against the market adapter (engine/market-api.js or a mock with the same shape). The view only reads view().
// Words come from data/shops.json. A server verdict is shown in plain text; an order that never reached a verdict (offline) keeps its
// request id, so pressing the button again is a safe replay and can never charge twice.
import { GAME_DATA, fillText } from "./game-data.js";

const DATA = GAME_DATA.shops;
export const say = (key, vars = {}) => fillText(DATA.text[key], vars);
// On unless the data switches it off or the URL carries the off switch (improvements ship default-on).
export const shopsOn = (search = globalThis.location?.search ?? "") =>
  DATA.enabled && new URLSearchParams(search).get(DATA.offParam) !== DATA.offValue;
export const shopRow = (shopId) => DATA.shops.find((row) => row.shopId === shopId) ?? null;
const signedOut = (code) => DATA.api.signedOutErrors.includes(code);
const errorText = (code) => (Object.hasOwn(DATA.text.errors, code) ? DATA.text.errors[code] : DATA.text.errors.refused);

// api: () => adapter | null (null = the market cannot be reached at all); isGuest: () => bool; localCash: () => number | null;
// onCash(delta): the run's carried cash moves by the trade's signed delta (the server settles the price, the phone applies the change).
export function createShopController({
  api,
  isGuest,
  localCash,
  onCash = () => {},
  newId = () => globalThis.crypto.randomUUID(),
  onChange = () => {},
}) {
  const names = new Map(), // item id -> display name, remembered from every stall
    held = new Map(), // item id -> carried count
    wanted = new Map(); // item id -> chosen quantity
  let shop = null,
    tab = DATA.buyTabId,
    phase = "closed",
    closedKey = "closedOffline",
    rows = [],
    serverCash = null,
    busy = false,
    message = null,
    pending = null, // { key, id } of an order that got no verdict
    ticket = 0;
  const emit = () => onChange(view());
  const carried = (itemId) => held.get(itemId) ?? 0;
  const qtyOf = (itemId) => wanted.get(itemId) ?? 1;
  const priceOf = (row) => (tab === DATA.buyTabId ? row.buyPrice : row.sellPrice);
  // The run's own carried cash when there is one (it includes unsaved pickups); else the server's stored balance from inventory_get.
  const cash = () => localCash() ?? serverCash;
  const shut = (key) => {
    phase = "closed";
    closedKey = key;
  };
  const take = (list) => {
    held.clear();
    for (const { itemId, qty } of list) if (qty > 0) held.set(itemId, qty);
  };
  function view() {
    const money = cash(),
      listed = rows
        .filter((row) => priceOf(row) !== null && (tab === DATA.buyTabId || carried(row.itemId) > 0))
        .map((row) => {
          const qty = qtyOf(row.itemId);
          return {
            itemId: row.itemId,
            name: row.name,
            priceText: say("price", { amount: priceOf(row) }),
            qty,
            ownedText: say("owned", { qty: carried(row.itemId) }),
            totalText: say("total", { amount: priceOf(row) * qty }),
          };
        });
    const strip = [...held].slice(0, DATA.inventorySlots).map(([itemId, qty]) => say("slotLine", { name: names.get(itemId) ?? itemId, qty }));
    while (strip.length < DATA.inventorySlots) strip.push(say("slotEmpty"));
    return {
      open: shop !== null,
      shop,
      tab,
      phase,
      stateText: phase === "closed" ? say(closedKey) : phase === "loading" ? say("loading") : phase === "offline" ? say("offline") : "",
      cashText: money === null ? say("cashUnknown") : say("cash", { amount: money }),
      rows: listed,
      emptyText: listed.length ? "" : say(tab === DATA.buyTabId ? "emptyBuy" : "emptySell"),
      slots: strip,
      busy,
      message,
    };
  }
  async function load() {
    const mine = ++ticket,
      market = api();
    if (isGuest()) shut("closedGuest");
    else if (!market) shut("closedOffline");
    else {
      phase = "loading";
      emit();
      const [stock, inventory] = await Promise.all([market.stock(shop.serverShop), market.inventory()]);
      if (mine !== ticket) return;
      if (signedOut(stock.error) || signedOut(inventory.error)) shut("closedGuest");
      else if (!stock.ok || !inventory.ok) phase = "offline";
      else {
        rows = stock.rows.filter((row) => shop.itemIds.includes(row.itemId));
        for (const row of stock.rows) names.set(row.itemId, row.name); // the strip names everything carried, not just this stall's items
        take(inventory.items);
        serverCash = inventory.cash;
        phase = "ready";
      }
    }
    emit();
  }
  async function confirm(itemId) {
    const row = rows.find((r) => r.itemId === itemId),
      side = tab,
      market = api(),
      qty = qtyOf(itemId);
    if (busy || phase !== "ready" || !row || priceOf(row) === null) return;
    const fail = (code) => {
      message = { kind: "error", text: errorText(code) };
      emit();
    };
    if (!market) return fail("offline");
    if (side === DATA.sellTabId && qty > carried(itemId)) return fail("insufficient-qty");
    if (side === DATA.buyTabId && cash() !== null && qty * priceOf(row) > cash()) return fail("insufficient-cash");
    const key = [side, shop.shopId, itemId, qty].join(DATA.keySeparator),
      id = pending?.key === key ? pending.id : newId(),
      mine = ticket;
    pending = { key, id };
    busy = true;
    message = null;
    emit();
    const reply = await market[side](shop.serverShop, itemId, qty, id);
    if (reply.ok && serverCash !== null) serverCash += reply.delta;
    if (reply.ok) onCash(reply.delta); // applied even if the panel was closed meanwhile: the server has already settled it
    // A replayed answer carries the first call's inventory snapshot, so the present one is read.
    const fresh = reply.ok && reply.replayed ? await market.inventory() : null;
    if (mine !== ticket) return;
    busy = false;
    if (reply.offline) return fail("offline"); // no verdict: the id is kept for the retry
    pending = null;
    if (!reply.ok) {
      if (signedOut(reply.error)) shut("closedGuest");
      return fail(reply.error);
    }
    take(fresh?.ok ? fresh.items : reply.items);
    wanted.delete(itemId);
    message = { kind: "ok", text: reply.replayed ? say("replayed") : say(side === DATA.buyTabId ? "boughtDone" : "soldDone", { qty, name: row.name }) };
    emit();
  }
  return {
    view,
    get isOpen() {
      return shop !== null;
    },
    open(shopId) {
      const row = shopRow(shopId);
      if (!row || !DATA.enabled) return false;
      shop = row;
      tab = DATA.buyTabId;
      rows = [];
      message = null;
      pending = null;
      busy = false;
      wanted.clear();
      load();
      return true;
    },
    close() {
      if (!shop) return;
      ticket++;
      shop = null;
      busy = false;
      emit();
    },
    retry() {
      if (shop && phase !== "ready") load();
    },
    setTab(next) {
      if (!shop || ![DATA.buyTabId, DATA.sellTabId].includes(next)) return;
      tab = next;
      message = null;
      emit();
    },
    step(itemId, delta) {
      const limit = tab === DATA.sellTabId ? Math.max(1, carried(itemId)) : DATA.maxOrder;
      wanted.set(itemId, Math.min(limit, Math.max(1, qtyOf(itemId) + delta)));
      message = null;
      emit();
    },
    confirm,
  };
}
