// node server/data/generate-payout-seed.mjs [--placements]   prints the INSERT that seeds arma_payout_rules from the game's own tables
// (worldSpawnRows kinds x marked.cashPerKill / bossCash), so the migration is generated, never typed. Needs the Web tree and its
// node_modules. Web/tests/arma-payout-rules-seed.test.js fails when the game's tables and the migrated rows drift apart.
import fs from "node:fs";
import { seedPayoutRows, seedPlacementRows } from "./world-rows.js";
import { worldSpawnRows } from "../../Web/src/engine/world-events.js";
import { createAreaRegistry } from "../../Web/src/area-registry.js";
import { validateAreaMetadata } from "../../Web/src/engine/area-content.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../../Web/public/" + path, import.meta.url), "utf8"));
// The validated content, the way the game and Combat's earning-rule script load it (the raw file names bosses/marked differently).
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const cycles = [worldSpawnRows(content, "A"), worldSpawnRows(content, "B")];
const bossKinds = new Set(Object.values(content.bossData?.profiles ?? {}).map((profile) => profile.modelRef));
if (!content.markedData) throw Error("area-content.json has no marked rules");
// --placements prints the INSERT that seeds arma_placement_cash (what progression.awards pay per placement, migration 000030) instead.
if (process.argv.includes("--placements")) {
  const placements = seedPlacementRows(cycles, bossKinds, content.markedData);
  process.stdout.write(`insert into public.arma_placement_cash (instance, cash) values
${placements.map(([instance, cash]) => `  ('${instance}', ${cash})`).join(",\n")}
on conflict (instance) do update set cash = excluded.cash;
`);
} else {
  const rows = seedPayoutRows(cycles.flat(), bossKinds, content.markedData);
  process.stdout.write(`insert into public.arma_payout_rules (kind, cash) values
${rows.map(([kind, cash]) => `  ('${kind}', ${cash})`).join(",\n")}
on conflict (kind) do update set cash = excluded.cash;
`);
}
