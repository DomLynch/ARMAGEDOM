import { createHash } from "node:crypto";
import * as T from "three";
import { prepareOpened, prepareOpenedSteps } from "../../src/finisher-opened.js";

// Every value the Opened cut computes on a synthetic skinned rig, as plain data: the baked buffers (hashed), the stats, the pose of the three
// pieces along the whole fall, the start check against walls, and the budget and unsupported-rig failures. Used by the differential test that
// proves a data move changed no value.
const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return "throws " + error.message;
  }
};
const hashAttributes = (g) => {
  const h = createHash("sha256");
  // Quantised to 1e-5: the cap shade and the fall use sin and cos, which differ in the last bit between Mac and Linux V8.
  for (const [name, a] of Object.entries(g.attributes))
    h.update(name).update(Int32Array.from(a.array, (v) => Math.round(v * 1e5)));
  if (g.index) h.update(new Uint8Array(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  for (const g2 of g.groups) h.update(`${g2.start}/${g2.count}/${g2.materialIndex}`);
  return h.digest("hex");
};

function body(name, width, bones, colored) {
  const g = new T.BoxGeometry(width, 1.8, 0.3, 3, 9, 3).translate(0, 0.9, 0);
  const pos = g.getAttribute("position"),
    idx = [],
    wt = [];
  for (let i = 0; i < pos.count; i++) {
    const arm = Math.abs(pos.getX(i)) > width * 0.4 && pos.getY(i) > 0.9;
    idx.push(arm ? 2 : pos.getY(i) > 1 ? 1 : 0, 3, 0, 0);
    wt.push(arm ? 0.8 : 1, arm ? 0.2 : 0, 0, 0);
  }
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(wt, 4));
  if (colored)
    g.setAttribute(
      "color",
      new T.Float32BufferAttribute(
        Array.from({ length: pos.count * 3 }, (_, i) => (i % 7) / 7),
        3,
      ),
    );
  const mesh = new T.SkinnedMesh(g, [new T.MeshStandardMaterial({ color: 0x884422 }), new T.MeshStandardMaterial()]);
  for (let i = 0; i < g.groups.length; i++) g.groups[i].materialIndex = i % 2;
  mesh.name = name;
  mesh.bind(new T.Skeleton(bones));
  return mesh;
}

function rig() {
  const root = new T.Group(),
    model = new T.Group();
  root.add(model);
  const pelvis = new T.Bone(),
    spine = new T.Bone(),
    upper = new T.Bone(),
    hand = new T.Bone();
  pelvis.name = "pelvis";
  spine.name = "spine_01";
  upper.name = "upperarm_l";
  hand.name = "hand_l";
  pelvis.position.set(0, 0.9, 0);
  spine.position.set(0, 0.35, 0);
  upper.position.set(0.2, 0.3, 0);
  hand.position.set(0.1, -0.3, 0);
  pelvis.add(spine);
  spine.add(upper);
  upper.add(hand);
  const held = new T.Group();
  held.name = "WeaponDrawn";
  held.position.set(0.1, -0.1, 0.05);
  const blade = new T.Mesh(new T.BoxGeometry(0.05, 1, 0.3, 1, 4, 2).translate(0, 0.5, 0), new T.MeshStandardMaterial());
  blade.name = "Blade";
  held.add(blade);
  hand.add(held);
  model.add(pelvis);
  const bones = [pelvis, spine, upper, hand];
  model.add(body("Hollow_body_and_worn_trousers", 0.4, bones, true));
  model.add(body("Torn_modern_canvas_jacket", 0.5, bones, false));
  const clip = new T.AnimationClip("Death_SplitCrown", 2, [
    new T.VectorKeyframeTrack("pelvis.position", [0, 2], [0, 0.9, 0, 0.1, 0.5, 0.2]),
  ]);
  return { model, root, clips: [clip] };
}

// Plain data, numbers to 9 decimals (the same last-bit reason as the hashes).
const round = (v) => JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === "number" ? Math.round(x * 1e9) / 1e9 : x));

export function openedValues() {
  const out = { poses: {}, start: {} };
  const prepared = prepareOpened({ ...rig(), isBlocked: () => false });
  out.stats = prepared.stats();
  out.buffers = [];
  prepared.group.traverse((n) => {
    if (n.isMesh) out.buffers.push([n.name, hashAttributes(n.geometry), n.material.color?.getHex?.()]);
  });
  for (let i = 0; i <= 40; i++) {
    const progress = i / 40;
    prepared.update(progress);
    out.poses[progress] = prepared.group.children.map((h) => [h.position.toArray(), h.quaternion.toArray()]);
  }
  out.canStart = prepared.canStart();
  prepared.dispose();
  for (const [name, isBlocked] of [
    ["none", undefined],
    ["free", () => false],
    ["blocked", () => true],
    ["tight", (_p, radius) => radius > 1],
  ]) {
    const p = prepareOpened({ ...rig(), isBlocked });
    out.start[name] = [p.canStart(), p.stats().envelopeRadius];
  }
  out.budget = {
    default: attempt(() => prepareOpened({ ...rig() }).stats().vertices),
    tight: attempt(() => prepareOpened({ ...rig(), maxVertices: 100 }).stats().vertices),
    ground: attempt(() => {
      const p = prepareOpened({ ...rig(), groundY: 0.3 });
      p.update(0.9);
      return p.group.children.map((h) => h.position.y);
    }),
    noClip: attempt(() => prepareOpened({ ...rig(), clips: [] })),
  };
  const steps = prepareOpenedSteps(rig());
  let done;
  while (!(done = steps.next()).done);
  out.steppedBuffers = [];
  done.value.group.traverse((n) => {
    if (n.isMesh) out.steppedBuffers.push(hashAttributes(n.geometry));
  });
  out.steppedStats = done.value.stats();
  return round(out);
}
