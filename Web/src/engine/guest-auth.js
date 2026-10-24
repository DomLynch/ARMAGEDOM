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

export function createGuestAuth({ url, anonKey, storage = null, fetchImpl = globalThis.fetch, now = nowS }) {
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
    if (!response.ok) throw new Error(`auth ${path}: ${response.status}`);
    return shape(await response.json(), now);
  }
  async function obtain() {
    if (session && session.expires_at - EARLY_S > now()) return session;
    if (session) {
      try {
        return keep(await post("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token }));
      } catch {
        // A refresh token the server no longer knows: fall through to a fresh guest rather than staying signed out.
      }
    }
    return keep(await post("/auth/v1/signup", {}));
  }
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
      if (!token) return null;
      const query = new URLSearchParams({ provider: "google", skip_http_redirect: "true", redirect_to: redirectTo });
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
    // After Google sends the player back, the session arrives in the URL hash (#access_token=...&refresh_token=...). Takes it,
    // and returns true so the caller can clean the hash from the address bar.
    takeRedirect(hash) {
      const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
      const body = {
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
        expires_in: params.get("expires_in"),
        expires_at: Number(params.get("expires_at")) || undefined,
        user: { is_anonymous: false },
      };
      const next = shape(body, now);
      if (!next) return false;
      keep({ ...next, user_id: session?.user_id ?? next.user_id });
      return true;
    },
    signOut() {
      keep(null);
    },
  };
}
