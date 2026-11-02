import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { areaAssets } from "../src/area-definitions.js";

// Every area's selected backdrop comes from the world manifest's `backdrops` map; nothing here names an area or a file.
const root = new URL("../public/world/", import.meta.url),
  manifest = JSON.parse(readFileSync(new URL("manifest.json", root))),
  read = (path) => readFileSync(new URL(path, root)),
  selected = Object.entries(manifest.backdrops).map(([area, name]) => ({ area, name, path: `${area}/${name}` })),
  isPhone = ({ name }) => name.includes("-phone");

// Pixel size from the file header: PNG IHDR, lossy VP8 or lossless VP8L WebP.
function imageSize(bytes) {
  if (bytes.toString("ascii", 1, 4) === "PNG") return { kind: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { kind, width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { kind, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw Error(`unsupported image chunk ${kind}`);
}
// The kept original a phone copy was made from: the area's lossless PNG, or else its lossless WebP.
const originalOf = ({ area }) => ["backdrop.png", "backdrop.webp"].map((n) => `${area}/${n}`).find((p) => existsSync(new URL(p, root)));

test("every selected backdrop is a manifest file whose bytes and sha256 match the file and the area registry", () => {
  assert.ok(selected.length > 0);
  for (const s of selected) {
    const row = manifest.files.find((f) => f.area === s.area && f.path === s.path),
      asset = areaAssets[`backdrop.${s.area}`],
      bytes = read(s.path);
    assert.ok(row, `${s.path} has a manifest row`);
    assert.equal(asset.path, `world/${s.path}`, s.area);
    for (const pin of [row, asset]) {
      assert.equal(pin.bytes, bytes.length, s.path);
      assert.equal(pin.sha256, createHash("sha256").update(bytes).digest("hex"), s.path);
    }
  }
});

test("phone backdrops are lossy WebP at the original's pixel size, far smaller, with the original kept", () => {
  const phones = selected.filter(isPhone);
  assert.ok(phones.length > 0);
  for (const s of phones) {
    const original = originalOf(s),
      phone = read(s.path);
    assert.ok(original, `${s.area} keeps its original backdrop`);
    const [a, b] = [imageSize(phone), imageSize(read(original))];
    assert.equal(a.kind, "VP8 ", `${s.path} is lossy WebP`);
    assert.deepEqual([a.width, a.height], [b.width, b.height], s.path);
    assert.ok(phone.length < read(original).length / 4, `${s.path} is under a quarter of ${original}`);
  }
});
