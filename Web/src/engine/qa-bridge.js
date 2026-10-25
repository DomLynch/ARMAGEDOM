// A read-only window on the running game for local QA drivers (headless Chromium against a local stack): window.__qa. It exists only on
// a loopback origin (localhost, 127.0.0.1, [::1], *.localhost) AND with ?qa=1 in the address, so it can never appear on playarmagedom.com
// or any other real host. It changes nothing: getters return the live objects the page already holds, plus the page's own errors.
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]|[^.]+\.localhost)$/;
const MAX_ERRORS = 50;

export function qaAllowed(location) {
  try {
    return LOOPBACK.test(location.hostname) && new URLSearchParams(location.search).get("qa") === "1";
  } catch {
    return false;
  }
}

/**
 * location/target: the page's location and window; view: getters for { session, game, world, presence, loaded, areaId }.
 * Returns the installed object, or null when the page is not a local QA page. console.error and uncaught errors are kept (the first
 * 300 characters, at most 50) in `errors`; console.error still reaches the real console.
 */
export function installQaBridge({ location, target, view, consoleObject = globalThis.console }) {
  if (!qaAllowed(location) || target.__qa) return null;
  const errors = [];
  const keep = (type, detail) => {
    if (errors.length < MAX_ERRORS)
      errors.push({ type, message: String(detail?.message ?? detail ?? "").slice(0, 300), at: Math.round(performance.now()) });
  };
  const original = consoleObject.error?.bind(consoleObject);
  if (original)
    consoleObject.error = (...args) => {
      keep("console.error", args.map((a) => a?.message ?? a).join(" "));
      original(...args);
    };
  target.addEventListener("error", (event) => keep("error", event.error ?? event.message));
  target.addEventListener("unhandledrejection", (event) => keep("unhandledrejection", event.reason));
  const qa = {
    get session() {
      return view.session();
    },
    get game() {
      return view.game();
    },
    get world() {
      return view.world();
    },
    get errors() {
      return errors.map((e) => ({ ...e }));
    },
    // One JSON-safe reading: where I am, how many other players are on screen, whether the online world is up.
    state() {
      const game = view.game(),
        presence = view.presence();
      return {
        loaded: view.loaded(),
        area: view.areaId() ?? null,
        pos: game?.player?.pos ? { x: game.player.pos.x, z: game.player.pos.z } : null,
        hp: game?.player?.hp ?? null,
        time: game?.time ?? null,
        remotes: presence?.remotes ?? 0,
        presence: presence ? { id: presence.client.id ?? null, joined: !!presence.client.joined } : null,
        errors: errors.length,
      };
    },
  };
  Object.defineProperty(target, "__qa", { value: Object.freeze(qa), enumerable: false });
  return qa;
}
