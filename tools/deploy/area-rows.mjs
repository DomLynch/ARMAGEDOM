// Windows-safe stand-in for `node Web/scripts/area-presence-rows.mjs <out>`: that script's main-module guard compares
// process.argv[1] with new URL(import.meta.url).pathname, which never matches on Windows ("/C:/..." vs "C:\..."), so it
// writes nothing. Usage: node area-rows.mjs <tree root containing Web/> <out.json>
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";
const [root, out] = process.argv.slice(2);
const mod = await import(pathToFileURL(path.resolve(root, "Web/scripts/area-presence-rows.mjs")).href);
writeFileSync(out, JSON.stringify(mod.areaPresenceData(), null, 1) + "\n");
