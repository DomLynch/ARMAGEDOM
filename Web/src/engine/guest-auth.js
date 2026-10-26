// Guest-first sign-in for the live world (Phase A, item 3): Play joins as a Supabase ANONYMOUS user straight away, no sign-in wall.
// "Sign in with Google to keep progress" later LINKS a Google identity to that same user (same user id, so nothing is lost).
// Plain REST against Supabase Auth (no SDK). Presentation of the token only: this module never touches the game state.
//   POST {url}/auth/v1/signup                     {}      -> anonymous session   (anonymous sign-ins must be enabled on the project)
//   POST {url}/auth/v1/token?grant_type=refresh_token     -> new session
//   GET  {url}/auth/v1/user/identities/authorize?provider=google&skip_http_redirect=true&redirect_to=...  (Bearer) -> { url }
// The project URL and the PUBLISHABLE (anon) key are passed in; nothing secret ever lives here.
import { GAME_DATA } from "./game-data.js";

export const SESSION_KEY = "armagedom.world.session.v1";
const EARLY_S = 60; // refresh a minute before the token really expires

const nowS = () => Math.floor(Date.now() / 1000);

function read(storage) {
  try {
    const row = JSON.parse(storage?.getItem(SESSION_KEY) ?? "null");
    return row && typeof row.access_token === "string" && typeof row.refresh_token === "string" ? row : null;
  } catch {
    return null;
  }
}
function write(storage, session) {
  try {
    if (session) storage?.setItem(SESSION_KEY, JSON.stringify(session));
    else storage?.removeItem?.(SESSION_KEY);
  } catch {
    /* Without storage the guest only lasts this page load. */
  }
}
// Supabase answers { access_token, refresh_token, expires_in, expires_at?, user: { id, is_anonymous } }.
function shape(body, now = nowS) {
  if (!body || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") return null;
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Number.isFinite(body.expires_at) ? body.expires_at : now() + (Number(body.expires_in) || GAME_DATA.guestAuth.fallbackExpiresInSeconds),
    user_id: body.user?.id ?? null,
    anonymous: body.user?.is_anonymous !== false,
  };
}

