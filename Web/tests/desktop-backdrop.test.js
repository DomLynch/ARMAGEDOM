import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as T from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateQualityTier } from "../src/engine/game-data-quality.js";
import { createQualityTier } from "../src/engine/quality-tier.js";
import { createWorld } from "../src/world.js";
import { areaAssets, areaDefinitions } from "../src/area-definitions.js";
import { createAreaRegistry } from "../src/area-registry.js";

// The opt-in 1.5x desktop backdrop: the device gate (data/qualityTier.json), the per-area rows (areas.json), the budget (areaRuntime.json)
// and the lazy load with a fall back to the unchanged phone file.
const rules = GAME_DATA.qualityTier,
  VIEW = GAME_DATA.areaRuntime.view,
  MIB = 1024 * 1024,
  bytesOf = ([w, h]) => w * h * 4,
  read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url))),
  desktopRows = areaDefinitions.filter((a) => a.desktopBackdropRef),
  strong = { cores: 12, memoryGb: 8, textureSize: 16384, touchPoints: 0 },
  phone = { cores: 6, textureSize: 16384, touchPoints: 5 },
  tablet = { cores: 8, memoryGb: 4, textureSize: 16384, touchPoints: 5 },
  safari = { cores: 8, textureSize: 16384, touchPoints: 0 }; // desktop Safari reports no deviceMemory

function settle(q, env) {
  q.probe(env);
  let ms = 0;
  q.frame((ms += 1));
  for (let i = 0; i < rules.probe.warmupFrames + rules.probe.sampleFrames + 1; i++) q.frame((ms += 16));
  return q;
}
const tier = (env, search = "") => settle(createQualityTier(rules, search), env);

test("the tier gate: only a settled strong desktop on the top tier takes the desktop backdrop", () => {
  assert.equal(tier(strong).desktopBackdrop(), true);
  assert.equal(tier(safari).desktopBackdrop(), true, "a missing deviceMemory does not block");
  assert.equal(tier(phone).desktopBackdrop(), false, "a phone never does");
  assert.equal(tier(tablet).desktopBackdrop(), false, "touch devices never do");
  assert.equal(tier({ ...strong, cores: 4 }).desktopBackdrop(), false, "too few cores");
  assert.equal(tier({ ...strong, textureSize: 4096 }).desktopBackdrop(), false, "too small a texture limit");
  assert.equal(tier({ cores: 8, textureSize: undefined, touchPoints: 0 }).desktopBackdrop(), false, "an unreported texture limit fails");
  assert.equal(tier({ ...strong, memoryGb: 4 }).desktopBackdrop(), false);
});

test("not before the tier has settled, and never from a mid or low tier", () => {
  const early = createQualityTier(rules, "");
  early.probe(strong);
  assert.equal(early.desktopBackdrop(), false, "probe only, frame sample pending");
  for (const name of ["mid", "low"]) assert.equal(tier(strong, `?${rules.param}=${name}`).desktopBackdrop(), false, name);
  assert.equal(tier(strong, `?${rules.param}=full`).desktopBackdrop(), true);
  const slow = createQualityTier(rules, "");
  slow.probe({ ...strong, cores: 4, memoryGb: 2 }); // two weak signals leave the top tier
  assert.equal(settle(slow, {}).row().desktopBackdrop, false);
  assert.equal(slow.desktopBackdrop(), false);
});

test("?desktop=0 is off, ?desktop=1 skips the needs but not the tier row", () => {
  const { param, offValue, forceValue } = rules.desktopBackdrop;
  assert.equal(tier(strong, `?${param}=${offValue}`).desktopBackdrop(), false);
  assert.equal(tier(phone, `?${param}=${forceValue}`).desktopBackdrop(), true, "forced on a device that fails the needs");
  assert.equal(tier(phone, `?${rules.param}=low&${param}=${forceValue}`).desktopBackdrop(), false, "a low tier cannot be forced onto it");
  assert.equal(createQualityTier({ ...rules, enabled: false }, "").desktopBackdrop(), false, "tier probe off and nothing probed");
});

test("the tier data rejects a lower tier that allows the desktop backdrop, or a bad need", () => {
  validateQualityTier(rules);
  const [full, mid, low] = rules.tiers;
  assert.equal(full.desktopBackdrop, true);
  assert.equal(mid.desktopBackdrop, false);
  assert.equal(low.desktopBackdrop, false);
  const bad = (change) => () => validateQualityTier({ ...rules, ...change });
  assert.throws(bad({ tiers: [full, { ...mid, desktopBackdrop: true }, low] }));
  assert.throws(bad({ tiers: [full, { ...mid, desktopBackdrop: "yes" }, low] }));
  assert.throws(bad({ desktopBackdrop: { ...rules.desktopBackdrop, needs: [{ name: "cores", whenMissing: false }] } }));
  assert.throws(bad({ desktopBackdrop: { ...rules.desktopBackdrop, param: rules.param } }));
  assert.throws(bad({ desktopBackdrop: { ...rules.desktopBackdrop, extra: 1 } }));
  assert.throws(bad({ desktopBackdrop: undefined }));
});

