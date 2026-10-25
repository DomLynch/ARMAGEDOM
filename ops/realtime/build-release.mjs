// node ops/realtime/build-release.mjs --out /opt/armagedom-realtime/releases --area-data <area.json> [--name <name>] [--no-install]
//   area.json comes from: (cd Web && node scripts/area-presence-rows.mjs /path/area.json)   (needs Web's node_modules)
// Builds the release bundle the writer and presence run from: the server tree plus ONLY the Web modules and data they import (traced from the two entry
// points, so a new import is picked up and a missing file fails the build), a package.json with the two runtime packages, and a MANIFEST of sha256s.
// It never touches /opt/armagedom-realtime/current: flipping that symlink is a separate, deliberate step (docs/MULTIPLAYER-DEPLOY-PLAN.md).
// The presence service imports Web/src (the game's combat rules, so a hit is judged by the same numbers the phone uses); that graph reaches `three`.
// Batch 2 (Combat's data/weapons.json through game-data.js) should shrink it; this script follows the imports, so it needs no change when it does.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadAreaRows } from "../../server/presence/area-rules.js";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const ENTRIES = ["server/writer/main.js", "server/presence/main.js"];
// Read at runtime by path, not by import: the writer's spawn rows, and the area content presence loads for its weapon caps and knockback allowance.
// Also the Supabase root CA the writer pins for the database (server/writer/db-config.js).
const DATA = ["server/data/spawns.json", "Web/public/world/area-content.json", "server/writer/certs/supabase-prod-ca-2021.crt"];
// The bundle's package.json and package-lock.json live in ops/realtime/release/ and are copied as they are, so `npm ci` installs exactly the locked tree.
const RELEASE_PACKAGE = path.join(repo, "ops/realtime/release/package.json");
const RUNTIME_PACKAGES = JSON.parse(fs.readFileSync(RELEASE_PACKAGE, "utf8")).dependencies;
const IMPORT = /(?:import|export)\s+(?:[^'"]*?from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Every repo file the entries import (relative specifiers only), plus the bare package names they use. */
export function trace(root, entries) {
  const files = new Set(),
    bare = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    if (!file.endsWith(".js") && !file.endsWith(".mjs")) return;
    for (const match of fs.readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = match[1] ?? match[2];
      if (spec.startsWith("node:")) continue;
      if (!spec.startsWith(".")) {
        bare.add(spec.split("/")[0]);
        continue;
      }
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target)) throw new Error(`${path.relative(root, file)} imports ${spec}, which does not exist`);
      visit(target);
    }
  };
  for (const entry of entries) visit(path.resolve(root, entry));
  return { files: [...files].map((f) => path.relative(root, f)).sort(), bare: [...bare].sort() };
}

/**
 * areaData: path to the JSON `node Web/scripts/area-presence-rows.mjs <out.json>` writes (generated from the registered layouts, never typed). It ships as
 * server/data/area-presence.json, which presence.env points ARMA_AREA_DATA at. It is checked with presence's own loader unless validate is false (tests).
 */
export function build({ root = repo, out, name, install = true, areaData, validate = true }) {
  if (!areaData) throw new Error("--area-data <file> is required (node Web/scripts/area-presence-rows.mjs <out.json>)");
  const areaJson = JSON.parse(fs.readFileSync(areaData, "utf8"));
  if (validate) loadAreaRows(areaJson); // throws on a stale, edited or malformed layout
  const { files, bare } = trace(root, ENTRIES);
  const unknown = bare.filter((pkg) => !(pkg in RUNTIME_PACKAGES));
  if (unknown.length) throw new Error(`the entries import packages this script does not install: ${unknown.join(", ")}`);
  const dir = path.join(out, name ?? `build-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists; releases are immutable, pick another name`);
  const manifest = [];
  for (const rel of [...files, ...DATA]) {
    const from = path.join(root, rel),
      to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    manifest.push(`${crypto.createHash("sha256").update(fs.readFileSync(from)).digest("hex")}  ${rel}`);
  }
  fs.writeFileSync(path.join(dir, "server/data/area-presence.json"), JSON.stringify(areaJson) + "\n");
  manifest.push(`${crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "server/data/area-presence.json"))).digest("hex")}  server/data/area-presence.json`);
  for (const file of ["package.json", "package-lock.json"]) {
    const from = path.join(repo, "ops/realtime/release", file);
    fs.copyFileSync(from, path.join(dir, file));
    manifest.push(`${crypto.createHash("sha256").update(fs.readFileSync(from)).digest("hex")}  ${file}`);
  }
  fs.writeFileSync(path.join(dir, "MANIFEST"), manifest.join("\n") + "\n");
  if (install) {
    const run = spawnSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit" });
    if (run.status !== 0) throw new Error("npm ci failed");
  }
  return { dir, files: files.length + DATA.length, bare };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const out = arg("--out");
  if (!out) throw new Error("usage: build-release.mjs --out <releases dir> [--name <name>] [--no-install]");
  const result = build({ out, name: arg("--name"), install: !process.argv.includes("--no-install"), areaData: arg("--area-data") });
  console.log(`built ${result.dir}: ${result.files} files, packages: ${result.bare.join(", ")}`);
  console.log(`not activated: point 'current' at it only after the checks (see the install runbook)`);
}
