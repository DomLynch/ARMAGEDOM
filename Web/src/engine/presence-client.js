// Presence client (W2): the phone's side of Backend's presence protocol (server/presence/server.js, "arma.v1").
//   connect   new WebSocket(url, ["arma.v1", "token.<access token>"])      the token rides in the subprotocol, never in the URL
//   send      {t:"join", area, x?, z?} first, then {t:"loc", x, z} (integer centimetres, the area's frame), {t:"travel", to}
//   receive   welcome {id, area, x, z, arrival}, state {tick, players:[{id,x,z}]}, refuse {reason}, spawn / hit-result (W3, passed on)
// Presentation and transport only: the phone still moves itself, and nothing here can change the game state. The module is OFF
// unless presenceConfig() says so, and it never touches the DOM, THREE or the game; the caller feeds it positions and reads events.
import { GAME_DATA } from "./game-data.js";

export const PRESENCE_PROTOCOL = "arma.v1";
export const CLOSE_REPLACED = 4010;
export const LOC_INTERVAL_MS = 80; // at most 12.5 loc messages a second while moving (the server allows 40)
const JUMP_CM_PER_S = 700; // above the server's 650 and the game's top speed (sprint and roll, 520): see `jumped` below
const JUMP_SLACK_CM = 100;
// Reconnect delays are data (data/world.json presenceBackoffMs, capped at its last entry), never a retry storm.
const retryDelays = () => GAME_DATA.world.presenceBackoffMs;
const isClosedCode = (code) => GAME_DATA.world.closedCloseCodes.includes(code);
const isClosedReason = (reason) => GAME_DATA.world.closedRefuseReasons.includes(reason);

export const toCm = (metres) => Math.round(metres * 100);
export const fromCm = (cm) => cm / 100;