test("the desktop rows: size, bytes and sha256 match the files, and the phone rows and files are untouched", () => {
  assert.ok(desktopRows.length >= 1, "at least the two delivered areas carry a desktop backdrop");
  const manifest = read("../public/world/manifest.json");
  for (const area of desktopRows) {
    const asset = areaAssets[area.desktopBackdropRef],
      bytes = fs.readFileSync(new URL(`../public/${asset.path}`, import.meta.url)),
      file = manifest.files.find((f) => `world/${f.path}` === asset.path);
    assert.deepEqual(asset.size, VIEW.desktopArtSize, area.id);
    assert.equal(asset.kind, "backdrop");
    assert.equal(bytes.length, asset.bytes, area.id);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), asset.sha256, area.id);
    assert.deepEqual({ bytes: file.bytes, sha256: file.sha256 }, { bytes: asset.bytes, sha256: asset.sha256 }, "manifest row");
    assert.equal(manifest.desktopBackdrops[area.id], "backdrop-desktop.webp");
    assert.equal(manifest.backdrops[area.id], "backdrop-phone.webp", "the selected (default) backdrop stays the phone file");
    assert.notEqual(asset.path, areaAssets[area.backdropRef].path);
  }
  for (const area of areaDefinitions) assert.ok(areaAssets[area.backdropRef].path.endsWith("backdrop-phone.webp"), area.id);
  assert.deepEqual(Object.keys(manifest.desktopBackdrops).sort(), desktopRows.map((a) => a.id).sort());
});

test("GPU math: 13.5 MiB per desktop backdrop; active + the parked limit + one entering fits the desktop budget", () => {
  const phoneBytes = bytesOf(VIEW.artSize),
    desktopBytes = bytesOf(VIEW.desktopArtSize),
    parked = GAME_DATA.areaRuntime.parkedAreas;
  assert.equal(phoneBytes / MIB, 1672 * 941 * 4 / MIB);
  assert.ok(Math.abs(desktopBytes / MIB - 13.5) < 0.01);
  assert.ok(parked.maxAreas * desktopBytes <= parked.maxBytes, "the parked limits still hold their areas at desktop size");
  const budget = VIEW.desktopTextureBudgetMiB * MIB;
  assert.ok(desktopBytes + Math.min(parked.maxBytes, parked.maxAreas * desktopBytes) + desktopBytes <= budget);
  assert.ok(budget >= VIEW.textureBudgetMiB * MIB, "the desktop budget is never below the phone budget");
  const aspect = (s) => s[0] / s[1];
  assert.ok(Math.abs(aspect(VIEW.desktopArtSize) - aspect(VIEW.artSize)) < 0.001, "the view crop is unchanged to within a pixel");
});

// A world on fake loaders that records every backdrop it is asked for.
async function world(t, { gate, fail = () => false, size = (url) => (url.includes("desktop") ? VIEW.desktopArtSize : VIEW.artSize) }) {
  const old = globalThis.fetch,
    loads = [];
  globalThis.fetch = async (url) => ({ ok: true, json: async () => read("../public/" + new URL(url).pathname.slice(1)) });
  t.after(() => (globalThis.fetch = old));
  class Loader {
    async loadAsync(url) {
      loads.push(new URL(url).pathname.slice(1));
      if (fail(url)) throw Error("backdrop HTTP 500");
      const [width, height] = size(url);
      return new T.Texture({ width, height });
    }
  }
  const w = await createWorld({
    THREE: { ...T, TextureLoader: Loader },
    scene: new T.Scene(),
    camera: new T.PerspectiveCamera(),
    baseUrl: "https://fixture.invalid/",
    desktopBackdrop: gate,
  });
  t.after(() => w.dispose());
  return { w, loads };
}
const target = desktopRows.find((a) => a.id !== GAME_DATA.areas.areas[0].id), // not the initial area, which is already staged
  desktopId = target.id,
  desktopPath = areaAssets[target.desktopBackdropRef].path,
  phonePath = areaAssets[target.backdropRef].path;

test("the initial area always loads its phone file, even with the gate open", async (t) => {
  const { loads } = await world(t, { gate: () => true });
  assert.deepEqual(loads, ["world/westminster/backdrop-phone.webp"]);
});