// A Google link is only accepted while this TAB has one pending: a nonce is stored in sessionStorage before the player leaves for
// Google and travels back in the redirect URL (?link=<nonce>). A link someone else sends (a hash with tokens and no nonce) is
// ignored, so a stranger cannot swap their account into the player's game.
export const LINK_KEY = "armagedom.world.link.v1";
const LINK_TTL_S = GAME_DATA.guestAuth.linkTtlSeconds;
const browserSessionStorage = () => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};
const newNonce = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(GAME_DATA.guestAuth.nonceBytes));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); // tuning-ok: two hex digits per byte
};
// PKCE: the code Google/Supabase sends back is useless without the verifier that only this tab holds, so a code an attacker puts in
// a link cannot be exchanged by (or for) anyone else. No token ever travels in the URL.
const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const newVerifier = () => base64url(globalThis.crypto.getRandomValues(new Uint8Array(GAME_DATA.guestAuth.verifierBytes)));
const challengeFor = async (verifier) =>
  base64url(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
// 400 / 401 / 403 from the refresh endpoint mean the server definitively refused this refresh token; 5xx and network errors do not.
const rejected = (error) => [400, 401, 403].includes(error?.status); // tuning-ok: HTTP status codes

export function createGuestAuth({
  url,
  anonKey,
  storage = null,
  linkStorage = browserSessionStorage(),
  fetchImpl = globalThis.fetch,
  now = nowS,
  nonce = newNonce,
  verifier = newVerifier,
  onError = null,
}) {
  if (!url || !anonKey) return null; // not configured: the live world stays offline
  let session = read(storage),
    pending = null;
  const headers = (extra = {}) => ({ apikey: anonKey, "Content-Type": "application/json", ...extra });
  const keep = (next) => {
    session = next;
    write(storage, next);
    return next;
  };
  async function post(path, body) {
    const response = await fetchImpl(`${url}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Object.assign(new Error(`auth ${path}: ${response.status}`), { status: response.status });
    return shape(await response.json(), now);
  }
  async function obtain() {
    if (session && session.expires_at - EARLY_S > now()) return session;
    if (session) {
      try {
        return keep(await post("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
      } catch (error) {
        // Only a refresh token the server definitively refuses is given up on (then a fresh guest rather than staying signed out).
        // A 5xx or a network error says nothing about the account: keep the stored session untouched and try again later.
        if (!rejected(error)) throw error;
        // Keep the refused session aside before it is replaced, so nothing is ever lost without a copy.
        try {
          storage?.setItem(`${SESSION_KEY}.previous`, JSON.stringify(session));
        } catch {
          /* Best effort. */
        }
      }
    }
    return keep(await post("/auth/v1/signup", {}));
  }
  const readLink = () => {
    try {
      return JSON.parse(linkStorage?.getItem(LINK_KEY) ?? "null");
    } catch {
      return null;
    }
  };
  const clearLink = () => {
    try {
      linkStorage?.removeItem?.(LINK_KEY);
    } catch {
      /* A pending link then simply expires. */
    }
  };
  return {
    // The access token for the presence socket; null when auth is unavailable (the client then stays offline and retries).
    async getToken() {
      try {
        pending ??= obtain().finally(() => (pending = null));
        return (await pending)?.access_token ?? null;
      } catch (error) {
        // Still null (the client stays offline and retries), but the reason is handed on: a refused signup (anonymous sign-ins off, a 422)
        // must not be a silent offline game.
        try {
          onError?.(error);
        } catch {
          /* The listener must not break sign-in. */
        }
        return null;
      }
    },
    get userId() {
      return session?.user_id ?? null;
    },
    get isGuest() {
      return session ? session.anonymous : true;
    },
    // The Google page to go to: linking keeps this guest's user id. Returns null when there is no session or no link was offered.
    async googleLinkUrl(redirectTo) {
      const token = await this.getToken();
      if (!token || !session?.user_id || !linkStorage) return null; // no tab storage means no safe way to take the return
      const link = nonce(),
        secret = verifier(),
        back = new URL(redirectTo);
      back.searchParams.set("link", link);
      try {
        const query = new URLSearchParams({
          provider: "google",
          skip_http_redirect: "true",
          redirect_to: back.href,
          code_challenge: await challengeFor(secret),
          code_challenge_method: "s256",
        });
        linkStorage.setItem(
          LINK_KEY,
          JSON.stringify({ nonce: link, verifier: secret, userId: session.user_id, at: now() }),
        );
        const response = await fetchImpl(`${url}/auth/v1/user/identities/authorize?${query}`, {
          headers: headers({ Authorization: `Bearer ${token}` }), // text-ok: HTTP authorization header
        });
        if (!response.ok) return null;
        const body = await response.json();
        return typeof body?.url === "string" && body.url.startsWith("https://") ? body.url : null;
      } catch {
        return null;
      }
    },
    // Coming back from Google the return URL carries ?link=<nonce>&code=<auth code> (PKCE: never a token in the URL, and the URL
    // hash is never read). The code is exchanged only if (1) this tab started a link that is still pending, (2) the nonce matches,
    // and (3) the session the exchange returns belongs to the SAME user id as the guest being linked (linking keeps the id). The
    // exchange needs the verifier that only this tab holds, so a code planted in someone else's link is worthless. Anything else
    // is discarded and the current session is kept. Resolves true when the session was replaced; the caller cleans the URL.
    async takeRedirect(search = "") {
      const link = readLink();
      clearLink(); // one-time, whatever happens next
      if (!link?.nonce || !link.verifier || !link.userId || now() - link.at > LINK_TTL_S) return false;
      const params = new URLSearchParams(String(search ?? "")),
        code = params.get("code");
      if (params.get("link") !== link.nonce || !code) return false;
      try {
        const next = await post("/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: link.verifier });
        if (!next || next.user_id !== link.userId) return false;
        keep({ ...next, anonymous: false });
        return true;
      } catch {
        return false;
      }
    },
    signOut() {
      keep(null);
    },
  };
}
