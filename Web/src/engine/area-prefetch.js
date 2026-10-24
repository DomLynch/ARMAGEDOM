// Network-only prefetch of the nearest neighbour areas' files into the browser's HTTP cache.
//
// Release 204 gated all offscreen area preparation to the travel pause because CPU and GPU work
// (stage build, actor views, shader compile) caused frame spikes. A download costs the main thread
// almost nothing, so this brings back only the download: one request at a time, paced to at most
// `bytesPerSecond`, silent while a fight is live and for the first seconds after start. The bytes are
// read and discarded; nothing is decoded, parsed or kept in memory, so the real load later is a cache hit.
export const PREFETCH_LIMITS = Object.freeze({
  bytesPerSecond: 1_000_000,
  startDelayMs: 3000,
  maxNeighbours: 2,
  recheckMs: 250,
  fightQuietMs: 1000,
});

export function createAreaPrefetch({
  urlsFor,
  neighbours,
  canRun,
  fetchImpl = (...args) => fetch(...args),
  now = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  limits = PREFETCH_LIMITS,
  onEvent = () => {},
}) {
  const done = new Set(),
    failed = new Set();
  let generation = 0,
    controller = null,
    startedAt = null,
    stopped = false;
  const stats = { requests: 0, bytes: 0, failures: 0, aborted: 0, pauses: 0 };
  // The pacing window restarts with every request: after `bytes` have arrived, no earlier than bytes/rate.
  async function pace(window, bytes, ticket) {
    const due = window.start + (bytes / limits.bytesPerSecond) * 1000;
    for (;;) {
      if (ticket !== generation) return false;
      if (canAct()) {
        const wait = due - now();
        if (wait <= 0) return true;
        await sleep(Math.min(wait, limits.recheckMs));
      } else {
        stats.pauses++;
        await sleep(limits.recheckMs);
        // Time spent paused must not be repaid with a burst afterwards.
        window.start = Math.max(window.start, now() - (bytes / limits.bytesPerSecond) * 1000);
      }
    }
  }
  function canAct() {
    return !stopped && startedAt !== null && now() - startedAt >= limits.startDelayMs && canRun();
  }
  async function download(url, ticket) {
    controller = new AbortController();
    stats.requests++;
    const response = await fetchImpl(url, { priority: "low", signal: controller.signal });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const window = { start: now() };
    let bytes = 0;
    const reader = response.body?.getReader?.();
    if (!reader) {
      bytes = (await response.arrayBuffer()).byteLength;
      stats.bytes += bytes;
      return true;
    }
    for (;;) {
      if (!(await pace(window, bytes, ticket))) {
        controller?.abort();
        stats.aborted++;
        return false;
      }
      const chunk = await reader.read();
      if (chunk.done) return true;
      bytes += chunk.value.byteLength;
      stats.bytes += chunk.value.byteLength;
    }
  }
  async function run(ticket) {
    for (;;) {
      while (!canAct()) {
        if (ticket !== generation) return;
        await sleep(limits.recheckMs);
      }
      if (ticket !== generation) return;
      const next = neighbours()
        .slice(0, limits.maxNeighbours)
        .flatMap((areaId) => urlsFor(areaId))
        .find((url) => !done.has(url) && !failed.has(url));
      if (!next) return;
      try {
        if (await download(next, ticket)) done.add(next);
        else if (ticket !== generation) return;
      } catch (error) {
        if (ticket !== generation) return;
        // A failed prefetch only means the later travel fetches this file itself.
        failed.add(next);
        stats.failures++;
        onEvent("failed", next, error);
      } finally {
        controller = null;
      }
    }
  }
  return {
    // Call on arrival in an area (including the first one): restarts the queue for its neighbours.
    enter() {
      stopped = false;
      generation++;
      controller?.abort();
      startedAt ??= now();
      failed.clear();
      run(generation).catch((error) => onEvent("error", null, error));
    },
    // Travel or teardown: abort the in-flight request so the real load has the whole connection.
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    },
    stop() {
      stopped = true;
      this.cancel();
    },
    stats: () => ({ ...stats, done: done.size }),
  };
}
