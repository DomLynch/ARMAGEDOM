// The ONE place the client talks to the writer about permanent safehouse upgrades: POST <baseUrl>/<op> with the Bearer token, the two route names
// in data/safehouseUpgrades.json (api.calls). Same shape as engine/market-api.js: nothing here throws, every call answers { ok, ... } and a failure
// carries an `error` code (the writer's own, e.g. insufficient-cash, token, rate-limited, or "offline"). An answer with `offline: true` never reached
// a verdict (network, timeout, 5xx): the caller keeps the request id so a retry replays safely.
//   levels()                              -> { ok, levels: [{ id, level }], cash, bank, ceiling }
//   buy(upgradeId, toLevel, requestId)    -> { ok, id, level, delta, levels: [{ id, level }], replayed, error? }
import { GAME_DATA } from "./game-data.js";

const levels = (list) => (Array.isArray(list) ? list.map((r) => ({ id: r.upgrade_id, level: r.level })) : []);
const price = (v) => (Number.isFinite(v) ? v : null);

export function createUpgradesApi({
  baseUrl,
  getToken,
  fetchImpl = globalThis.fetch,
  tuning = GAME_DATA.safehouseUpgrades.api,
}) {
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
  return {
    async levels() {
      const answer = await call("get", {});
      if (!answer.ok) return answer;
      const { upgrades, cash, bank, ceiling } = answer.body ?? {};
      return { ok: true, levels: levels(upgrades), cash: price(cash), bank: price(bank), ceiling: price(ceiling) };
    },
    async buy(upgradeId, toLevel, requestId) {
      const answer = await call("buy", { upgrade_id: upgradeId, to_level: toLevel, request_id: requestId });
      if (!answer.ok) return answer;
      const reply = answer.body;
      if (!reply || typeof reply !== "object") return { ok: false, error: "refused" };
      return {
        ok: reply.ok === true,
        id: reply.upgrade,
        level: Number.isInteger(reply.level) ? reply.level : 0,
        delta: Number.isFinite(reply.delta) ? reply.delta : 0,
        levels: levels(reply.upgrades),
        replayed: reply.replayed === true,
        error: reply.ok === true ? undefined : (reply.error ?? "refused"),
      };
    },
  };
}
