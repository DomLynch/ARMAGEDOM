// Presence client (W2): the phone's side of Backend's presence protocol (server/presence/server.js, "arma.v1").
//   connect   new WebSocket(url, ["arma.v1", "token.<access token>"])      the token rides in the subprotocol, never in the URL
//   send      {t:"join", area, x?, z?} first, then {t:"loc", x, z} (integer centimetres, the area's frame), {t:"travel", to}
//   receive   welcome {id, area, x, z, arrival}, state {tick, players:[{id,x,z}]}, refuse {reason}, spawn / hit-result (W3, passed on)
// Presentation and transport only: the phone still moves itself, and nothing here can change the game state. The module is OFF
// unless presenceConfig() says so, and it never touches the DOM, THREE or the game; the caller feeds it positions and reads events.
export const PRESENCE_PROTOCOL = "arma.v1";
export const CLOSE_REPLACED = 4010;
export const LOC_INTERVAL_MS = 80; // at most 12.5 loc messages a second while moving (the server allows 40)
const RETRY_MS = [1000, 2000, 4000, 8000];
const FLAG_KEY = "armagedom.presence.v1";

export const toCm = (metres) => Math.round(metres * 100);
export const fromCm = (cm) => cm / 100;

// Off by default. On with ?world=1 (remembered in storage; ?world=0 turns it off again; ?presence= is an alias). With the flag on and no token source
// yet the client stays offline and retries every 8 s: harmless.
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
export function presenceConfig({ search = "", storage = null, location = null, dev = isDev() } = {}) {
  const params = new URLSearchParams(search),
    read = () => {
      try {
        return storage?.getItem(FLAG_KEY) ?? null;
      } catch {
        return null;
      }
    },
    write = (value) => {
      try {
        storage?.setItem(FLAG_KEY, value);
      } catch {
        /* The flag then only lasts for this page load. */
      }
    };
  // ?world=1 is the flag; ?presence=1 stays as an alias for one release. ?world wins when both are given.
  const flag = ["world", "presence"].map((name) => params.get(name)).find((value) => value === "1" || value === "0");
  if (flag !== undefined) write(flag);
  const on = flag !== undefined ? flag === "1" : read() === "1";
  if (!on) return null;
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
    connecting = false;

  const send = (message) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };

  async function connect() {
    if (stopped || connecting || socket) return;
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
      emit(message.t, message);
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = null;
      joined = false;
      id = null;
      emit("close", { code: event?.code });
      // A replaced session (the same account connected elsewhere) must not fight its replacement.
      if (event?.code !== CLOSE_REPLACED) retry();
    };
    ws.onerror = () => {};
  }

  function retry() {
    if (stopped || retryTimer !== null) return;
    const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
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
      send({ t: "loc", x, z });
      lastSent = { x, z };
      lastSentAt = at;
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
