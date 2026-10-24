import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { areaAssets } from "../src/area-definitions.js";

const AREAS = ["area7", "area8", "central-hub"];
const root = new URL("../public/world/", import.meta.url),
  read = (area, name) => readFileSync(new URL(`${area}/${name}`, root)),
  manifest = JSON.parse(readFileSync(new URL("manifest.json", root)));

// Pixel size of a lossy VP8 WebP, from its first image chunk.
function lossyWebpSize(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8 ", "phone copy is lossy WebP");
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}
// Pixel size of a PNG, from its IHDR chunk.
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

test("phone backdrops keep the original PNG pixel dimensions", () => {
  for (const area of AREAS)
    assert.deepEqual(lossyWebpSize(read(area, "backdrop-phone.webp")), pngSize(read(area, "backdrop.png")), area);
});

test("manifest and registry pin each phone backdrop, which is far smaller than the kept PNG", () => {
  for (const area of AREAS) {
    const phone = read(area, "backdrop-phone.webp"),
      row = manifest.files.find((f) => f.area === area && f.path.includes("backdrop")),
      asset = areaAssets[`backdrop.${area}`];
    assert.equal(manifest.backdrops[area], "backdrop-phone.webp", area);
    assert.equal(row.path, `${area}/backdrop-phone.webp`);
    assert.equal(asset.path, `world/${area}/backdrop-phone.webp`);
    for (const pin of [row, asset]) {
      assert.equal(pin.bytes, phone.length, area);
      assert.equal(pin.sha256, createHash("sha256").update(phone).digest("hex"), area);
    }
    assert.ok(phone.length < read(area, "backdrop.png").length / 4, area);
  }
});
