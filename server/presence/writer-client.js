// Presence's only way to the database: the writer's internal routes on 127.0.0.1:8891, with the shared key. Presence holds no database
// credential of its own. A failed call throws; the caller (server.js) counts it and never retries a hit batch, because a retry could
// apply damage twice.
export function writerClient({ baseUrl, key, fetchImpl = fetch, timeoutMs = 2000 }) {
  if (!baseUrl || !key) throw new Error("writerClient: baseUrl and key are required");
  const post = async (path, body) => {
    const res = await fetchImpl(baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arma-internal-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`writer ${path} answered ${res.status}`);
    return res.json();
  };
  return {
    /** rows: [{ account, token, weapon, applied, hits }] -> one result per row, in order. */
    sendHits: (rows) => post("/internal/hits", { batch: rows }),
    /** account -> { enabled, open, allowed }: may this verified account be in the world right now. */
    status: (account) => post("/internal/status", { account }),
    /** { account, area, x, z, atMs } -> { character, stored }. */
    sendLocation: (report) => post("/internal/location", report),
  };
}