// On by default, but only ever started after the server's status read says the world is open (world-gate.js); ?world=0 turns it off for
// that page load. With no token source yet the client stays offline and retries on the capped backoff below: harmless.
// The endpoint is FIXED to `wss://<page origin>/arma/ws` (Deploy routes it to the presence service). The page URL can never choose
// it, because the access token travels to it: a link carrying ?presenceUrl=wss://elsewhere would hand the token to a stranger. The
// only override is for local development (`dev`, import.meta.env.DEV of the dev server) and only to this machine.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isDev = () => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
};
export function localDevUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "ws:" || url.protocol === "wss:") && LOCAL_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}
export function presenceConfig({ search = "", location = null, dev = isDev() } = {}) {
  const params = new URLSearchParams(search);
  // ON by default; the server decides whether the world is open (world-gate.js). ?world=0 is a diagnostic OFF switch for this page
  // load only (nothing is remembered, and the old ?world=1 / ?presence= flags no longer exist).
  if (params.get("world") === "0") return null;
  if (dev && params.has("presenceUrl")) {
    const local = localDevUrl(params.get("presenceUrl"));
    if (local) return { url: local };
  }
  if (!location?.host) return null;
  return { url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/arma/ws` };
}

/**
 * url: the WebSocket endpoint; getToken(): Promise<string|null> (null means "no session yet": stay offline);
 * WebSocketImpl: the constructor (globalThis.WebSocket in the browser); now(): ms clock; setTimer/clearTimer for retries.
 * Events (on(type, fn)): "open", "close", "welcome", "state", "refuse", "spawn", "hit-result".
 */
export function createPresenceClient({
  url,
  getToken,
  WebSocketImpl = globalThis.WebSocket,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
}) {
  const listeners = new Map();
  const emit = (type, payload) => {
    for (const fn of listeners.get(type) ?? []) fn(payload);
  };
  let socket = null,
    wanted = null, // { area, x, z } the area the game is in: what a (re)connect joins
    joined = false,
    id = null,
    area = null,
    lastSent = null,
    lastSentAt = -Infinity,
    attempt = 0,
    retryTimer = null,
    stopped = false,
    closedForGood = false, // the server closed the world to this account: no more attempts from this client
    connecting = false;

  const send = (message) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };

  async function connect() {
    if (stopped || closedForGood || connecting || socket) return;
    connecting = true;
    let token = null;
    try {
      token = await getToken();
    } catch {
      token = null;
    }
    connecting = false;
    if (stopped) return;
    if (!token || typeof token !== "string") return retry();
    const ws = new WebSocketImpl(url, [PRESENCE_PROTOCOL, `token.${token}`]);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      emit("open");
      if (wanted) send({ t: "join", area: wanted.area, x: wanted.x, z: wanted.z });
    };
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message || typeof message.t !== "string") return;
      if (message.t === "welcome") {
        joined = true;
        id = message.id;
        area = message.area;
        lastSent = { x: message.x, z: message.z };
        lastSentAt = now();
        if (wanted) wanted = { area, x: message.x, z: message.z };
      }
      // The server says the world is closed to this account (or the token is refused): stop for good until the caller starts over.
      if (message.t === "refuse" && isClosedReason(message.reason)) closeForGood();
      emit(message.t, message);
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = null;
      joined = false;
      id = null;
      emit("close", { code: event?.code });
      // A replaced session (the same account connected elsewhere) must not fight its replacement; a closed/auth code stops retries.
      if (isClosedCode(event?.code)) closeForGood();
      else if (event?.code !== CLOSE_REPLACED && !closedForGood) retry();
    };
    ws.onerror = () => {};
  }

  // The server refuses a loc that moves faster than a player can (520 cm/s x 1.25 + a push), and a refused loc never moves its copy of me.
  // So a real jump inside one area (Retry, respawn, a position the game set) would stay refused for distance / 6.5 m/s seconds, and the
  // others would see me frozen, then jump. Running is 5.2 m/s (41.6 cm per loc), so anything past 7 m/s plus a metre cannot be a step:
  // start over at the new position, which the server accepts if walkable.
  const jumped = (x, z, at) =>
    !!lastSent && Math.hypot(x - lastSent.x, z - lastSent.z) > (JUMP_CM_PER_S * Math.max(at - lastSentAt, LOC_INTERVAL_MS)) / 1000 + JUMP_SLACK_CM;
  function rejoin(x, z) {
    if (!wanted) return false;
    wanted = { area: wanted.area, x, z };
    const ws = socket;
    socket = null;
    joined = false;
    id = null;
    attempt = 0;
    ws?.close?.();
    connect();
    return true;
  }

  function closeForGood() {
    if (closedForGood) return;
    closedForGood = true;
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
    emit("closed");
  }

  function retry() {
    if (stopped || closedForGood || retryTimer !== null) return;
    const delays = retryDelays(),
      delay = delays[Math.min(attempt, delays.length - 1)];
    attempt++;
    retryTimer = setTimer(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    // Enter an area: (x, z) in metres is the saved or current position, trusted by the server only if walkable.
    join(areaId, position = null) {
      wanted = { area: areaId, x: position ? toCm(position.x) : undefined, z: position ? toCm(position.z) : undefined };
      joined = false;
      if (socket?.readyState === 1) send({ t: "join", area: wanted.area, x: wanted.x, z: wanted.z });
      else connect();
    },
    // Start over on a fresh socket, joining `areaId` at `position`: for when the server refused a travel and my layer no longer
    // matches the area the phone is in.
    // After the server closed the world to this account and a later status read says it is open again: try once more from the start.
    reopen() {
      if (!closedForGood || stopped) return;
      closedForGood = false;
      attempt = 0;
      if (wanted) connect();
    },
    get closed() {
      return closedForGood;
    },
    reconnect(areaId, position = null) {
      wanted = { area: areaId, x: position ? toCm(position.x) : undefined, z: position ? toCm(position.z) : undefined };
      const ws = socket;
      socket = null;
      joined = false;
      id = null;
      attempt = 0;
      ws?.close?.();
      connect();
    },
    // Called every frame with the player's position in metres. Sends a loc when it changed, at most every LOC_INTERVAL_MS, so
    // the resting position goes out within one interval of the player stopping.
    report(position, at = now()) {
      if (!joined) return false;
      const x = toCm(position.x),
        z = toCm(position.z);
      if (lastSent && lastSent.x === x && lastSent.z === z) return false;
      if (at - lastSentAt < LOC_INTERVAL_MS) return false;
      if (jumped(x, z, at)) return rejoin(x, z);
      send({ t: "loc", x, z });
      lastSent = { x, z };
      lastSentAt = at;
      if (wanted) wanted = { area: wanted.area, x, z };
      return true;
    },
    // Send the current position now, ignoring the 80 ms throttle (the server allows 40 messages a second). Used right before a
    // travel: the server checks the exit zone against the LAST accepted loc, which the throttle may not have sent yet.
    flush(position, at = now()) {
      if (!joined) return false;
      const x = toCm(position.x),
        z = toCm(position.z);
      if (lastSent && lastSent.x === x && lastSent.z === z) return false;
      send({ t: "loc", x, z });
      lastSent = { x, z };
      lastSentAt = at;
      if (wanted) wanted = { area: wanted.area, x, z };
      return true;
    },
    // Leave through an exit zone the player is standing in; the server answers with a welcome for the new area.
    travel(to) {
      joined = false;
      send({ t: "travel", to });
    },
    sendHit(row) {
      send({ t: "hit", ...row });
    },
    get id() {
      return id;
    },
    get area() {
      return area;
    },
    get joined() {
      return joined;
    },
    get connected() {
      return socket?.readyState === 1;
    },
    close() {
      stopped = true;
      if (retryTimer !== null) clearTimer(retryTimer);
      retryTimer = null;
      const ws = socket;
      socket = null;
      joined = false;
      ws?.close?.();
    },
  };
}
