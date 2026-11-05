import * as T from "three";
import { GAME_DATA } from "./game-data.js";
import { collectTelegraphs, createTelegraphSet, growth, opacityAt, telegraphOn } from "./telegraph.js";
import { fillBuffers, pointCapacity, shapePoints, stripBuffers } from "./telegraph-shape.js";

// The ground shape that fills up before an enemy attack lands (data/telegraph.json; engine/telegraph.js says which attacks and what
// shape). Each telegraph is a dark halo, a bright outline and a striped fill that grows from where the attack starts and is the whole
// shape when the hit lands. It reads without colour: the outline brightens from dim to full and the fill is striped, so a colour-blind
// player still sees a hatched shape filling in. Under prefers-reduced-motion the fill is a static striped shape at one opacity.
// The meshes are a fixed pool of `maxVisible` slots made on first use and reused for every attack. A slot's buffers are rewritten only
// when the shape it shows changes (a new attack), never per frame, and one stripe texture is shared by all of them.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MAX_INDEX = 65535; // tuning-ok: the largest vertex a 16-bit index can name

// A diagonal-stripe alpha texture: one solid band and one lighter band per repeat.
function stripeTexture(pattern) {
  const size = pattern.cells,
    data = new Uint8Array(size * size * 4); // tuning-ok: four bytes per RGBA pixel
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = 4 * (y * size + x), // tuning-ok: four bytes per RGBA pixel
        solid = ((x + y) % size) / size < pattern.solidShare;
      data.fill(255, i, i + 3); // tuning-ok: the white colour channels
      data[i + 3] = Math.round((solid ? 1 : pattern.gapOpacity) * 255); // tuning-ok: byte alpha
    }
  const texture = new T.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.magFilter = texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function buffered(vertices, indices, uv) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(vertices * 3), 3)); // tuning-ok: x, y, z per vertex
  if (uv) geometry.setAttribute("uv", new T.BufferAttribute(new Float32Array(vertices * 2), 2)); // tuning-ok: u, v per vertex
  geometry.setIndex(
    new T.BufferAttribute(indices <= MAX_INDEX ? new Uint16Array(indices) : new Uint32Array(indices), 1),
  );
  geometry.setDrawRange(0, 0);
  return geometry;
}

