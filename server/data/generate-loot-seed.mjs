// node server/data/generate-loot-seed.mjs   prints the INSERT that seeds arma_loot_rules (the always-drop weapons, keyed by spawn instance) from the game's
// own validated content, so the migration is generated, never typed. Needs the Web tree and its node_modules. Web/tests/arma-loot-rules-seed.test.js fails
// when the game's data and the migrated rows drift apart.
import fs from "node:fs";
import { seedLootRows } from "./world-rows.js";
import { weaponLootSources } from "./loot-sources.js";
import { worldSpawnRows } from "../../Web/src/engine/world-events.js";
import { createAreaRegistry } from "../../Web/src/area-registry.js";
import { validateAreaMetadata } from "../../Web/src/engine/area-content.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../../Web/public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const spawns = [...worldSpawnRows(content, "A"), ...worldSpawnRows(content, "B")];
const rows = seedLootRows(spawns, weaponLootSources(content));
process.stdout.write(`insert into public.arma_loot_rules (kind, slot, item, chance) values
${rows.map(([key, slot, item, chance]) => `  ('${key}', ${slot}, '${item}', ${chance})`).join(",\n")}
on conflict (kind, slot) do update set item = excluded.item, chance = excluded.chance;
`);
