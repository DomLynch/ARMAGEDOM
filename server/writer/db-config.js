// The writer's Postgres pool settings. Supabase's pooler presents a chain that ends at "Supabase Root 2021 CA", which a stock host does not trust, so for a
// remote database the writer pins that one public root (certs/supabase-prod-ca-2021.crt, SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA)
// and keeps full verification on. Scoped to this pool: there is no NODE_TLS_REJECT_UNAUTHORIZED anywhere, and nothing here ever sets rejectUnauthorized false.
import fs from "node:fs";

export const DEFAULT_CA = new URL("./certs/supabase-prod-ca-2021.crt", import.meta.url);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * connectionString -> pg.Pool options. A remote host must ask for TLS (sslmode=require|verify-ca|verify-full) and gets { ca, rejectUnauthorized: true };
 * a loopback host may use sslmode=disable (the local end-to-end proof). The sslmode parameter is removed from the string because pg would otherwise
 * let it replace the ssl object below.
 */
export function poolConfig(connectionString, { caFile = DEFAULT_CA, max = 4 } = {}) {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode") ?? "disable";
  url.searchParams.delete("sslmode");
  const local = LOCAL_HOSTS.has(url.hostname);
  if (!["disable", "require", "verify-ca", "verify-full"].includes(mode)) throw new Error(`DATABASE_URL: unsupported sslmode ${mode}`);
  if (mode === "disable") {
    if (!local) throw new Error("DATABASE_URL: a remote database needs sslmode=require (TLS is never optional off the box)");
    return { connectionString: url.toString(), max };
  }
  return { connectionString: url.toString(), max, ssl: { ca: fs.readFileSync(caFile, "utf8"), rejectUnauthorized: true } };
}
