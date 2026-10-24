// Area ids, links and spawns come from the game's existing registry rows (Web/public/world), not from a copy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WEB_ROOT = path.resolve(here, "../Web");

/** { registry, spawns } where spawns maps an area id to its entry point in world metres ({x, z}). */
export async function loadAreas(webRoot = DEFAULT_WEB_ROOT) {
  const url = (p) => new URL(`file://${webRoot}/${p}`).href;
  const read = (p) => JSON.parse(fs.readFileSync(path.join(webRoot, "public", p), "utf8"));
  const { createAreaRegistry } = await import(url("src/area-registry.js"));
  const { createGeometry } = await import(url("src/world-geometry.js"));
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
  const spawns = new Map();
  for (const id of registry.ids) {
    const geometry = createGeometry(read(`world/${id}/layout.json`)),
      ground = geometry.ground(registry.get(id).entry);
    spawns.set(id, Object.freeze({ x: ground.x, z: ground.z }));
  }
  return { registry, spawns };
}
