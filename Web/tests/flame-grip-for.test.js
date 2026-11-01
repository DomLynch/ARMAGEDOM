import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { flameGripFor, flameGripProfile } from "../src/engine/flame-presentation.js";
import { withDonorPlayer } from "./helpers/donor-player.js";

const manifest = () => JSON.parse(fs.readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8"));

test("a body that names its own hand bone (Perseus) gets no flame finger profile and no throw", () => {
  const m = manifest();
  assert.ok(m.models.vagrant.handBone);
  assert.equal(flameGripFor({}, m), undefined);
});
test("the donor hero still gets its accepted profile through the same call", async () => {
  const m = withDonorPlayer(manifest()),
    hero = await loadGeometry(fs.readFileSync(new URL("../public/assets/donor/warrior-phone.glb", import.meta.url))),
    record = Object.values(m.files).find((r) => r.file === m.models.vagrant.url);
  assert.ok(record, "the donor warrior has a manifest file record");
  const profile = flameGripFor(hero.scene, m);
  assert.ok(profile);
  assert.equal(profile, flameGripProfile(hero.scene, record.sha256));
});
