import test from "node:test";
import assert from "node:assert/strict";
import { createAreaPrefetch, PREFETCH_LIMITS } from "../src/engine/area-prefetch.js";

const CHUNK = 100_000;

// A virtual clock: sleeping advances it, so a run is deterministic and takes no real time.
function rig({ files, canRun = () => true, neighbours = ["east", "south", "lambeth"], failFirst = false, now0 = 0 }) {
  const clock = { t: now0 },
    log = { fetches: [], reads: [], open: 0, maxOpen: 0, aborted: 0 };
  const fetchImpl = async (url, options) => {
    log.fetches.push({ url, t: clock.t, priority: options.priority });
    if (failFirst && log.fetches.length === 1) throw Error("network down");
    let left = files[url] ?? CHUNK;
    log.open++;
    log.maxOpen = Math.max(log.maxOpen, log.open);
    let closed = false;
    const close = () => {
      if (!closed) log.open--;
      closed = true;
    };
    options.signal.addEventListener("abort", () => {
      log.aborted++;
      close();
    });
    return {
      ok: true,
      body: {
        getReader: () => ({
          async read() {
            if (options.signal.aborted) throw new DOMException("aborted", "AbortError");
            if (left <= 0) {
              close();
              return { done: true };
            }
            const size = Math.min(CHUNK, left);
            left -= size;
            log.reads.push({ url, t: clock.t, size });
            return { done: false, value: new Uint8Array(size) };
          },
        }),
      },
    };
  };
  const prefetch = createAreaPrefetch({
    urlsFor: (area) => [`/${area}/layout.json`, `/${area}/backdrop.webp`],
    neighbours: () => neighbours,
    canRun: () => canRun(clock.t),
    fetchImpl,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms;
      // A macrotask turn, so an endless download cannot starve the test's own waits.
      await new Promise((resolve) => setImmediate(resolve));
    },
  });
  // The run loop is fire and forget; let it drain on the virtual clock.
  const drain = async (steps = 4000) => {
    for (let i = 0; i < steps; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  return { clock, log, prefetch, drain };
}

test("nothing is fetched in the first 3 s", async () => {
  const { log, prefetch, drain } = rig({ files: {} });
  prefetch.enter();
  await drain();
  assert.ok(log.fetches.length > 0);
  assert.ok(log.fetches.every((f) => f.t >= PREFETCH_LIMITS.startDelayMs));
  assert.ok(log.fetches.every((f) => f.priority === "low"));
});

test("bytes arrive no faster than the rate limit, one request at a time", async () => {
  const { log, prefetch, drain } = rig({
    files: { "/east/layout.json": 200_000, "/east/backdrop.webp": 3_000_000 },
    neighbours: ["east"],
  });
  prefetch.enter();
  await drain();
  assert.equal(log.maxOpen, 1);
  const backdrop = log.reads.filter((r) => r.url === "/east/backdrop.webp"),
    t0 = log.fetches.find((f) => f.url === "/east/backdrop.webp").t;
  assert.equal(
    backdrop.reduce((n, r) => n + r.size, 0),
    3_000_000,
  );
  let before = 0;
  for (const read of backdrop) {
    // Bytes already received before this chunk never exceed what the rate allows by its start.
    assert.ok(
      before <= ((read.t - t0) / 1000) * PREFETCH_LIMITS.bytesPerSecond + 1,
      `${before} bytes by ${read.t - t0} ms`,
    );
    before += read.size;
  }
  assert.ok(backdrop.at(-1).t - t0 >= 1400, "3 MB takes about 1.5 s at 2 MB/s");
});

test("only the two nearest neighbours are fetched", async () => {
  const { log, prefetch, drain } = rig({ files: {} });
  prefetch.enter();
  await drain();
  const areas = new Set(log.fetches.map((f) => f.url.split("/")[1]));
  assert.deepEqual([...areas], ["east", "south"]);
  assert.equal(prefetch.stats().done, 4);
});

test("no read while a fight is live; it resumes afterwards without a burst", async () => {
  const fight = { from: 5000, to: 9000 };
  const { log, prefetch, drain } = rig({
    files: { "/east/layout.json": 20_000_000 },
    neighbours: ["east"],
    canRun: (t) => t < fight.from || t >= fight.to,
  });
  prefetch.enter();
  await drain();
  assert.ok(
    log.reads.some((r) => r.t < fight.from),
    "reads before the fight",
  );
  assert.ok(
    log.reads.some((r) => r.t >= fight.to),
    "reads after the fight",
  );
  assert.ok(!log.reads.some((r) => r.t >= fight.from + PREFETCH_LIMITS.recheckMs && r.t < fight.to));
  assert.equal(log.maxOpen, 1);
  const layout = log.reads.filter((r) => r.url === "/east/layout.json"),
    t0 = log.fetches.find((f) => f.url === "/east/layout.json").t;
  let before = 0;
  for (const read of layout) {
    assert.ok(before <= ((read.t - t0) / 1000) * PREFETCH_LIMITS.bytesPerSecond + 1);
    before += read.size;
  }
});

test("a failed file is skipped and the rest still download", async () => {
  const { log, prefetch, drain } = rig({ files: {}, failFirst: true, neighbours: ["east"] });
  prefetch.enter();
  await drain();
  assert.equal(prefetch.stats().failures, 1);
  assert.equal(prefetch.stats().done, 1);
  assert.equal(new Set(log.fetches.map((f) => f.url)).size, 2);
});

test("cancel aborts the in-flight request and leaves the connection alone until enter", async () => {
  const { log, clock, prefetch, drain } = rig({ files: { "/east/layout.json": 500_000_000 }, neighbours: ["east"] });
  prefetch.enter();
  for (let i = 0; i < 400 && log.reads.length < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(log.reads.length >= 3);
  prefetch.cancel();
  const readsAtCancel = log.reads.length,
    fetchesAtCancel = log.fetches.length;
  clock.t += 60_000;
  await drain(200);
  assert.equal(log.aborted, 1);
  assert.equal(log.reads.length, readsAtCancel);
  assert.equal(log.fetches.length, fetchesAtCancel);
  prefetch.enter();
  await drain();
  assert.ok(log.fetches.length > fetchesAtCancel, "enter restarts the queue for the new area");
});

test("stop prevents any further fetch", async () => {
  const { log, prefetch, drain } = rig({ files: {} });
  prefetch.enter();
  prefetch.stop();
  await drain(200);
  assert.equal(log.fetches.length, 0);
});
