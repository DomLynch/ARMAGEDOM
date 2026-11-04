// Installs the opt-in 1.5x desktop backdrops. Given a directory of <area>-1p5x-v2.webp files it copies each one that matches a registered
// area to public/world/<area>/backdrop-desktop.webp and records it in the three places that pin it: the areas.json asset row
// (backdrop.<area>.desktop with sha256, bytes and size) plus the area's desktopBackdropRef, and the world manifest file row plus its
// desktopBackdrops map. Areas with no file keep their phone backdrop alone. The phone backdrop files and rows are never touched.
// Usage: node scripts/set-desktop-backdrops.mjs <dir> [--dry-run]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = {
  areas: path.join(web, "src/data/areas.json"),
  runtime: path.join(web, "src/data/areaRuntime.json"),
  manifest: path.join(web, "public/world/manifest.json"),
};
const SUFFIX = "-1p5x-v2.webp"; // the UPSCALE helper's file name: <area>-1p5x-v2.webp
const DESKTOP_NAME = "backdrop-desktop.webp";

// Pixel size from a WebP header: lossy VP8, lossless VP8L or extended VP8X.
export function webpSize(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw Error("not a WebP file");
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (kind === "VP8X") return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  throw Error(`unsupported WebP chunk ${kind}`);
}

const readJson = (f) => {
  const text = fs.readFileSync(f, "utf8");
  const data = JSON.parse(text);
  if (JSON.stringify(data, null, 2) + (text.endsWith("\n") ? "\n" : "") !== text.replace(/\r\n/g, "\n"))
    throw Error(`${path.basename(f)} is not 2-space JSON; refusing to rewrite it`);
  return { data, newline: text.endsWith("\n") ? "\n" : "" };
};

export function installDesktopBackdrops(dir, { dryRun = false, root = web } = {}) {
  const at = (rel) => path.join(root, rel);
  const areas = readJson(at("src/data/areas.json")),
    manifest = readJson(at("public/world/manifest.json")),
    expected = JSON.parse(fs.readFileSync(at("src/data/areaRuntime.json"), "utf8")).view.desktopArtSize,
    done = [],
    skipped = [];
  for (const row of areas.data.areas) {
    const source = path.join(dir, row.id + SUFFIX);
    if (!fs.existsSync(source)) {
      skipped.push(row.id);
      continue;
    }
    const bytes = fs.readFileSync(source),
      size = webpSize(bytes);
    if (size[0] !== expected[0] || size[1] !== expected[1]) throw Error(`${source} is ${size.join("x")}, expected ${expected.join("x")}`);
    const ref = `backdrop.${row.id}.desktop`,
      rel = `world/${row.id}/${DESKTOP_NAME}`,
      sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    // Rebuild the asset table so the desktop row sits right after its phone row, whatever order the rows were in before.
    areas.data.assets = Object.fromEntries(
      Object.entries(areas.data.assets)
        .filter(([key]) => key !== ref)
        .flatMap(([key, value]) =>
          key === row.backdropRef ? [[key, value], [ref, { kind: "backdrop", path: rel, sha256, bytes: bytes.length, size }]] : [[key, value]],
        ),
    );
    const index = areas.data.areas.indexOf(row);
    areas.data.areas[index] = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key !== "desktopBackdropRef")
        .flatMap(([key, value]) => (key === "backdropRef" ? [[key, value], ["desktopBackdropRef", ref]] : [[key, value]])),
    );
    manifest.data.files = manifest.data.files.filter((f) => f.path !== rel.slice("world/".length));
    const after = manifest.data.files.findLastIndex((f) => f.area === row.id);
    manifest.data.files.splice(after + 1, 0, {
      area: row.id,
      path: rel.slice("world/".length),
      source: `${row.id}${SUFFIX} 1.5x upscale of the phone backdrop (opt-in strong desktop tier only; the phone file is the default)`,
      bytes: bytes.length,
      sha256,
    });
    manifest.data.desktopBackdrops = { ...manifest.data.desktopBackdrops, [row.id]: DESKTOP_NAME };
    if (!dryRun) {
      fs.mkdirSync(at(`public/world/${row.id}`), { recursive: true });
      fs.writeFileSync(at(`public/${rel}`), bytes);
    }
    done.push({ area: row.id, bytes: bytes.length, sha256, size });
  }
  if (!dryRun && done.length) {
    fs.writeFileSync(at("src/data/areas.json"), JSON.stringify(areas.data, null, 2) + areas.newline);
    fs.writeFileSync(at("public/world/manifest.json"), JSON.stringify(manifest.data, null, 2) + manifest.newline);
  }
  return { done, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--")),
    dryRun = process.argv.includes("--dry-run");
  if (args.length !== 1) throw Error("Usage: node scripts/set-desktop-backdrops.mjs <dir with <area>-1p5x-v2.webp files> [--dry-run]");
  console.log(JSON.stringify(installDesktopBackdrops(path.resolve(args[0]), { dryRun }), null, 2));
}
