// Distance LOD for skinned human actors (the hostile crowd). Farther than a data distance an actor's skinned meshes switch to a
// thinned index over the SAME vertex buffers (vertex clustering: every vertex in a cell maps to one real vertex of that cell, so no
// vertex moves, the skin weights and uvs stay valid and the skeleton drives it unchanged), and small detail parts (eyes, teeth) are
// hidden. The thinned index is built once per source geometry and level and shared by every actor. An actor is restored to full
// detail when it dies, leaves, or has not finished its finisher preparation (which reads the full geometry). Numbers and the
// rig list live in data/offscreenActors.json `lod`; ?lod=0 is the off switch. Presentation only: sim, hits and saves never read it.
import * as THREE from "three";
import { count, fail, number } from "./game-data-checks.js";

export function validateActorLod(d) {
  const keys = ["enabled", "offParam", "offValue", "rigs", "minTriangles", "hysteresisMetres", "levels"];
  if (!d || typeof d !== "object" || Object.keys(d).some((k) => !keys.includes(k)) || keys.some((k) => !(k in d)))
    fail("offscreenActors", `lod must have exactly ${keys.join(", ")}`);
  if (typeof d.enabled !== "boolean") fail("offscreenActors", "lod.enabled must be true or false");
  if (!d.offParam || !d.offValue) fail("offscreenActors", "lod needs an off switch");
  if (!Array.isArray(d.rigs) || !d.rigs.every((r) => typeof r === "string"))
    fail("offscreenActors", "lod.rigs must be a list");
  count("offscreenActors", "lod.minTriangles", d.minTriangles, 1, 1000000);
  number("offscreenActors", "lod.hysteresisMetres", d.hysteresisMetres, 0);
  if (!Array.isArray(d.levels) || d.levels.length > 4)
    fail("offscreenActors", "lod.levels must be a list of at most 4");
  let last = 0;
  for (const row of d.levels) {
    if (Object.keys(row).some((k) => !["distance", "cell", "hide"].includes(k)))
      fail("offscreenActors", "lod level has a stray key");
    number("offscreenActors", "lod.levels.distance", row.distance, last);
    number("offscreenActors", "lod.levels.cell", row.cell, 0.0001);
    if (!Array.isArray(row.hide) || !row.hide.every((n) => typeof n === "string"))
      fail("offscreenActors", "lod hide must be names");
    last = row.distance;
  }
}

/**
 * A thinned copy of an index: vertices are grouped by a cube grid of `cell` metres, each group is replaced by the member nearest
 * its mean, and triangles that collapse (two corners in one group) are dropped. Returns null when nothing would be saved.
 */
export function clusterIndex(position, index, cell) {
  const rep = new Int32Array(position.count).fill(-1),
    cells = new Map(),
    keyOf = (i) =>
      `${Math.floor(position.getX(i) / cell)},${Math.floor(position.getY(i) / cell)},${Math.floor(position.getZ(i) / cell)}`;
  for (let t = 0; t < index.count; t++) {
    const i = index.getX(t);
    if (rep[i] >= 0) continue;
    rep[i] = 0;
    const key = keyOf(i),
      c = cells.get(key) ?? { members: [], x: 0, y: 0, z: 0 };
    c.members.push(i);
    c.x += position.getX(i);
    c.y += position.getY(i);
    c.z += position.getZ(i);
    cells.set(key, c);
  }
  for (const c of cells.values()) {
    const n = c.members.length;
    let best = c.members[0],
      bestD = Infinity;
    for (const i of c.members) {
      const d =
        (position.getX(i) - c.x / n) ** 2 + (position.getY(i) - c.y / n) ** 2 + (position.getZ(i) - c.z / n) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    for (const i of c.members) rep[i] = best;
  }
  const out = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = rep[index.getX(t)],
      b = rep[index.getX(t + 1)],
      c = rep[index.getX(t + 2)];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  return out.length < index.count ? out : null;
}

export function lodOn(rules, search = globalThis.location?.search ?? "") {
  return rules.enabled && new URLSearchParams(search).get(rules.offParam) !== rules.offValue;
}

export function createActorLod(rules) {
  const active = new Set(),
    thinned = new WeakMap(),
    enabled = lodOn(rules);
  // The shared thinned geometry for a source geometry at a level: same attributes, its own index. Null when it saves nothing.
  const geometryAt = (source, level) => {
    const perLevel = thinned.get(source) ?? [];
    thinned.set(source, perLevel);
    if (perLevel[level] === undefined) {
      const index = clusterIndex(source.attributes.position, source.index, rules.levels[level - 1].cell);
      perLevel[level] = null;
      if (index) {
        const g = new THREE.BufferGeometry();
        for (const name of Object.keys(source.attributes)) g.setAttribute(name, source.attributes[name]);
        g.morphAttributes = source.morphAttributes;
        g.morphTargetsRelative = source.morphTargetsRelative;
        g.setIndex(index);
        g.boundingSphere = source.boundingSphere?.clone() ?? null;
        g.boundingBox = source.boundingBox?.clone() ?? null;
        perLevel[level] = g;
      }
    }
    return perLevel[level];
  };
  const parts = (view) => {
    if (view.lodParts) return view.lodParts;
    view.lodParts = [];
    view.model.traverse((m) => {
      if (!m.isMesh) return;
      const g = m.geometry,
        thinnable = g?.index && !g.groups.length && g.index.count / 3 >= rules.minTriangles;
      view.lodParts.push({ mesh: m, full: thinnable ? g : null });
    });
    return view.lodParts;
  };
  const apply = (view, level) => {
    const hide = level ? rules.levels[level - 1].hide : [];
    for (const part of parts(view)) {
      const m = part.mesh;
      if (part.full) {
        let g = level ? geometryAt(part.full, level) : part.full;
        for (let l = level - 1; !g && l > 0; l--) g = geometryAt(part.full, l);
        m.geometry = g ?? part.full;
      }
      const hidden = hide.includes(m.name);
      if (hidden && part.shown === undefined) part.shown = m.visible;
      if (hidden) m.visible = false;
      else if (part.shown !== undefined) [m.visible, part.shown] = [part.shown, undefined];
    }
    view.lodLevel = level;
    view.lodRestore = level ? () => apply(view, 0) : null;
    if (level) active.add(view);
    else active.delete(view);
  };
  const ready = (view) => view.model && view.motion && view.entity.hp > 0;
  return {
    // Called once per frame: any actor at reduced detail that has died, left the scene or is not ready goes back to full detail.
    sweep() {
      for (const view of active) if (!view.root.parent || !ready(view)) apply(view, 0);
    },
    // Called per living actor with its distance from the player.
    update(view, distance) {
      if (!enabled || !rules.rigs.includes(view.entity?.rig) || !ready(view)) return;
      const was = view.lodLevel ?? 0;
      let level = was;
      while (level < rules.levels.length && distance > rules.levels[level].distance + rules.hysteresisMetres) level++;
      while (level > 0 && distance < rules.levels[level - 1].distance - rules.hysteresisMetres) level--;
      if (level !== was) apply(view, level);
    },
  };
}
