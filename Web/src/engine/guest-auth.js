// Guest-first sign-in for the live world (Phase A, item 3): Play joins as a Supabase ANONYMOUS user straight away, no sign-in wall.
// "Sign in with Google to keep progress" later LINKS a Google identity to that same user (same user id, so nothing is lost).
// Plain REST against Supabase Auth (no SDK). Presentation of the token only: this module never touches the game state.
//   POST {url}/auth/v1/signup                     {}      -> anonymous session   (anonymous sign-ins must be enabled on the project)
//   POST {url}/auth/v1/token?grant_type=refresh_token     -> new session
//   GET  {url}/auth/v1/user/identities/authorize?provider=google&skip_http_redirect=true&redirect_to=...  (Bearer) -> { url }
// The project URL and the PUBLISHABLE (anon) key are passed in; nothing secret ever lives here.
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
    expires_at: Number.isFinite(body.expires_at) ? body.expires_at : now() + (Number(body.expires_in) || 3600),
    user_id: body.user?.id ?? null,
    anonymous: body.user?.is_anonymous !== false,
  };
}

// A Google link is only accepted while this TAB has one pending: a nonce is stored in sessionStorage before the player leaves for
// Google and travels back in the redirect URL (?link=<nonce>). A link someone else sends (a hash with tokens and no nonce) is
// ignored, so a stranger cannot swap their account into the player's game.
export const LINK_KEY = "armagedom.world.link.v1";
const LINK_TTL_S = 600;
const browserSessionStorage = () => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};
const newNonce = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};
// 400 / 401 / 403 from the refresh endpoint mean the server definitively refused this refresh token; 5xx and network errors do not.
const rejected = (error) => [400, 401, 403].includes(error?.status);

export function createGuestAuth({
  url,
  anonKey,
  storage = null,
  linkStorage = browserSessionStorage(),
  fetchImpl = globalThis.fetch,
  now = nowS,
  nonce = newNonce,
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
      } catch {
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
        back = new URL(redirectTo);
      back.searchParams.set("link", link);
      const query = new URLSearchParams({ provider: "google", skip_http_redirect: "true", redirect_to: back.href });
      try {
        linkStorage.setItem(LINK_KEY, JSON.stringify({ nonce: link, userId: session.user_id, at: now() }));
      } catch {
        return null;
      }
      try {
        const response = await fetchImpl(`${url}/auth/v1/user/identities/authorize?${query}`, {
          headers: headers({ Authorization: `Bearer ${token}` }),
        });
        if (!response.ok) return null;
        const body = await response.json();
        return typeof body?.url === "string" && body.url.startsWith("https://") ? body.url : null;
      } catch {
        return null;
      }
    },
    // After Google sends the player back, the session arrives in the URL hash (#access_token=...&refresh_token=...). It is taken
    // only if (1) this tab started a link that is still pending, (2) the return URL carries that link's nonce, and (3) the new token
    // belongs to the SAME user id as the guest being linked (linking keeps the id). Anything else is discarded and the current
    // session is kept. Resolves true when the session was replaced; the caller cleans the address bar either way.
    async takeRedirect(hash, search = "") {
      const link = readLink();
      clearLink(); // one-time, whatever happens next
      if (!link || !link.nonce || now() - link.at > LINK_TTL_S) return false;
      if (new URLSearchParams(String(search ?? "")).get("link") !== link.nonce) return false;
      const params = new URLSearchParams(String(hash ?? "").replace(/^#/, "")),
        next = shape(
          {
            access_token: params.get("access_token"),
            refresh_token: params.get("refresh_token"),
            expires_in: params.get("expires_in"),
            expires_at: Number(params.get("expires_at")) || undefined,
            user: { is_anonymous: false },
          },
          now,
        );
      if (!next || !link.userId) return false;
      try {
        const response = await fetchImpl(`${url}/auth/v1/user`, {
          headers: headers({ Authorization: `Bearer ${next.access_token}` }),
        });
        if (!response.ok) return false;
        const user = await response.json();
        if (user?.id !== link.userId) return false;
        keep({ ...next, user_id: user.id, anonymous: user.is_anonymous === true });
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
