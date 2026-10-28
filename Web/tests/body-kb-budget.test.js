import test from "node:test";
import assert from "node:assert/strict";
import { measure, problems, BUDGET } from "../scripts/body-kb-budget.mjs";

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

test("the row fails a body that is over its line", () => {
  const rows = measure().map((r) => (r.cls === "crowd" ? { ...r, kb: r.line + 1, ok: false } : r));
  assert(problems(rows).some((p) => p.includes("crowd line")));
});
