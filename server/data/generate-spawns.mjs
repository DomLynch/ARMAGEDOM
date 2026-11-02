// node server/data/generate-spawns.mjs [A|B] > server/data/spawns.json   writes the writer's spawn rows ({ [instance]: { kind, area, maxHp } }, instance = "area:placement")
// from the game's own validated content: worldSpawnRows() covers the residents of area-content.json plus the code spawns (AREA_MOB_SPAWNS, drones). The writer reads
// these rows, never the phone, to pin an engage to a creature, so the file is generated, never typed. Needs the Web tree and its node_modules.
// ONE species cycle: the game has two ("A" and "B": the same placement is a rat with 20 hp in A and a dog with 30 hp in B), but the shared world is one world and the
// referee holds one row per instance, so the live cycle is named here (default "A", the game's first run cycle). A phone playing the other cycle gets a spawn row
// that does not match its creature, and the engage is refused (O0002), which is the correct answer. Web/tests/arma-spawns-seed.test.js fails when the game's data and
// server/data/spawns.json drift apart, and pins which instances differ between cycles so a change there is a decision, not a surprise.
import fs from "node:fs";
import { buildSpawns } from "./world-rows.js";
import { worldSpawnRows } from "../../Web/src/engine/world-events.js";
import { createAreaRegistry } from "../../Web/src/area-registry.js";
import { validateAreaMetadata } from "../../Web/src/engine/area-content.js";

export const LIVE_CYCLE = "A";
const read = (path) => JSON.parse(fs.readFileSync(new URL("../../Web/public/" + path, import.meta.url), "utf8"));
export const loadContent = () => validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
export const spawnsFor = (content, cycle = LIVE_CYCLE) => buildSpawns(worldSpawnRows(content, cycle));

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const cycle = process.argv[2] ?? LIVE_CYCLE;
  if (!["A", "B"].includes(cycle)) throw new Error(`cycle must be A or B, got ${cycle}`);
  process.stdout.write(JSON.stringify(spawnsFor(loadContent(), cycle), null, 2) + "\n");
}
