// Amendment "hot path": journal.ingest must not allocate in the 60 Hz step when nothing happened.
// Own file, so Node runs it in a fresh process: V8 allocates a heap number for every double read through a
// megamorphic property access, and other tests would fill the actor shapes with variants before this one runs.
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver, performance } from "node:perf_hooks";
import { fixture } from "./helpers/rifle-fixture.js";
import { createJournal } from "../src/engine/world-events.js";

test("hot path: a quiet step allocates nothing", async () => {
  const f = fixture({ areaId: "westminster" });
  f.restore();
  const g = f.g,
    journal = createJournal({ retain: Infinity }),
    quiet = g.events;
  for (const e of g.enemies) Object.assign(e, { moveSpeed: 0, ready: 1e6 });
  journal.ingest(g, quiet);
  // Let the JIT settle first: the first calls run unoptimised and may box numbers.
  for (let i = 0; i < 300000; i++) {
    g.tick++;
    journal.ingest(g, quiet);
  }
  const before = journal.lastSeq,
    seen = [],
    observer = new PerformanceObserver((list) => seen.push(...list.getEntries().map((e) => e.startTime)));
  observer.observe({ entryTypes: ["gc"] });
  const started = performance.now();
  for (let i = 0; i < 2000000; i++) {
    g.tick++;
    journal.ingest(g, quiet);
  }
  const finished = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 50));
  observer.disconnect();
  assert.equal(journal.lastSeq, before, "nothing happened, so nothing is recorded");
  // Collections after the loop (the observer's own delivery) do not count.
  const during = seen.filter((time) => time >= started && time <= finished);
  assert.equal(during.length, 0, "no garbage collection while nothing happens");
});
