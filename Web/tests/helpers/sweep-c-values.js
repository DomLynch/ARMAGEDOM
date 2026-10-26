import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as T from "three";
import { bodyLineClear, createBridgeSteering } from "../../src/bridge-steering.js";
import { createDroneLaserBolts } from "../../src/drone-laser.js";
import { prepareSplitCrown, prepareSplitCrownSteps } from "../../src/finisher-crown.js";
import { applyFinisherCorpseCosmetic } from "../../src/engine/finisher-cosmetics.js";
import { FINISHER_DATA } from "../../src/engine/finisher-data.js";
import { createSeverBloodEffect } from "../../src/engine/sever-blood-effect.js";
import { createGeometry } from "../../src/world-geometry.js";
import { GAME_DATA } from "../../src/engine/game-data.js";

// Every value the five modules of sweep batch C compute, as plain data: the bridge steering clearance and route following over a synthetic
// wall, the drone laser bolt meshes, the split crown buffers and open pose, the finisher corpse cosmetic colours, and the sever blood effect
// slots on real Westminster ground. Used by the differential test that proves a data move changed no value.
const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return "throws " + error.message;
  }
};
const round = (v) => JSON.parse(JSON.stringify(v));
const hashAttributes = (g) => {
  const h = createHash("sha256");
  for (const [name, a] of Object.entries(g.attributes))
    h.update(name).update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  if (g.index) h.update(new Uint8Array(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  return h.digest("hex");
};

function bridge() {
  // A wall along x = 0 from z = -6 to z = 6, and a road bend chain that runs around its north end: each area's chain is spread evenly
  // along the polyline (-4, 0) -> (-4, 7) -> (4, 7) -> (4, 0), so the steering has a legal detour to follow.
  const wall = [
    [
      { x: 0, z: -6 },
      { x: 0, z: 6 },
    ],
  ];
  const path = [
    { x: -4, z: 0 },
    { x: -4, z: 9 },
    { x: 4, z: 9 },
    { x: 4, z: 0 },
  ];
  const along = (t) => {
    const legs = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z)),
      total = legs.reduce((a, b) => a + b, 0);
    let rest = t * total;
    for (let i = 0; i < legs.length; i++) {
      if (rest <= legs[i] || i === legs.length - 1) {
        const f = Math.min(1, rest / legs[i]);
        return { x: path[i].x + (path[i + 1].x - path[i].x) * f, z: path[i].z + (path[i + 1].z - path[i].z) * f };
      }
      rest -= legs[i];
    }
  };
  const groundOf = (area) => {
    const chain = GAME_DATA.atmosphere.bends[area];
    return ({ x, y }) => along(chain.findIndex(([cx, cy]) => cx === x && cy === y) / (chain.length - 1));
  };
  const geometryFor = (area) => ({
    edges: wall,
    clear: () => true,
    lineClear(a, b) {
      return !((a.x < 0 && b.x > 0) || (a.x > 0 && b.x < 0)) || Math.max(a.z, b.z) > 6 || Math.min(a.z, b.z) < -6;
    },
    ground: area === "south" ? ({ x, y }) => ({ x, z: y }) : groundOf(area),
  });
  const geometry = geometryFor("westminster");
  const out = { clear: {}, steps: [] };
  for (const gap of [0.05, 0.06, 0.061, 0.0610001, 0.0611, 0.07, 0.2])
    for (const radius of [0.1, 0.3])
      out.clear[`${gap}/${radius}`] = bodyLineClear(
        geometry,
        { x: radius + gap, z: 0 },
        { x: radius + gap, z: 2 },
        radius,
      );
  // Walks: "run" 0.5 m a step for 30 steps then stands still (the 0.75 s stall limit), "creep09" 0.09 m a step (just over the 0.08 m
  // progress limit) and "creep06" 0.06 m a step (just under it), "still" never moves. The actor stops 0.12 m short of each waypoint
  // to exercise the 0.15 m waypoint reach.
  const walks = { run: [0.5, 30], creep09: [0.09, 80], creep06: [0.06, 80], still: [0, 0] };
  for (const area of ["westminster", "east", "south"])
    for (const leash of [undefined, 3, 12.5])
      for (const home of [undefined, { x: -3, z: 0 }])
        for (const [walk, [speed, steps]] of Object.entries(walks)) {
          const steering = createBridgeSteering(),
            actor = { pos: { x: -3, z: 0 }, radius: 0.3, home },
            goal = { x: 3, z: 0 },
            world = { geometry: geometryFor(area), areaId: area },
            trace = [];
          for (let i = 0; i < 120; i++) {
            const time = i * 0.05,
              target = steering.steer({
                world,
                actor,
                goal,
                time,
                mode: "pursuit",
                ...(leash === undefined ? {} : { leash }),
              });
            trace.push([target.x, target.z]);
            if (i < steps) {
              const dx = target.x - actor.pos.x,
                dz = target.z - actor.pos.z,
                d = Math.hypot(dx, dz) || 1,
                move = Math.min(speed, Math.max(0, d - 0.12));
              actor.pos = { x: actor.pos.x + (dx / d) * move, z: actor.pos.z + (dz / d) * move };
            }
          }
          out.steps.push({ area, walk, leash: leash ?? null, home: Boolean(home), trace, end: actor.pos });
        }
  return round(out);
}
function laser() {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(),
    world = { toRender: (p, y) => new T.Vector3(p.x, y, -p.z) },
    view = createDroneLaserBolts({ scene, world, camera }),
    out = { frames: [], stats: null };
  camera.position.set(0, 5, 5);
  camera.updateMatrixWorld();
  for (const time of [0, 0.01, 0.05, 0.2, 0.5, 1]) {
    view.sync(
      [
        { id: "b1", pos: { x: 1, z: 2 }, dir: { x: 1, z: 0.5 }, born: 0, expires: 3, speed: 12 },
        { id: "b2", pos: { x: -1, z: 0 }, dir: { x: 0, z: 1 }, expires: 4 },
      ],
      time,
    );
    out.frames.push(
      scene.children.map((m) => ({
        name: m.name,
        pos: m.position.toArray(),
        scale: m.scale.toArray(),
        q: m.quaternion.toArray(),
        visible: m.visible,
        length: m.material.uniforms.lengthMetres.value,
      })),
    );
  }
  out.stats = view.stats();
  view.dispose();
  return round(out);
}
function crown() {
  const head = () => {
    const group = new T.Group(),
      mesh = new T.Mesh(new T.BoxGeometry(0.2, 0.3, 0.2, 4, 4, 4), new T.MeshBasicMaterial());
    mesh.name = "Photo";
    group.add(mesh);
    return { group, center: new T.Vector3(0, 0, 0), mesh };
  };
  const prepared = prepareSplitCrown(head()),
    cut = prepared.caps[0].material,
    out = {
      stats: prepared.stats(),
      cut: { color: cut.color.getHex(), roughness: cut.roughness, side: cut.side, name: cut.name },
      buffers: [],
      open: {},
    };
  prepared.group.traverse((n) => {
    if (n.isMesh) out.buffers.push(hashAttributes(n.geometry));
  });
  for (const amount of [-1, 0, 0.25, 0.5, 1, 2]) {
    prepared.open(amount);
    out.open[amount] = prepared.halves.map((h) => [h.rotation.z, h.position.x]);
  }
  prepared.dispose();
  const big = () => {
    const h = head();
    h.mesh.geometry = new T.BoxGeometry(0.2, 0.3, 0.2, 40, 40, 40);
    return h;
  };
  out.budget = {
    default: attempt(() => prepareSplitCrown(big()).stats().vertices),
    tight: attempt(() => prepareSplitCrown(big(), { maxVertices: 100 }).stats().vertices),
    loose: attempt(() => prepareSplitCrown(head(), { maxVertices: 1e6 }).stats().vertices),
  };
  const steps = prepareSplitCrownSteps(head());
  let done;
  while (!(done = steps.next()).done);
  out.stepped = hashAttributes(done.value.caps[0].geometry);
  return round(out);
}
function cosmetics() {
  const out = {};
  for (const binding of FINISHER_DATA.bindings) {
    const recipeId = binding.fallback;
    for (const age of [0, 0.2, 0.7, 1.9, 5, 60]) {
      const color = new T.Color(0.4, 0.3, 0.2),
        emissive = new T.Color(0.1, 0.05, 0.02),
        material = { color: color.clone(), emissive: emissive.clone(), emissiveIntensity: 0 },
        view = { flashMaterials: [{ material, color, emissive, intensity: 0.5 }], finisherAge: age },
        applied = applyFinisherCorpseCosmetic(view, { hp: 0, finisher: { recipeId } });
      out[`${recipeId}/${age}`] = {
        applied,
        color: material.color.toArray(),
        emissive: material.emissive.toArray(),
        intensity: material.emissiveIntensity,
      };
    }
  }
  return round(out);
}
function blood() {
  const layout = JSON.parse(readFileSync(new URL("../../public/world/westminster/layout.json", import.meta.url))),
    geometry = createGeometry(layout),
    p = geometry.ground({ x: 0.52, y: 0.78 }),
    scene = new T.Scene(),
    world = { layout, geometry, areaId: "westminster", toRender: (point, y) => new T.Vector3(point.x, y, -point.z) },
    anchors = { head: { x: p.x, y: 1.6, z: -p.z }, neckNormal: { x: 0, y: 1, z: 0 } },
    token = { finisherAge: 0, finisher: { impactAnchors: () => anchors } },
    fx = createSeverBloodEffect({ THREE: T, scene, world }),
    out = { started: fx.start(token, { palette: [0x310508, 0x831428] }, anchors), frames: [] };
  const group = scene.children[0];
  out.slots = group.children
    .slice(0, 2)
    .map((m) => ({
      name: m.name,
      type: m.geometry.type,
      parameters: m.geometry.parameters,
      color: m.material.color.getHex(),
      order: m.renderOrder,
    }));
  for (const dt of [0.1, 0.11, 0.2, 0.4, 1]) {
    fx.update(dt);
    out.frames.push({
      snapshot: fx.snapshot(),
      meshes: group.children
        .filter((m) => m.visible)
        .map((m) => ({
          name: m.name,
          pos: m.position.toArray(),
          scale: m.scale.toArray(),
          opacity: m.material.opacity,
        })),
    });
  }
  return round(out);
}
export function sweepCValues() {
  return { bridge: bridge(), laser: laser(), crown: crown(), cosmetics: cosmetics(), blood: blood() };
}
