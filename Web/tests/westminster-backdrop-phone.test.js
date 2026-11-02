import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { areaAssets } from "../src/area-definitions.js";

const read = (name) => readFileSync(new URL(`../public/world/westminster/${name}`, import.meta.url));

// WebP pixel size from the first image chunk: lossy VP8 or lossless VP8L.
function webpSize(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { kind, width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { kind, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw Error(`unsupported WebP chunk ${kind}`);
}

test("Westminster phone backdrop keeps the original pixel dimensions", () => {
  const original = webpSize(read("backdrop.webp")),
    phone = webpSize(read("backdrop-phone.webp"));
  assert.deepEqual([original.width, original.height], [1672, 941]);
  assert.deepEqual([phone.width, phone.height], [original.width, original.height]);
  assert.equal(phone.kind, "VP8 ", "phone copy is lossy WebP");
});

test("registry and world manifest pin the phone backdrop and it is far smaller than the original", () => {
  const phone = read("backdrop-phone.webp"),
    manifest = JSON.parse(readFileSync(new URL("../public/world/manifest.json", import.meta.url))),
    row = manifest.files.find((f) => f.area === "westminster" && f.path.includes("backdrop")),
    asset = areaAssets["backdrop.westminster"];
  assert.equal(row.path, "westminster/backdrop-phone.webp");
  assert.equal(asset.path, "world/westminster/backdrop-phone.webp");
  for (const pin of [row, asset]) {
    assert.equal(pin.bytes, phone.length);
    assert.equal(pin.sha256, createHash("sha256").update(phone).digest("hex"));
  }
  assert.ok(phone.length < read("backdrop.webp").length / 4);
});
