// arma_save_run is rewritten whole by every migration that changes it (create or replace), so each copy can silently drift from the last. This pins what
// 000030 changed against the 000029 function, line by line: the removed lines and the added lines are listed here, and nothing else differs. A later
// migration that touches the function adds its own copy of this test against 000030's body. The down file must restore the 000029 body exactly.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (dir, name) => fs.readFileSync(new URL(`../../../supabase/${dir}/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const FUNCTION = /create or replace function public\.arma_save_run\(.*?\nend \$\$;\n/s;
const body = (dir, name) => read(dir, name).match(FUNCTION)[0].trimEnd().split("\n");

/** Line diff by longest common subsequence: { removed, added } in order. */
function diff(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const removed = [],
    added = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) (i++, j++);
    else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) added.push(b[j++]);
    else removed.push(a[i++]);
  }
  return { removed, added };
}

const V29 = "20261103000029_arma_record_corpse_bag.sql";
const V30 = "20261105000030_arma_award_credit.sql";

test("000030 changes arma_save_run by exactly the declaration, the two locks, the credit call and the two reply fields", () => {
  const { removed, added } = diff(body("migrations", V29), body("migrations", V30));
  assert.equal(removed.length, 1);
  assert.match(removed[0], /^declare r public\.arma_runs;.*bag numeric; took numeric;$/);
  assert.equal(added.length, 7);
  assert.match(added[0], /^declare r public\.arma_runs;.*bag numeric; took numeric; awarded jsonb;$/);
  assert.ok(added[0].startsWith(removed[0].slice(0, -1)), "the declaration only gains `awarded jsonb`");
  assert.deepEqual(
    added.slice(1).map((line) => line.replace(/ -- 000030.*$/, "")),
    [
      "  insert into public.arma_cash (character, earned) values (p_character, 0) on conflict do nothing;",
      "  perform 1 from public.arma_cash where character = p_character for update;",
      "  perform pg_advisory_xact_lock(hashtextextended(p_character, 0));",
      "  awarded := public.arma_credit_awards(p_account, p_character, case when existed then r.record end, p_record);",
      "  if (awarded ->> 'cash')::int > 0 then answer := answer || jsonb_build_object('awarded', awarded -> 'cash'); end if;",
      "  if (awarded ->> 'capped')::int > 0 then answer := answer || jsonb_build_object('awardCapped', awarded -> 'capped'); end if;",
    ],
  );
  for (const line of added.slice(1)) assert.match(line, /-- 000030/, "every added line carries the 000030 mark");
});

test("the 000030 down file restores the 000029 function byte for byte", () => {
  assert.deepEqual(body("down", "20261105000030_arma_award_credit_down.sql"), body("migrations", V29));
});
