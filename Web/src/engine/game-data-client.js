// Validators for the small client-side data files (diagnostics, renderBudget, saveClient). They live here so the loader (engine/game-data.js)
// stays under its size limit; game-data.js re-exports them and still imports every JSON file itself (the as-data gate allows no other importer).
import { closed } from "./content-schema.js";
import { count, fail } from "./game-data-checks.js";
import { validateMovementTrace } from "./movement-trace-schema.js";

export function validateDiagnostics(d) {
  closed(d, ["schema_version", "statsFramesPerLine", "loadStallMs", "movementTrace"]);
  validateMovementTrace(d.movementTrace);
  count("diagnostics", "statsFramesPerLine", d.statsFramesPerLine, 1, 100000);
  // Enter shows "Retry loading" when no model has finished loading for this long (a stalled connection), instead of waiting forever.
  count("diagnostics", "loadStallMs", d.loadStallMs, 5000, 600000);
}

// A provisional ceiling for what the other players may cost the renderer (measured with scripts/remote-cost.mjs on a real GPU;
// engine/render-budget.js compares a measurement to it). Dom's phone is the judge; these numbers stop the cost creeping meanwhile.
export function validateRenderBudget(d) {
  closed(d, ["schema_version", "provisional", "westminster", "perRemote"]);
  if (typeof d.provisional !== "boolean") fail("renderBudget", "provisional must be true or false");
  closed(d.westminster, ["remotes", "maxDrawCalls", "maxTriangles"]);
  count("renderBudget", "westminster.remotes", d.westminster.remotes, 1, 64);
  count("renderBudget", "westminster.maxDrawCalls", d.westminster.maxDrawCalls, 1, 10000);
  count("renderBudget", "westminster.maxTriangles", d.westminster.maxTriangles, 1, 10000000);
  closed(d.perRemote, ["maxDrawCalls", "maxTriangles"]);
  count("renderBudget", "perRemote.maxDrawCalls", d.perRemote.maxDrawCalls, 0, 1000);
  count("renderBudget", "perRemote.maxTriangles", d.perRemote.maxTriangles, 0, 1000000);
}

export function validateSaveClient(d) {
  closed(d, [
    "schema_version",
    "minSaveIntervalMs",
    "staleSeqRetries",
    "characterName",
    "bootSyncWaitMs",
    "bucketBurst",
    "bucketRefillMs",
    "bucketReserve",
    "retryFloorMs",
    "keepaliveMaxBytes",
    "claimBurst",
    "claimRefillMs",
    "claimRetries",
  ]);
  // The writer's claim_pickup bucket (server/data/rate-limits.json): the client spaces its cash claims to it and retries a refused one
  // (a 429, or a kill-tier rate-limit) up to `claimRetries` times, so a crowd of kills is credited in full instead of dropped.
  count("saveClient", "claimBurst", d.claimBurst, 1, 100);
  count("saveClient", "claimRefillMs", d.claimRefillMs, 100, 600000);
  count("saveClient", "claimRetries", d.claimRetries, 0, 20);
  // Browsers cap the body of a keepalive request at 64 KiB in all; the page-hide send stays under this, else it is a plain request.
  count("saveClient", "keepaliveMaxBytes", d.keepaliveMaxBytes, 1000, 65536);
  // The shortest wait before a kept record is sent again after a refused or failed send, whatever the writer's Retry-After says.
  count("saveClient", "retryFloorMs", d.retryFloorMs, 50, 5000);
  // The client's copy of the writer's per-account save bucket (server/writer DEFAULT_LIMITS save_run: burst, one token per refill; every
  // request costs one, a stale-seq retry too). A routine save never spends the last `bucketReserve` tokens: only a death save and the
  // page-hide send may, so a long fight can never leave the death save refused. Keep these equal to the writer's numbers.
  count("saveClient", "bucketBurst", d.bucketBurst, 1, 100);
  count("saveClient", "bucketRefillMs", d.bucketRefillMs, 100, 600000);
  count("saveClient", "bucketReserve", d.bucketReserve, 0, 50);
  if (d.bucketReserve >= d.bucketBurst) fail("saveClient", "bucketReserve must be below bucketBurst");
  count("saveClient", "bootSyncWaitMs", d.bootSyncWaitMs, 0, 15000); // how long Enter waits for the server record at most
  count("saveClient", "minSaveIntervalMs", d.minSaveIntervalMs, 1000, 600000); // the writer's bucket refills one save per 5 s
  count("saveClient", "staleSeqRetries", d.staleSeqRetries, 0, 5);
  if (typeof d.characterName !== "string" || !/^[\w -]{1,24}$/.test(d.characterName))
    fail("saveClient", "characterName");
}
