import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

// The phone build ships the hollow body, the knife and the cleaver with their metallic-roughness, normal and prop maps at 256 px
// (art/phone-texture/PROVENANCE-256.json). The manifest names those copies; the originals stay for every tool that reads them.
const assets = new URL("../public/assets/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("manifest-hollow.json", assets)));
const bytesOf = (file) => fs.readFileSync(new URL(file, assets));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The images of a GLB with their pixel size, read from the JPEG/PNG/WebP headers.
function imageSizes(bytes) {
  const jsonLength = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength)),
    bin = bytes.subarray(20 + jsonLength + 8);
  return json.images.map((image) => {
    const view = json.bufferViews[image.bufferView],
      raw = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (raw[0] === 0x89) return [raw.readUInt32BE(16), raw.readUInt32BE(20)];
    if (raw.subarray(0, 4).toString() === "RIFF") {
      if (raw.subarray(12, 16).toString() === "VP8X") return [1 + raw.readUIntLE(24, 3), 1 + raw.readUIntLE(27, 3)];
      if (raw.subarray(12, 16).toString() === "VP8L") {
        const bits = raw.readUInt32LE(21);
        return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
      }
      return [raw.readUInt16LE(26) & 0x3fff, raw.readUInt16LE(28) & 0x3fff];
    }
    for (let i = 2; i < raw.length; ) {
      if (raw[i] !== 0xff) break;
      const marker = raw[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) return [raw.readUInt16BE(i + 7), raw.readUInt16BE(i + 5)];
      i += 2 + raw.readUInt16BE(i + 2);
    }
    throw Error("unreadable image header");
  });
}

test("the model rows name the 256 px copies and their pins match the files", () => {
  const knife = manifest.models["hollow-scavenger"].equipment.url;
  assert.equal(knife, "donor/knife-phone.glb");
  assert.equal(manifest.models.vagrant.equipment.url, knife);
  const cleaver = manifest.models["hollow-scavenger"].equipment && Object.values(manifest.models).find((m) => m.equipment?.url?.includes("pitborn-cleaver"))?.equipment;
  assert.equal(cleaver.url, "weapons/pitborn-cleaver-phone.glb");
  for (const [file, pin] of [
    [knife, manifest.files["weapon-phone"]],
    [cleaver.url, cleaver],
    [manifest.models["hollow-scavenger"].url, manifest.files["hollow-phone"]],
  ]) {
    const bytes = bytesOf(file);
    assert.equal(bytes.length, pin.bytes, file);
    assert.equal(sha(bytes), pin.sha256, file);
  }
});

test("the copies cap those maps at 256 px and every other image keeps its size", () => {
  const copy = (file) => imageSizes(bytesOf(file)),
    hollow = copy("hollow-scavenger/hollow-scavenger-phone.glb");
  assert.deepEqual(hollow.map((s) => Math.max(...s)), [512, 256, 256, 512, 512], "Photo colour, mr, normal, eyes, teeth");
  for (const file of ["donor/knife-phone.glb", "weapons/pitborn-cleaver-phone.glb"])
    assert(copy(file).every((s) => Math.max(...s) <= 256), file);
});
