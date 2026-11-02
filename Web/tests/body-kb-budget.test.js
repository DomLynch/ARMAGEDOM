import test from "node:test";
import assert from "node:assert/strict";
import { measure, problems, wireTotals, BUDGET } from "../scripts/body-kb-budget.mjs";

test("every shipped body GLB is under its KB budget (crowd, creature, hero, boss); over-line bodies sit at a recorded ceiling and may not grow", () => {
  const rows = measure();
  assert(rows.length >= 40, "the manifest lists the shipped bodies");
  assert.deepEqual(problems(rows), []);
});

test("the budget covers all four body classes and every class is populated", () => {
  const rows = measure();
  for (const cls of Object.keys(BUDGET.classes)) assert(rows.some((r) => r.cls === cls), `${cls} has bodies`);
  assert(rows.some((r) => r.url.startsWith("crowd/")) && rows.some((r) => r.url.startsWith("bosses/")));
});

test("wire size: every body has gzip and brotli bytes, and pre-input bodies fit V3's 5.5 MB budget (it caps only those)", () => {
  const rows = measure(), t = wireTotals(rows);
  for (const r of rows) assert(r.gzip > 0 && r.brotli > 0 && r.brotli <= r.gzip * 1.02, r.url);
  assert(t.preInputBodies >= 1 && t.preInputGzip <= BUDGET.preInputWireBytes);
  assert(t.allGzip >= t.preInputGzip);
  assert(problems(rows.map((r) => ({ ...r, deferred: false, gzip: BUDGET.preInputWireBytes }))).some((p) => p.includes("pre-input")));
});

test("the row fails a body that is over its line", () => {
  const rows = measure().map((r) => (r.cls === "crowd" ? { ...r, kb: r.line + 1, ok: false } : r));
  assert(problems(rows).some((p) => p.includes("crowd line")));
});
