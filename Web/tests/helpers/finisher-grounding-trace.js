import fs from "node:fs";
import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { loadGeometry } from "../../../art/donor/probe.mjs";
import { prepareVictimGrounding } from "../../src/finisher-grounding.js";

const round = (n) => Math.round(n * 1e9) / 1e9;

// The victim-grounding table of the real Hollow death clip: the lift envelope at 241 phases and the table statistics, for two actors
// (plain, and posed/scaled), with the shared cache used a second time.
export async function finisherGroundingTrace() {
  const manifest = JSON.parse(fs.readFileSync(new URL("../../public/assets/manifest-hollow.json", import.meta.url))),
    description = manifest.models["hollow-scavenger"],
    asset = await loadGeometry(fs.readFileSync(new URL("../../public/assets/" + description.url, import.meta.url))),
    clip = asset.animations.find((c) => c.name === "Death_RunThrough"),
    out = [];
  for (const variant of [0, 1]) {
    const root = new T.Group(),
      model = clone(asset.scene);
    root.add(model);
    root.position.set(variant ? 17 : 0, 0.1, variant ? -3 : 0);
    root.rotation.set(0.1, 0.7, 0.02);
    root.scale.setScalar(variant ? 1.73 : 1.265);
    const cache = new WeakMap(),
      first = prepareVictimGrounding({ root, model, clip, cache }),
      second = prepareVictimGrounding({ root, model, clip, cache }),
      row = { lift: [], second: [] };
    for (let i = 0; i <= 240; i++) {
      row.lift.push(round(first.lift(i / 240)));
      row.second.push(round(second.lift(i / 240)));
    }
    const s = first.stats(),
      s2 = second.stats();
    row.stats = [s.clip, s.samples, s.vertices, s.bytes, round(s.worstLocalFloor), round(s.maxLocalLift), s.draws];
    row.cacheHits = [s.cacheHits, s2.cacheHits > 0];
    // A coarser table, as a caller with a smaller budget would ask for.
    const coarse = prepareVictimGrounding({ root, model, clip, samples: 24 });
    row.coarse = [coarse.stats().samples, ...Array.from({ length: 25 }, (_, i) => round(coarse.lift(i / 24)))];
    out.push(row);
  }
  return out;
}
