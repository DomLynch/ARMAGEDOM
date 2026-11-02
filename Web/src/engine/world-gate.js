// The server switch for the online world. The world client is ON by default, but nothing online starts (no guest signup, no presence
// socket, no save traffic) until ONE cheap status read says the world is open: GET <statusPath> -> { enabled, open } (Backend's kill
// switch and open-access flags). While it says no, or cannot be read, the game is exactly the single-player game and makes no further
// /arma request. A closed world is looked at again only when the page is shown again, never faster than recheckMinMs. The path, the
// timeout and the interval are data (data/world.json).
import { GAME_DATA } from "./game-data.js";

export function createWorldGate({
  baseUrl = "",
  fetchImpl = globalThis.fetch,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  tuning = GAME_DATA.world,
} = {}) {
  const listeners = new Set();
  let open = false,
    checkedAt = -Infinity,
    inflight = null,
    reads = 0;

  async function read() {
    if (typeof fetchImpl !== "function") return false;
    const controller = typeof AbortController === "function" ? new AbortController() : null,
      timer = controller ? setTimeout(() => controller.abort(), tuning.statusTimeoutMs) : null;
    try {
      const response = await fetchImpl(`${baseUrl}${tuning.statusPath}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) return false;
      const body = await response.json();
      return body?.enabled === true && body?.open === true && body?.allowed !== false;
    } catch {
      return false; // unreachable, timed out or not JSON: the world stays off, quietly
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  return {
    // One status read, at most one per recheckMinMs unless `force`; concurrent calls share the same request.
    check({ force = false } = {}) {
      if (inflight) return inflight;
      if (!force && now() - checkedAt < tuning.recheckMinMs) return Promise.resolve(open);
      inflight = read()
        .then((next) => {
          checkedAt = now();
          reads++;
          const changed = next !== open;
          open = next;
          if (changed) for (const fn of [...listeners]) fn(open);
          return open;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    // fn(open) runs whenever a status read changes the answer.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get open() {
      return open;
    },
    // How many real status reads have completed (a throttled check() does not count): lets a caller tell a fresh answer from a cached one.
    get reads() {
      return reads;
    },
  };
}
