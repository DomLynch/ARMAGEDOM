import fs from "node:fs";
import { createGeometry } from "../src/world-geometry.js";
import { publicAreaRegistry as registry } from "../src/area-registry.js";
import { GAME_DATA } from "../src/engine/game-data.js";

const RUN = GAME_DATA.apocalypseRun,
  root = new URL("../public/world", import.meta.url).pathname;
for (const area of ["east", "south", "area7"]) {
  const g = createGeometry(JSON.parse(fs.readFileSync(`${root}/${area}/layout.json`, "utf8")));
  const links = registry.links(area).filter((l) => l.to === RUN.startZone);
  for (const l of links) {
    const c = l.condition,
      e = g.ground({ x: Math.min(Math.max(0.5, c.xMin ?? 0), c.xMax ?? 1), y: Math.min(Math.max(0.5, c.yMin ?? 0), c.yMax ?? 1) });
    const out = [];
    for (const r of [0.4, 1, 2, 4])
      for (const d of [4, 6, 8, 10]) {
        let n = 0;
        for (let k = 0; k < 16; k++) if (g.clear({ x: e.x + Math.cos((k * Math.PI) / 8) * d, z: e.z + Math.sin((k * Math.PI) / 8) * d }, r)) n++;
        out.push(`r${r}/d${d}:${n}`);
      }
    console.log("PROBE", area, JSON.stringify(c), "exit", e.x.toFixed(1), e.z.toFixed(1), out.join(" "));
  }
}