// s: the session (game, scene, loaded, contextLost, traveling, world). options: rules, search, matchMedia (tests).
export function createTelegraphView(s, options = {}) {
  const rules = options.rules ?? GAME_DATA.telegraph;
  if (!telegraphOn(rules, options.search)) return { update() {}, dispose() {}, slots: [] };
  const query = options.matchMedia ?? globalThis.matchMedia?.bind(globalThis),
    motion = query?.(REDUCED_MOTION),
    capacity = pointCapacity(rules),
    points = new Float32Array(2 * capacity), // tuning-ok: x, z per outline point
    set = createTelegraphSet(rules.maxVisible),
    slots = [],
    texture = stripeTexture(rules.pattern);
  let disposed = false;

  function material(colour, map = null) {
    return new T.MeshBasicMaterial({
      color: `#${colour}`,
      map,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
  }
  function create() {
    const root = new T.Group(),
      fillGeometry = buffered(capacity + 1, 3 * capacity, true), // tuning-ok: a fan vertex per point plus the origin, three indices a triangle
      haloGeometry = buffered(2 * capacity, 6 * capacity, false), // tuning-ok: two vertices a point, six indices an edge
      edgeGeometry = buffered(2 * capacity, 6 * capacity, false), // tuning-ok: two vertices a point, six indices an edge
      fill = new T.Mesh(fillGeometry, material(rules.colours.fill, texture)),
      halo = new T.Mesh(haloGeometry, material(rules.colours.halo)),
      edge = new T.Mesh(edgeGeometry, material(rules.colours.edge));
    fill.renderOrder = rules.renderOrder;
    halo.renderOrder = rules.renderOrder + 1; // tuning-ok: the halo draws over the fill and under the outline
    edge.renderOrder = rules.renderOrder + 2; // tuning-ok: the outline draws last
    for (const mesh of [fill, halo, edge]) mesh.frustumCulled = false;
    root.name = "Attack telegraph"; // text-ok: a scene-graph label for debugging, never shown to the player
    root.visible = false;
    root.add(fill, halo, edge);
    s.scene.add(root);
    const slot = {
      root,
      fill,
      halo,
      edge,
      owner: -1,
      source: "",
      kind: "",
      reach: NaN,
      arc: NaN,
      width: NaN,
      seen: false,
    };
    slots.push(slot);
    return slot;
  }
  // The slot already showing this attack, or a free one, or one left over from an attack that is over, or a new one while the pool has room.
  function match(r) {
    for (const slot of slots) if (slot.root.visible && slot.owner === r.owner && slot.source === r.source) return slot;
    return null;
  }
  function acquire() {
    for (const slot of slots) if (!slot.root.visible || !slot.seen) return slot;
    return slots.length < rules.maxVisible ? create() : null;
  }

  function rebuild(slot, r) {
    slot.kind = r.kind;
    slot.reach = r.reach;
    slot.arc = r.arc;
    slot.width = r.width;
    const count = shapePoints(r.kind, r.reach, r.arc, r.width, points, rules),
      fillGeometry = slot.fill.geometry,
      fillIndex = fillBuffers(
        points,
        count,
        rules.pattern.periodMetres,
        fillGeometry.attributes.position.array,
        fillGeometry.attributes.uv.array,
        fillGeometry.index.array,
      );
    fillGeometry.setDrawRange(0, fillIndex);
    fillGeometry.attributes.position.needsUpdate =
      fillGeometry.attributes.uv.needsUpdate =
      fillGeometry.index.needsUpdate =
        true;
    for (const [mesh, inside, outside] of [
      [slot.halo, rules.edgeMetres + rules.haloMetres, rules.haloMetres],
      [slot.edge, rules.edgeMetres, 0],
    ]) {
      const geometry = mesh.geometry,
        used = stripBuffers(
          points,
          count,
          inside,
          outside,
          rules.miterLimit,
          geometry.attributes.position.array,
          geometry.index.array,
        );
      geometry.setDrawRange(0, used);
      geometry.attributes.position.needsUpdate = geometry.index.needsUpdate = true;
    }
  }

  function apply(slot, r, still) {
    if (slot.kind !== r.kind || slot.reach !== r.reach || slot.arc !== r.arc || slot.width !== r.width)
      rebuild(slot, r);
    slot.owner = r.owner;
    slot.source = r.source;
    slot.seen = true;
    slot.root.visible = true;
    slot.root.position.set(r.x, rules.groundHeight, -r.z);
    slot.root.rotation.y = Math.atan2(r.dx, -r.dz);
    const scale = still ? 1 : growth(r.progress, rules);
    slot.fill.scale.set(r.kind === "line" ? 1 : scale, 1, scale);
    slot.fill.material.opacity = opacityAt(
      r.progress,
      rules.fill.startOpacity,
      rules.fill.endOpacity,
      still ? rules.fill.reducedOpacity : null,
    );
    slot.edge.material.opacity = opacityAt(
      r.progress,
      rules.edge.startOpacity,
      rules.edge.endOpacity,
      still ? rules.edge.endOpacity : null,
    );
    slot.halo.material.opacity = rules.haloOpacity;
  }

  function update() {
    if (disposed) return;
    const g = s.game,
      live = !!g && !!s.loaded && !s.contextLost && !s.traveling && !g.finished;
    for (const slot of slots) slot.seen = false;
    if (live) {
      const still = !!motion?.matches;
      collectTelegraphs(g, set);
      // Attacks already showing keep their slot; only then do new ones take a free or finished slot, so none steals another's.
      for (let i = 0; i < set.count; i++) {
        const r = set.rows[i],
          slot = match(r);
        r.placed = !!slot;
        if (slot) apply(slot, r, still);
      }
      for (let i = 0; i < set.count; i++) {
        const r = set.rows[i],
          slot = r.placed ? null : acquire();
        if (slot) apply(slot, r, still);
      }
    }
    for (const slot of slots)
      if (!slot.seen && slot.root.visible) {
        slot.root.visible = false;
        slot.owner = -1;
      }
  }

  return {
    update,
    slots,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) {
        slot.root.removeFromParent();
        for (const mesh of [slot.fill, slot.halo, slot.edge]) {
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
      }
      slots.length = 0;
      texture.dispose();
    },
  };
}
