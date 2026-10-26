import * as T from "three";
import { createWorld } from "../../world.js";
import { loadActors, createActors } from "../../actors.js";
import { createDroneLaserBolts } from "../../drone-laser.js";
import { posedActorBounds } from "../grenade-surface.js";
import { applyAreaLighting } from "../area-lighting.js";
import { COMMANDER_RULES } from "./match.js";
import { COMMANDER_VIEW } from "./view-data.js";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export async function createCommanderView({ canvas, baseUrl, signal }) {
  const V = COMMANDER_VIEW,
    ASPECT = V.backdropSize[0] / V.backdropSize[1],
    hex = (c) => `#${c}`,
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera(),
    fill = new T.HemisphereLight(hex(V.fillLight.sky), hex(V.fillLight.ground), V.fillLight.intensity),
    sun = new T.DirectionalLight(hex(V.sun.colour), V.sun.intensity);
  sun.position.set(...V.sun.position);
  scene.add(fill, sun);
  let world, library;
  const settled = await Promise.allSettled([
    createWorld({ THREE: T, scene, camera, baseUrl }),
    loadActors(baseUrl, () => {}, "assets/manifest-hollow.json"),
  ]);
  if (settled.some((r) => r.status === "rejected")) {
    for (const r of settled) if (r.status === "fulfilled") r.value.dispose();
    throw settled.find((r) => r.status === "rejected").reason;
  }
  [world, library] = settled.map((r) => r.value);
  if (signal?.aborted) {
    library.dispose();
    world.dispose();
    return null;
  }
  let ray,
    hit,
    crop,
    renderer,
    actors,
    lasers,
    ringGeometry,
    objectiveGeometry,
    objectiveMaterial,
    objectiveRing,
    resourcesDisposed = false;
  const rings = new Map();
  function disposeResources() {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    const cleanups = [
      () => renderer?.setAnimationLoop(null),
      () => lasers?.dispose(),
      () => {
        for (const m of rings.values()) {
          m.removeFromParent();
          m.material.dispose();
        }
        rings.clear();
      },
      () => ringGeometry?.dispose(),
      () => objectiveRing?.removeFromParent(),
      () => objectiveGeometry?.dispose(),
      () => objectiveMaterial?.dispose(),
      () => (actors ? actors.dispose() : library.dispose()),
      () => world.dispose(),
      () => renderer?.dispose(),
    ];
    for (const cleanup of cleanups)
      try {
        cleanup();
      } catch (error) {
        console.error("Commander resource cleanup failed", error);
      }
  }
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, V.maxPixelRatio));
    applyAreaLighting(scene, world);
    if (world.routeGuidance?.group) world.routeGuidance.group.visible = false;
    actors = createActors(scene, world, library, { visualScale: V.actorScale, droneAppearance: "commander-compact-black" });
    lasers = createDroneLaserBolts({ scene, world, camera });
    ringGeometry = new T.RingGeometry(V.unitRing.inner, V.unitRing.outer, V.unitRing.segments);
    objectiveGeometry = new T.RingGeometry(
      COMMANDER_RULES.captureRadius - V.objectiveRing.width,
      COMMANDER_RULES.captureRadius,
      V.objectiveRing.segments,
    );
    objectiveMaterial = new T.MeshBasicMaterial({
      color: hex(V.objectiveRing.captureColour),
      transparent: true,
      opacity: V.objectiveRing.opacity,
      depthWrite: false,
      side: T.DoubleSide,
    });
    objectiveRing = new T.Mesh(objectiveGeometry, objectiveMaterial);
    objectiveRing.rotation.x = -Math.PI / 2; // tuning-ok: lays the ring flat on the ground
    scene.add(objectiveRing);
    ray = new T.Raycaster();
    hit = new T.Vector3();
    crop = new T.Matrix4();
  } catch (error) {
    disposeResources();
    throw error;
  }
  let width = 1,
    height = 1,
    focus = { ...V.startFocus },
    zx = 1,
    zy = 1,
    disposed = false;
  // Only the calibrated projection crop changes. The painted backdrop/masks,
  // camera position/FOV and all body coordinates keep their shared registration.
  function frameCamera() {
    const aspect = width / height;
    zx = Math.max(1, ASPECT / aspect);
    zy = Math.max(1, aspect / ASPECT);
    const ex = 0.5 / zx, // tuning-ok: half the painting
      ey = 0.5 / zy; // tuning-ok: half the painting
    focus.x = clamp(focus.x, ex, 1 - ex);
    focus.y = clamp(focus.y, ey, 1 - ey);
    crop.identity();
    crop.elements[0] = zx;
    crop.elements[5] = zy;
    crop.elements[12] = -2 * zx * (focus.x - 0.5); // tuning-ok: painting fraction to NDC offset
    crop.elements[13] = 2 * zy * (focus.y - 0.5); // tuning-ok: painting fraction to NDC offset
    camera.projectionMatrix.multiplyMatrices(crop, world.calibrated);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth || innerWidth);
    height = Math.max(1, canvas.clientHeight || innerHeight);
    renderer.setSize(width, height, false);
    frameCamera();
  }
  function renderFrame(s) {
    return {
      player: s.units[0],
      enemies: [...s.units.slice(1), ...s.opponents],
      corpses: [],
      world,
      time: s.time,
      finished: !!s.result,
      events: s.events,
      pilot: "donor-knife",
      bolts: s.bolts,
      loot: [],
      bossEquipment: {},
      flame: null,
    };
  }
  return {
    world,
    actors,
    renderer,
    camera,
    async prepare(s) {
      if (disposed) return false;
      await actors.ensureAreaModels(renderFrame(s));
      if (disposed) return false;
      resize();
      this.recentre(s);
      this.render(s, 0);
      return true;
    },
    async reset(s) {
      if (disposed) return false;
      actors.reset();
      lasers.reset();
      return this.prepare(s);
    },
    render(s, dt, { paused = false, events = [] } = {}) {
      if (disposed) return;
      const g = renderFrame(s);
      g.events = events;
      actors.events(g);
      actors.update(g, paused ? 0 : dt);
      lasers.sync(paused ? [] : s.bolts, s.time);
      objectiveRing.position.copy(world.toRender(s.objective.pos, V.objectiveRing.height));
      objectiveMaterial.color.set(hex(s.phase === "capture" ? V.objectiveRing.captureColour : V.objectiveRing.otherColour));
      objectiveRing.visible = !s.result;
      const liveIds = new Set(s.units.filter((e) => e.hp > 0).map((e) => e.id));
      for (const [id, m] of rings)
        if (!liveIds.has(id)) {
          m.removeFromParent();
          m.material.dispose();
          rings.delete(id);
        }
      for (const e of s.units.filter((e) => e.hp > 0)) {
        let m = rings.get(e.id);
        if (!m) {
          m = new T.Mesh(
            ringGeometry,
            new T.MeshBasicMaterial({
              color: hex(V.unitRing.colour),
              transparent: true,
              opacity: V.unitRing.opacity,
              depthWrite: false,
              side: T.DoubleSide,
            }),
          );
          m.rotation.x = -Math.PI / 2; // tuning-ok: lays the ring flat on the ground
          scene.add(m);
          rings.set(e.id, m);
        }
        m.position.copy(world.toRender(e.pos, V.unitRing.height));
        m.material.opacity = s.selected.includes(e.id) ? V.unitRing.selectedOpacity : V.unitRing.idleOpacity;
      }
      renderer.render(scene, camera);
    },
    resize,
    pan(dx, dy) {
      focus.x += dx;
      focus.y += dy;
      frameCamera();
    },
    drag(dx, dy) {
      this.pan(-dx / (width * zx), -dy / (height * zy));
    },
    recentre(s) {
      focus = world.geometry.point(s.objective.pos);
      frameCamera();
    },
    project(p, y = 0) {
      const v = world.toRender(p, y).project(camera);
      return {
        x: ((v.x + 1) * width) / 2, // tuning-ok: NDC to pixels
        y: ((1 - v.y) * height) / 2, // tuning-ok: NDC to pixels
        visible: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && Math.abs(v.z) <= 1,
      };
    },
    ground(x, y) {
      return world.screenToGround((x / width) * 2 - 1, 1 - (y / height) * 2); // tuning-ok: pixels to NDC
    },
    pick(s, x, y) {
      ray.setFromCamera({ x: (x / width) * 2 - 1, y: 1 - (y / height) * 2 }, camera); // tuning-ok: pixels to NDC
      const cover = ray.intersectObjects(world.masks, false)[0]?.distance ?? Infinity;
      let best = null;
      for (const e of [...s.units, ...s.opponents].filter((e) => e.hp > 0)) {
        const box = posedActorBounds(actors.views.get(e.id));
        if (!box) continue;
        box.expandByScalar(V.pick.boxPadding);
        const p = ray.ray.intersectBox(box, hit);
        if (!p) continue;
        const d = ray.ray.origin.distanceTo(p);
        if (d < cover - 1e-8 && (!best || d < best.distance)) best = { id: e.id, team: e.team, distance: d };
      }
      return best;
    },
    diagnostics(s) {
      return {
        viewport: { width, height },
        camera: { position: camera.position.toArray(), fov: camera.fov, focus: { x: focus.x, y: focus.y } },
        objective: this.project(s.objective.pos),
        units: s.units.map((e) => ({
          id: e.id,
          point: this.project(e.pos, V.diagnostics.unitHeight),
          rootScale: actors.views.get(e.id)?.root.scale.x,
          viewName: actors.views.get(e.id)?.root.name,
        })),
        opponents: s.opponents.filter((e) => e.hp > 0).map((e) => ({ id: e.id, point: this.project(e.pos, V.diagnostics.opponentHeight) })),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeResources();
    },
  };
}
