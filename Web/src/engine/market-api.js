// The ONE place the client talks to the market server (docs/MARKET-CONTRACT.md): the writer's four routes, POST <baseUrl>/<op> with the
// Bearer token, named in data/shops.json (api.calls). The UI and the shop controller only ever see the shapes below, so a mock backs the
// tests and the transport can change without touching them. Nothing here throws: every call answers { ok, ... } and a failure carries an
// `error` code (the writer's own, e.g. insufficient-cash, token, rate-limited, or "offline").
//   inventory()                          -> { ok, items: [{ itemId, qty }], cash, bank, ceiling }   (the server's stored balances, or null)
//   stock(shopId)                        -> { ok, rows: [{ itemId, name, buyPrice|null, sellPrice|null }] }
//   buy(shopId, itemId, qty, requestId)  -> { ok, delta, items: [{ itemId, qty }], replayed, error? }   (sell is the same)
// buyPrice is what the PLAYER pays, sellPrice what the player receives; null means the stall does not offer that side. delta is the signed
// cash change to apply to the run's carried cash. An answer with `offline: true` never reached a verdict (network, timeout, 5xx): the
// caller keeps the request id so a retry replays safely (a replayed answer's items are the first call's snapshot).
import { GAME_DATA } from "./game-data.js";

const items = (list) => (Array.isArray(list) ? list.map((r) => ({ itemId: r.item_id, qty: r.qty })) : []);
const price = (v) => (Number.isFinite(v) ? v : null);

export function createMarketApi({ baseUrl, getToken, fetchImpl = globalThis.fetch, tuning = GAME_DATA.shops.api }) {
  if (!baseUrl || typeof getToken !== "function") return null;
  async function call(name, args) {
    const token = await getToken();
    if (!token) return { ok: false, error: "signin" };
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), tuning.timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/${tuning.calls[name]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(args),
        signal: abort.signal,
      });
      const body = await response.json().catch(() => null);
      if (response.ok) return { ok: true, body };
      if (tuning.authStatuses.includes(response.status)) return { ok: false, error: "signin" };
      return { ok: false, error: body?.error ?? "refused", offline: response.status >= tuning.serverErrorFrom };
    } catch {
      return { ok: false, error: "offline", offline: true };
    } finally {
      clearTimeout(timer);
    }
  }
  const trade = async (name, shopId, itemId, qty, requestId) => {
    const answer = await call(name, { shop_id: shopId, item_id: itemId, qty, request_id: requestId });
    if (!answer.ok) return answer;
    const reply = answer.body;
    if (!reply || typeof reply !== "object") return { ok: false, error: "refused" };
    return {
      ok: reply.ok === true,
      delta: Number.isFinite(reply.delta) ? reply.delta : 0,
      items: items(reply.inventory),
      replayed: reply.replayed === true,
      error: reply.ok === true ? undefined : (reply.error ?? "refused"),
    };
  };
  return {
    async inventory() {
      const answer = await call("inventory", {});
      if (!answer.ok) return answer;
      const { inventory, cash, bank, ceiling } = answer.body ?? {};
      return { ok: true, items: items(inventory), cash: price(cash), bank: price(bank), ceiling: price(ceiling) };
    },
    async stock(shopId) {
      const answer = await call("stock", { shop_id: shopId });
      if (!answer.ok) return answer;
      const rows = Array.isArray(answer.body?.stock) ? answer.body.stock : [];
      return {
        ok: true,
        rows: rows.map((r) => ({ itemId: r.item_id, name: r.name, buyPrice: price(r.buy_price), sellPrice: price(r.sell_price) })),
      };
    },
    buy: (shopId, itemId, qty, requestId) => trade("buy", shopId, itemId, qty, requestId),
    sell: (shopId, itemId, qty, requestId) => trade("sell", shopId, itemId, qty, requestId),
  };
}
