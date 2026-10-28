// The ONE place the client talks to the market server (docs/MARKET-CONTRACT.md): four Supabase rpc functions over plain REST, named in
// data/shops.json (api.calls). The UI and the shop controller only ever see the shapes below, so a mock backs the tests and the real
// rpc swaps in without touching them. Nothing here throws: every call answers { ok, ... } and a failure carries an `error` code.
//   inventory()                          -> { ok, items: [{ itemId, qty }] }
//   stock(shopId)                        -> { ok, rows: [{ itemId, name, buyPrice|null, sellPrice|null }] }
//   buy(shopId, itemId, qty, requestId)  -> { ok, cash, items: [{ itemId, qty }], replayed, error? }   (sell is the same)
// buyPrice is what the PLAYER pays, sellPrice what the player is paid; null means the stall does not offer that side. An answer with
// `offline: true` never reached a verdict (network, timeout, 5xx): the caller keeps the request id so a retry replays safely.
import { GAME_DATA } from "./game-data.js";

const items = (list) => (Array.isArray(list) ? list.map((r) => ({ itemId: r.item_id, qty: r.qty })) : []);
const price = (v) => (Number.isFinite(v) ? v : null);
const first = (body) => (Array.isArray(body) ? body[0] : body);

export function createMarketApi({ url, anonKey, getToken, fetchImpl = globalThis.fetch, tuning = GAME_DATA.shops.api }) {
  if (!url || !anonKey || typeof getToken !== "function") return null;
  async function call(name, args) {
    const token = await getToken();
    if (!token) return { ok: false, error: "signin" };
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), tuning.timeoutMs);
    try {
      const response = await fetchImpl(`${url}${tuning.rpcPath}${tuning.calls[name]}`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(args),
        signal: abort.signal,
      });
      const body = await response.json().catch(() => null);
      if (response.ok) return { ok: true, body };
      if (tuning.authStatuses.includes(response.status)) return { ok: false, error: "signin" };
      return { ok: false, error: body?.message ?? body?.error ?? "refused", offline: response.status >= tuning.serverErrorFrom };
    } catch {
      return { ok: false, error: "offline", offline: true };
    } finally {
      clearTimeout(timer);
    }
  }
  const trade = async (name, shopId, itemId, qty, requestId) => {
    const answer = await call(name, { shop_id: shopId, item_id: itemId, qty, request_id: requestId });
    if (!answer.ok) return answer;
    const reply = first(answer.body);
    if (!reply || typeof reply !== "object") return { ok: false, error: "refused" };
    return {
      ok: reply.ok === true,
      cash: Number.isFinite(reply.cash) ? reply.cash : null,
      items: items(reply.inventory),
      replayed: reply.replayed === true,
      error: reply.ok === true ? undefined : (reply.error ?? "refused"),
    };
  };
  return {
    async inventory() {
      const answer = await call("inventory", {});
      return answer.ok ? { ok: true, items: items(answer.body) } : answer;
    },
    async stock(shopId) {
      const answer = await call("stock", { shop_id: shopId });
      if (!answer.ok) return answer;
      const rows = Array.isArray(answer.body) ? answer.body : [];
      return {
        ok: true,
        rows: rows.map((r) => ({ itemId: r.item_id, name: r.name, buyPrice: price(r.buy_price), sellPrice: price(r.sell_price) })),
      };
    },
    buy: (shopId, itemId, qty, requestId) => trade("buy", shopId, itemId, qty, requestId),
    sell: (shopId, itemId, qty, requestId) => trade("sell", shopId, itemId, qty, requestId),
  };
}
