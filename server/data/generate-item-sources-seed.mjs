// node server/data/generate-item-sources-seed.mjs   prints the INSERT that seeds arma_item_sources (where a save record keeps each always-drop weapon, and
// the loot item that is its receipt) from the game's own validated content, so the migration is generated, never typed. Needs the Web tree and its
// node_modules. Web/tests/arma-item-sources-seed.test.js fails when the game's data and the migrated rows drift apart.
import fs from "node:fs";
import { seedItemSources } from "./world-rows.js";
import { weaponLootSources } from "./loot-sources.js";
import { createAreaRegistry } from "../../Web/src/area-registry.js";
import { validateAreaMetadata } from "../../Web/src/engine/area-content.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../../Web/public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const rows = seedItemSources(weaponLootSources(content));
process.stdout.write(`insert into public.arma_item_sources (path, item) values
${rows.map(([path, item]) => `  ('${path}', '${item}')`).join(",\n")}
on conflict (path) do update set item = excluded.item;
`);
