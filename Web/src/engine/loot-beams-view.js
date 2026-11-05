import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LOOT_BEAMS, beamStyle, lootBeamsOn } from "./loot-beams.js";
// The light column and ground ring where a rare drop fell (data/lootBeams.json). It reads the rows in `g.loot.beams` each frame. One look per
// rarity (a beam geometry, a ring geometry and one additive material) is built on first use and shared by every beam of that rarity; a fixed
// pool of at most `maxBeams` mesh pairs is reused for the rows, so a steady frame allocates nothing. Rarities differ in height, width, the
// beam's and the ring's number of sides, and the number of rings, not only in colour. A beam rises, holds, then shrinks away; under
// prefers-reduced-motion it appears and leaves at once and does not pulse. A run with no loot builds nothing.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const TAU = (360 * Math.PI) / 180, // a full turn in radians
  HALF = 1 / (1 + 1), // maps a sine wave from -1..1 onto 0..1
  FLAT = -Math.PI * HALF; // lays a ring on the floor

// A grey per vertex as a colour attribute (white keeps the material colour, black adds nothing under additive blending). `grey(v)` is vertex v.
function greyAttribute(THREE, count, grey) {
  const stride = new THREE.Color().toArray().length,
    colours = new Float32Array(count * stride);
  for (let v = 0; v < count; v++) colours.fill(grey(v), v * stride, (v + 1) * stride);
  return new THREE.BufferAttribute(colours, stride);
}

function buildLook(THREE, style, rules) {
  const beam = new THREE.CylinderGeometry(
    style.beamRadius * style.beamTaper,
    style.beamRadius,
    style.beamHeight,
    style.beamSides,
    rules.heightSegments,
    true,
  );
  beam.translate(0, style.beamHeight * HALF, 0);
  const feet = beam.attributes.position;
  // Full strength at the foot of the column, fading to nothing at its top.
  beam.setAttribute(
    "color",
    greyAttribute(THREE, feet.count, (v) => Math.max(0, 1 - feet.getY(v) / style.beamHeight) ** rules.fadePower),
  );
  const bands = style.rings.map(([inner, outer]) => {
    const band = new THREE.RingGeometry(inner, outer, style.ringSegments);
    band.rotateX(FLAT);
    band.setAttribute(
      "color",
      greyAttribute(THREE, band.attributes.position.count, () => 1),
    );
    return band;
  });
  const ring = bands.length > 1 ? mergeGeometries(bands) : bands[0];
  if (bands.length > 1) for (const band of bands) band.dispose();
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(`#${style.colour}`),
    vertexColors: true,
    transparent: true,
    opacity: style.opacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  return { style, beam, ring, material };
}

// world: the stage (THREE, group). options: rules, search, matchMedia (tests).
export function createLootBeamsView(world, options = {}) {
  const { THREE } = world,
    rules = options.rules ?? LOOT_BEAMS,
    off = { group: null, sync() {}, dispose() {} };
  if (!lootBeamsOn(rules, options.search)) return off;
  const group = new THREE.Group(),
    looks = new Map(),
    used = [], // the looks in build order, walked each frame without an iterator
    slots = [],
    motion = (options.matchMedia ?? globalThis.matchMedia?.bind(globalThis))?.(REDUCED_MOTION);
  let disposed = false;
  world.group.add(group);
  const lookFor = (rarity) => {
    if (!looks.has(rarity)) {
      const made = buildLook(THREE, beamStyle(rarity, rules), rules);
      looks.set(rarity, made);
      used.push(made);
    }
    return looks.get(rarity);
  };
  // Slot `i` of the pool, made on first use; a slot takes whichever look its row needs.
  function slotFor(i, look) {
    if (!slots[i]) {
      const beam = new THREE.Mesh(look.beam, look.material),
        ring = new THREE.Mesh(look.ring, look.material);
      beam.renderOrder = ring.renderOrder = rules.renderOrder;
      group.add(beam, ring);
      slots[i] = { beam, ring, look };
    }
    const slot = slots[i];
    if (slot.look !== look) {
      slot.look = look;
      slot.beam.geometry = look.beam;
      slot.ring.geometry = look.ring;
      slot.beam.material = slot.ring.material = look.material;
    }
    return slot;
  }
  return {
    group,
    // Once a frame: drop spent rows, then show up to `maxBeams` of the rest and hide the unused slots.
    sync(g) {
      if (disposed) return;
      const rows = g.loot?.beams,
        calm = motion?.matches === true,
        t = g.time ?? 0;
      let shown = 0;
      if (rows) {
        for (let i = rows.length - 1; i >= 0; i--) if (t >= rows[i].until) rows.splice(i, 1);
        for (let i = 0; i < rows.length && shown < rules.maxBeams; i++) {
          const row = rows[i];
          if (row.area !== undefined && row.area !== world.areaId) continue;
          const look = lookFor(row.rarity),
            slot = slotFor(shown, look),
            rise = calm || rules.riseSeconds <= 0 ? 1 : Math.min(1, (t - row.from) / rules.riseSeconds),
            leave = calm ? Number(row.until - t > 0) : Math.min(1, (row.until - t) / rules.fadeSeconds),
            k = Math.max(0, rise * leave),
            ringK = look.style.ringRadius * (rules.ringGrowFrom + (1 - rules.ringGrowFrom) * k);
          slot.beam.visible = look.style.beamHeight > 0 && k > 0;
          slot.ring.visible = k > 0;
          slot.beam.position.set(row.x, rules.lift, -row.z);
          slot.ring.position.set(row.x, rules.lift, -row.z);
          slot.beam.scale.set(1, k, 1);
          slot.ring.scale.set(ringK, 1, ringK);
          shown++;
        }
      }
      for (let i = shown; i < slots.length; i++) slots[i].beam.visible = slots[i].ring.visible = false;
      // One brightness per look, so a pulse costs a write per rarity and no per-beam material.
      const wave = calm
        ? 1
        : 1 - rules.pulse.depth + rules.pulse.depth * (HALF + HALF * Math.sin(t * rules.pulse.hz * TAU));
      for (let i = 0; i < used.length; i++) used[i].material.opacity = used[i].style.opacity * wave;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) {
        slot.beam.removeFromParent();
        slot.ring.removeFromParent();
      }
      slots.length = 0;
      for (const look of used) {
        look.beam.dispose();
        look.ring.dispose();
        look.material.dispose();
      }
      looks.clear();
      used.length = 0;
      group.removeFromParent();
    },
  };
}