test("gate closed: the area loads its phone file and prefetch names it", async (t) => {
  const { w, loads } = await world(t, { gate: () => false });
  assert.ok(w.areaPrefetchUrls(desktopId).some((u) => u.endsWith(phonePath)));
  assert.ok(!w.areaPrefetchUrls(desktopId).some((u) => u.endsWith(desktopPath)));
  const stage = await w.prepareArea(desktopId);
  assert.equal(loads.at(-1), phonePath);
  assert.equal(stage.textureBytes(), bytesOf(VIEW.artSize));
});

test("no gate at all (the default, and every non-browser caller) keeps the phone file", async (t) => {
  const { w, loads } = await world(t, { gate: undefined });
  await w.prepareArea(desktopId);
  assert.equal(loads.at(-1), phonePath);
});

test("gate open: the area enters on the desktop file, lazily, charged at 13.5 MiB; prefetch names the desktop file", async (t) => {
  const { w, loads } = await world(t, { gate: () => true });
  assert.ok(w.areaPrefetchUrls(desktopId).some((u) => u.endsWith(desktopPath)));
  assert.ok(!loads.includes(desktopPath), "nothing is loaded before the area is entered");
  const stage = await w.prepareArea(desktopId);
  assert.deepEqual(loads.slice(-1), [desktopPath]);
  assert.equal(stage.textureBytes(), bytesOf(VIEW.desktopArtSize));
  assert.equal(w.preparationStats().estimatedTextureBytes, bytesOf(VIEW.desktopArtSize) + bytesOf(VIEW.artSize));
});

test("an area row without a desktop ref keeps its phone file with the gate open, and still validates", async (t) => {
  const { w } = await world(t, { gate: () => true });
  const bare = { ...areaDefinitions[0] };
  delete bare.desktopBackdropRef;
  assert.equal(w.wantsDesktopBackdrop(bare), false);
  assert.equal(w.wantsDesktopBackdrop({ ...bare, desktopBackdropRef: desktopRows[0].desktopBackdropRef }), true);
  const rows = structuredClone(areaDefinitions).map(({ desktopBackdropRef, ...row }) => row);
  const manifest = read("../public/world/manifest.json");
  assert.doesNotThrow(() => createAreaRegistry({ areas: rows, manifest }));
  assert.throws(() => createAreaRegistry({ areas: [{ ...rows[0], desktopBackdropRef: "backdrop.nope" }, ...rows.slice(1)], manifest }));
});

test("a desktop load failure falls back to the phone file, with the phone texture charged", async (t) => {
  const { w, loads } = await world(t, { gate: () => true, fail: (url) => url.includes("desktop") });
  const stage = await w.prepareArea(desktopId);
  assert.deepEqual(loads.slice(-2), [desktopPath, phonePath]);
  assert.equal(stage.textureBytes(), bytesOf(VIEW.artSize));
});

test("a gate that throws means phone, and a budget refusal falls back to the phone file", async (t) => {
  const first = await world(t, {
    gate: () => {
      throw Error("probe unavailable");
    },
  });
  await first.w.prepareArea(desktopId);
  assert.equal(first.loads.at(-1), phonePath);
  const { w, loads } = await world(t, { gate: () => true });
  const real = w.admitTexture.bind(w);
  w.admitTexture = (bytes, budget) => {
    if (bytes > bytesOf(VIEW.artSize)) throw Error("London prepared texture budget exceeded; active or in-flight areas retained");
    return real(bytes, budget);
  };
  const stage = await w.prepareArea(desktopId);
  assert.deepEqual(loads.slice(-2), [desktopPath, phonePath]);
  assert.equal(stage.textureBytes(), bytesOf(VIEW.artSize));
});

test("the real budget refuses a desktop texture that does not fit and evicts parked areas first when it can", async (t) => {
  const { w } = await world(t, { gate: () => true });
  const cache = (w.areaCache ??= w.createAreaCache());
  const filler = (bytes) => ({ textureBytes: () => bytes, disposeStage() {} });
  const budget = VIEW.desktopTextureBudgetMiB * MIB;
  cache.stages.set("a", filler(budget - bytesOf(VIEW.desktopArtSize) + 1));
  cache.activeArea = "a";
  assert.throws(() => w.admitTexture(bytesOf(VIEW.desktopArtSize), budget), /budget exceeded/);
  assert.ok(cache.stages.has("a"), "the active area is never evicted");
  cache.activeArea = "other";
  w.admitTexture(bytesOf(VIEW.desktopArtSize), budget);
  assert.ok(!cache.stages.has("a"), "a parked area is evicted to make room");
});
