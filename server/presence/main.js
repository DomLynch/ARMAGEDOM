// node server/presence/main.js: the presence service. OFF unless ARMA_PRESENCE=1, so nothing listens by accident (a kill flag, as in Origins).
// Binds 127.0.0.1:8894 (the writer is 8891; Frankendom uses 8787, 8788 and 8793; 8892 is taken by a static preview server on the VPS). Keys come from the environment, never from the repo:
//   SUPABASE_URL        https://<ref>.supabase.co
//   SUPABASE_ANON_KEY   the publishable key, used only to ask /auth/v1/user who a token belongs to
//   ARMA_INTERNAL_KEY   shared with the writer (its /internal/hits and /internal/location); presence holds no database credential
//   ARMA_AREA_DATA      path to the JSON that Web/scripts/area-presence-rows.mjs writes ({ version, maxSpeedCmPerS, areas })
//   ARMA_AREA_CONTENT   optional path to area-content.json (knockback allowance, weapon caps; default Web/public/world/area-content.json)
//   WRITER_URL          optional, default http://127.0.0.1:8891
//   PRESENCE_ORIGINS    optional comma list of allowed web origins (default https://playarmagedom.com); PRESENCE_DEV=1 adds http://localhost[:port]
import fs from "node:fs";
import { loadAreaRows } from "./area-rules.js";
import { weaponCaps } from "./caps.js";
import { presenceLimits } from "./limits.js";
import { firstName } from "./names.js";
import { createPresence } from "./server.js";
import { writerClient } from "./writer-client.js";

if (process.env.ARMA_PRESENCE !== "1") {
  console.log("presence: OFF (set ARMA_PRESENCE=1 to start); nothing is listening");
  process.exit(0);
}
const need = (name) => process.env[name] || (() => { throw new Error(`set ${name}`); })();
const host = process.env.PRESENCE_HOST ?? "127.0.0.1",
  port = Number(process.env.PRESENCE_PORT ?? 8894),
  tickMs = Number(process.env.PRESENCE_TICK_MS ?? 100);
if (host !== "127.0.0.1" && process.env.ARMA_ALLOW_PUBLIC !== "1") throw new Error("presence binds 127.0.0.1 only");

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const rules = loadAreaRows(readJson(need("ARMA_AREA_DATA")));
const content = readJson(process.env.ARMA_AREA_CONTENT ?? new URL("../../Web/public/world/area-content.json", import.meta.url));
const limits = presenceLimits(rules, content);
const writer = writerClient({ baseUrl: process.env.WRITER_URL ?? "http://127.0.0.1:8891", key: need("ARMA_INTERNAL_KEY") });
const url = need("SUPABASE_URL"),
  anon = need("SUPABASE_ANON_KEY");
const verify = async (token) => {
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id, name: firstName(user) } : null; // only the first name is kept; the rest of the profile is dropped here
  } catch {
    return null;
  }
};

// Only the game's own site may open a socket. PRESENCE_ORIGINS (comma list) replaces the default; PRESENCE_DEV=1 also allows http://localhost.
const allowedOrigins = process.env.PRESENCE_ORIGINS ? process.env.PRESENCE_ORIGINS.split(",").map((s) => s.trim()) : ["https://playarmagedom.com"];
const presence = createPresence({ rules, limits, verify, weaponCaps: weaponCaps(content), sendHits: writer.sendHits, sendLocation: writer.sendLocation, allowedOrigins, devOrigins: process.env.PRESENCE_DEV === "1", log: console.log });
presence.server.listen(port, host, () => console.log(`presence listening on ${host}:${port}, layout ${rules.version}, push ${limits.impulseCm} cm`));
let ticking = false; // a slow writer must not stack ticks up
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await presence.tick();
  } catch (error) {
    console.error(`presence tick failed: ${error?.message}`);
  } finally {
    ticking = false;
  }
}, tickMs);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    presence.close().then(() => process.exit(0));
  });
