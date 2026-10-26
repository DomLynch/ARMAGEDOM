import { areaDisplayName } from "../area-registry.js";
import { rigCapability } from "../rig-capabilities.js";
import { GAME_DATA, fillText } from "./game-data.js";
// Presentation only: authored road edges and safe paths never add collision or travel links.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// The guidance numbers (reach, clearance, rail, arrow and sign geometry) live in visual.json `routeGuidance`.
const tune = () => GAME_DATA.visual.routeGuidance;
const pointOnSegment = (p, a, b) => {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return { x: a.x + t * dx, z: a.z + t * dz };
};
const enters = (p, c) =>
  Object.entries(c).every(([k, v]) =>
    k === "xMin" ? p.x > v : k === "xMax" ? p.x < v : k === "yMin" ? p.y > v : p.y < v,
  );
export function capsuleSegmentClear(g, a, b) {
  if (!g.lineClear(a, b)) return false;
  const { clearance, sampleStep } = tune(),
    steps = Math.max(1, Math.ceil(distance(a, b) / sampleStep));
  for (let i = 0; i <= steps; i++)
    if (!g.clear({ x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps }, clearance)) return false;
  return true;
}
export const TUTORIAL_AREA = "westminster";
// After the shelter the tutorial sends the player after Westminster's two named kills, one at a time: the roaming
// giant salamander, then the Ember Matron whose drop is the flamethrower. Both are followed at their live position.
// Nothing is shown once the Ember Projector is owned (or collected the legacy way), or for a kill that is not in this area.
export function huntTarget(g) {
  if (!g?.enemies || g.flameFuel?.collected || g.bossEquipment?.emberProjector?.status === "owned") return null;
  const live = (e) => e.hp > 0,
    salamander = g.enemies.find((e) => live(e) && rigCapability(e.rig, "tutorialHunt")),
    matron = g.enemies.find((e) => live(e) && e.bossProfile?.name === "Ember Matron"); // text-ok: boss profile name used as a lookup key, never shown
  const text = GAME_DATA.visual.routeGuidance.text;
  if (salamander) return { pos: salamander.pos, label: text.killSalamander };
  if (matron) return { pos: matron.pos, label: text.killMatron };
  // The Matron is dead and her drop is still on the ground: the arrow leads to it instead of falling through to the exit.
  const ember = g.bossEquipment?.emberProjector,
    source = g.world?.bossEquipmentData?.emberProjector?.source;
  return ember?.status === "pending" && ember.dropPosition && source?.areaId === g.world.areaId
    ? { pos: ember.dropPosition, label: text.walkToProjector }
    : null;
}
export function validateGuidance(layout, g, links = null) {
  const rows = layout.guidance ?? [];
  if (!Array.isArray(rows) || rows.length > 5) throw Error("Invalid route guidance");
  const ids = new Set();
  const point = (p) =>
    p && Object.keys(p).length === 2 && ["x", "y"].every((k) => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1);
  return rows.map((row) => {
    if (
      !row ||
      Object.keys(row).some((k) => !["id", "kind", "to", "path", "edge", "segment", "sign"].includes(k)) ||
      (row.sign !== undefined &&
        (row.kind !== "exit" ||
          !Array.isArray(row.sign) ||
          row.sign.length < 1 ||
          row.sign.length > 2 ||
          row.sign.some((line) => typeof line !== "string" || !/^[A-Z0-9 ·→-]{1,22}$/.test(line)))) ||
      typeof row.id !== "string" ||
      !/^[a-z0-9-]+$/.test(row.id) ||
      ids.has(row.id) ||
      !["boundary", "exit"].includes(row.kind) ||
      typeof row.to !== "string" ||
      !Array.isArray(row.path) ||
      row.path.length < 2 ||
      row.path.length > 5 ||
      !row.path.every(point)
    )
      throw Error("Invalid route guidance");
    ids.add(row.id);
    const path = row.path.map(g.ground);
    if (
      path.some((p) => !g.clear(p, tune().clearance)) ||
      path.slice(1).some((p, i) => distance(path[i], p) < 0.1 || !capsuleSegmentClear(g, path[i], p))
    )
      throw Error("Blocked route guidance path");
    if (links && !links.some((link) => link.to === row.to && enters(row.path.at(-1), link.condition)))
      throw Error("Route guidance misses existing exit");
    let segment = null;
    if (row.kind === "boundary") {
      if (
        !Number.isInteger(row.edge) ||
        row.edge < 0 ||
        row.edge >= g.road.length ||
        !Array.isArray(row.segment) ||
        row.segment.length !== 2 ||
        !row.segment.every(point)
      )
        throw Error("Invalid route boundary");
      segment = row.segment.map(g.ground);
      const a = g.road[row.edge],
        b = g.road[(row.edge + 1) % g.road.length];
      if (distance(...segment) < 0.2 || segment.some((p) => distance(p, pointOnSegment(p, a, b)) > 1e-6))
        throw Error("Route boundary leaves road edge");
    } else if (row.edge !== undefined || row.segment !== undefined) throw Error("Exit guidance cannot close road");
    return { ...row, path, segment };
  });
}
// An intra-area tutorial path is not an exit and never changes the travel graph.
export function validateTutorialPath(layout, g) {
  const path = layout.tutorialPath;
  if (path === undefined) return null;
  if (
    !Array.isArray(path) ||
    path.length < 2 ||
    path.length > 12 ||
    path.some(
      (p) =>
        !p || Object.keys(p).length !== 2 || !["x", "y"].every((k) => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1),
    )
  )
    throw Error("Invalid shelter tutorial path");
  const points = path.map(g.ground);
  if (points.some((p) => !g.clear(p, tune().clearance)) || points.slice(1).some((p, i) => !capsuleSegmentClear(g, points[i], p)))
    throw Error("Blocked shelter tutorial path");
  return { id: "westminster-shelter-tutorial", kind: "tutorial", to: "westminster", path: points };
}
export function resolveGuidance(rows, g, position) {
  const { boundaryReach, exitReach, boundaryStartReach } = tune();
  let selected = null;
  for (const row of rows) {
    const gap =
      row.kind === "boundary"
        ? distance(position, pointOnSegment(position, ...row.segment))
        : Math.min(...row.path.slice(1).map((p, i) => distance(position, pointOnSegment(position, row.path[i], p))));
    if (
      gap > (row.kind === "boundary" ? boundaryReach : exitReach) ||
      (distance(position, row.path[0]) > boundaryStartReach && row.kind === "boundary")
    )
      continue;
    // Choose a visible-in-collision-space waypoint; never point through a prop or across the road edge.
    let index = -1;
    for (let i = row.path.length - 1; i >= 0; i--)
      if (distance(position, row.path[i]) > tune().waypointMin && capsuleSegmentClear(g, position, row.path[i])) {
        index = i;
        break;
      }
    if (index < 0) continue;
    const remaining =
      distance(position, row.path[index]) +
      row.path.slice(index + 1).reduce((n, p, i) => n + distance(row.path[index + i], p), 0);
    if (!selected || gap < selected.gap) selected = { row, target: row.path[index], index, gap, remaining };
  }
  return selected;
}
export function createRouteGuidance(world) {
  const rows = validateGuidance(world.layout, world.geometry),
    tutorial = validateTutorialPath(world.layout, world.geometry);
  if (!rows.length && !tutorial) return null;
  const { THREE, geometry: g } = world,
    group = new THREE.Group();
  group.name = "Registered road guidance"; // text-ok: internal mesh name
  world.group.add(group);
  const { rail, marker: markerShape } = tune(),
    positions = [],
    colors = [],
    indices = [],
    box = new THREE.BoxGeometry(1, 1, 1),
    v = new THREE.Vector3(),
    matrix = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  function cuboid(center, size, yaw, color) {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    matrix.compose(center, rotation, scale.set(...size));
    const start = positions.length / 3,
      c = new THREE.Color(color);
    for (let i = 0; i < box.attributes.position.count; i++) {
      v.fromBufferAttribute(box.attributes.position, i).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
    }
    for (const index of box.index.array) indices.push(start + index);
  }
  for (const row of rows.filter((r) => r.segment)) {
    const [a, b] = row.segment,
      dx = b.x - a.x,
      dz = b.z - a.z,
      length = distance(a, b),
      mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; // tuning-ok: midpoint
    let nx = -dz / length,
      nz = dx / length;
    if (g.clear({ x: mid.x + nx * rail.sideProbe, z: mid.z + nz * rail.sideProbe }, 0)) {
      nx = -nx;
      nz = -nz;
    }
    const at = (t, y) =>
        world.toRender({ x: a.x + dx * t + nx * rail.sideOffset, z: a.z + dz * t + nz * rail.sideOffset }, y),
      yaw = Math.atan2(dz, dx);
    for (let i = 0; i < rail.segments; i++)
      cuboid(
        at((i + 0.5) / rail.segments, rail.centreHeight), // tuning-ok: centre of the segment cell
        [length / rail.segments, rail.thickness, rail.depth],
        yaw,
        `#${rail.colours[i % 2]}`, // tuning-ok: alternate the two rail colours
      );
    for (const t of rail.post.along)
      cuboid(at(t, rail.post.centreHeight), [rail.post.width, rail.post.height, rail.post.width], 0, `#${rail.post.colour}`);
  }
  box.dispose();
  let barrier = null;
  if (positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); // tuning-ok: x, y, z per vertex
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); // tuning-ok: r, g, b per vertex
    geo.setIndex(indices);
    barrier = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    barrier.name = "Road closed rail outside authored boundary"; // text-ok: internal mesh name
    group.add(barrier);
  }
  // Mark the actual threshold of an exit (a gold ring and a sign); the marker never expands its trigger. The Central Safehouse side
  // entrance has always had one; any other exit row can ask for one with `sign: [line, line]`.
  const markers = [];
  function addMarker(row, name, lines) {
    const marker = new THREE.Group(),
      at = row.path.at(-1);
    marker.name = name;
    marker.position.copy(world.toRender(at, markerShape.height));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(markerShape.ring.inner, markerShape.ring.outer, markerShape.ring.segments),
      new THREE.MeshBasicMaterial({
        color: `#${markerShape.ring.colour}`,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2; // tuning-ok: lay the ring flat
    marker.add(ring);
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const card = markerShape.sign;
      [canvas.width, canvas.height] = card.canvas;
      const ctx = canvas.getContext?.("2d");
      if (ctx) {
        ctx.fillStyle = "rgba(22,23,20,.92)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#dfba59";
        ctx.lineWidth = card.borderWidth;
        ctx.strokeRect(...card.border);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f1d28c";
        ctx.font = card.fonts[0];
        ctx.fillText(lines[0], card.textX, card.lineY[0]);
        ctx.font = card.fonts[1];
        ctx.fillText(lines[1] ?? "", card.textX, card.lineY[1]);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, toneMapped: false }));
        sign.scale.set(...card.size, 1);
        sign.position.y = card.height;
        marker.add(sign);
      }
    }
    group.add(marker);
    markers.push({ marker, at });
  }
  const entrance = rows.find((row) => row.to === "central-hub");
  if (entrance) addMarker(entrance, "Central Safehouse side entrance", tune().text.entranceSign); // text-ok: internal mesh name
  for (const row of rows.filter((r) => r.sign && r !== entrance))
    addMarker(row, `${areaDisplayName(row.to)} exit marker`, row.sign); // text-ok: internal mesh name
  let cachedPosition = null,
    cached = null,
    disposed = false,
    tutorialActive = false,
    pistolTarget = null,
    hunt = null,
    arrival = null;
  function setTutorial(active) {
    if (tutorialActive !== !!active) {
      tutorialActive = !!active;
      cachedPosition = null;
    }
  }
  // The uncollected starting pistol is the first stop of the opening tutorial, ahead of the shelter.
  function setPistolTarget(position) {
    const next = position ? { x: position.x, z: position.z } : null;
    if (next?.x !== pistolTarget?.x || next?.z !== pistolTarget?.z) {
      pistolTarget = next;
      cachedPosition = null;
    }
  }
  // The salamander/Ember Matron target follows a moving enemy, so a change of position drops the cached cue.
  function setHuntTarget(next) {
    const to = next ? { pos: { x: next.pos.x, z: next.pos.z }, label: next.label } : null;
    if (to?.pos.x !== hunt?.pos.x || to?.pos.z !== hunt?.pos.z || to?.label !== hunt?.label) {
      hunt = to;
      cachedPosition = null;
    }
  }
  function arrive(from, position) {
    arrival = { from, position: { ...position } };
    cachedPosition = null;
  }
  function resolve(position) {
    if (!cachedPosition || distance(cachedPosition, position) > 1e-8) {
      cachedPosition = { ...position };
      if (arrival && distance(position, arrival.position) > tune().arrivalRadius) arrival = null;
      const toPistol = tutorialActive && pistolTarget ? distance(position, pistolTarget) : 0;
      if (toPistol > tune().pistolArrived &&capsuleSegmentClear(g, position, pistolTarget))
        return (cached = {
          row: { id: "pistol-first", kind: "pistol", to: "westminster" },
          target: pistolTarget,
          index: 0,
          gap: 0,
          remaining: toPistol,
        });
      const toHunt = !tutorialActive && hunt ? distance(position, hunt.pos) : 0;
      if (toHunt > tune().huntArrived)
        return (cached = {
          row: { id: "hunt", kind: "hunt", to: "westminster", label: hunt.label },
          target: hunt.pos,
          index: 0,
          gap: 0,
          remaining: toHunt,
        });
      cached = resolveGuidance(
        tutorialActive && tutorial ? [tutorial] : rows.filter((row) => row.to !== arrival?.from),
        g,
        position,
      );
    }
    return cached;
  }
  function update(position, activeWorld = world) {
    for (const { marker, at } of markers) marker.visible = distance(position, at) < markerShape.showDistance;
  }
  function hint(position, activeWorld = world) {
    const cue = resolve(position);
    if (!cue) return "";
    if (activeWorld.travelAt(position)) return "";
    const a = activeWorld.toRender(position).project(activeWorld.camera),
      b = activeWorld.toRender(cue.target).project(activeWorld.camera),
      angle = Math.atan2(b.y - a.y, b.x - a.x),
      text = tune().text,
      marks = text.compass.length, // one compass mark per equal slice of the circle
      direction = text.compass[(Math.round((angle / (Math.PI + Math.PI)) * marks) + marks) % marks],
      name =
        cue.row.kind === "pistol"
          ? text.pistol
          : cue.row.kind === "hunt"
            ? cue.row.label
            : cue.row.kind === "tutorial"
              ? text.shelter
              : areaDisplayName(cue.row.to).toUpperCase();
    if (cue.row.kind === "exit" && cue.index === cue.row.path.length - 1 && cue.remaining < markerShape.exitHintRemaining)
      return fillText(text.exit, { area: name });
    if (activeWorld.areaId !== TUTORIAL_AREA) return ""; // outside Westminster only the exit label above is shown
    return fillText(text.cue, {
      closed: cue.row.kind === "boundary" ? text.roadClosed : "",
      direction,
      name,
      metres: Math.ceil(cue.remaining),
    });
  }
  return {
    rows,
    group,
    barrier,
    update,
    hint,
    resolve,
    setTutorial,
    setPistolTarget,
    setHuntTarget,
    arrive,
    allowsExitHint: (to) => !tutorialActive && to !== arrival?.from,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
    },
  };
}
