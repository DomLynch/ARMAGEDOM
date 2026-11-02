// Validators for the presence client (presenceClient.json: engine/presence-client.js and engine/remote-players.js) and the guest sign-in
// (guestAuth.json: engine/guest-auth.js). They live here so the loader (engine/game-data.js) stays under its size limit; game-data.js
// re-exports them and imports the JSON itself. Transport pacing and sign-in timing only: nothing here changes the game state.
import { closed } from "./content-schema.js";
import { count, fail } from "./game-data-checks.js";

export function validatePresenceClient(d) {
  closed(d, [
    "schema_version",
    "locIntervalMs",
    "jumpCmPerS",
    "interpDelayMs",
    "facingMinMetres",
    "maxNameLength",
    "movingMetresPerSecond",
  ]);
  // The server allows 25 ms between loc messages; the jump speed must stay above the server's own speed cap (650) so a real step is never a jump.
  count("presenceClient", "locIntervalMs", d.locIntervalMs, 25, 1000);
  count("presenceClient", "jumpCmPerS", d.jumpCmPerS, 650, 5000);
  count("presenceClient", "interpDelayMs", d.interpDelayMs, 0, 1000);
  count("presenceClient", "maxNameLength", d.maxNameLength, 1, 64);
  for (const [name, min, max] of [["facingMinMetres", 0.001, 1], ["movingMetresPerSecond", 0.01, 10]])
    if (!Number.isFinite(d[name]) || d[name] < min || d[name] > max) fail("presenceClient", `${name} must be ${min} to ${max}`);
}

export function validateGuestAuth(d) {
  closed(d, ["schema_version", "linkTtlSeconds", "fallbackExpiresInSeconds", "nonceBytes", "verifierBytes"]);
  count("guestAuth", "linkTtlSeconds", d.linkTtlSeconds, 30, 86400);
  count("guestAuth", "fallbackExpiresInSeconds", d.fallbackExpiresInSeconds, 60, 86400);
  // A PKCE verifier and a link nonce must stay unguessable: at least 16 random bytes, and RFC 7636 caps a verifier at 96 bytes.
  count("guestAuth", "nonceBytes", d.nonceBytes, 16, 64);
  count("guestAuth", "verifierBytes", d.verifierBytes, 32, 96);
}
