import * as T from "three";
// The Thundercoil Arc Gun's lightning. Each hop is one jagged bolt drawn as a camera-facing ribbon: a white-hot core and a wider blue
// glow that fades to nothing at its edges, plus a few short side forks. The shape re-jags a couple of times while it fades. Enemies the
// bolt hit get a small crackle ribbon. All ribbons are written into ONE pooled mesh (one draw call) and the sparks are one Points object,
// so nothing is allocated while playing. Every number is data/visual.json `arcGun` (see game-data-arc-gun.js); widths are screen pixels.
const LOOP = Math.PI * 2; // tuning-ok: full turn
const VERTS = 3; // tuning-ok: a ribbon point has a left, a centre and a right vertex
const RGBA = 4; // tuning-ok: vertex colour channels
const XYZ = 3; // tuning-ok: position channels

// A small seeded generator, so a bolt's shape is repeatable in tests and stills.
function generator(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0; // tuning-ok: mulberry32 increment
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); // tuning-ok: mulberry32 mix
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // tuning-ok: mulberry32 mix
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // tuning-ok: mulberry32 mix, 2^32
  };
}

const vertexShader = `
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;

// `camera` and `viewportHeight()` turn a width in screen pixels into metres at each point's distance from the camera.
export function createArcBolts({ scene, data, camera, viewportHeight = () => 667, bodyHeight = () => 1, seed = 1 }) {
  const root = new T.Group();
  root.name = "Arc gun lightning";
  scene.add(root);
  const random = generator(seed),
    pointsPerLine = Math.max(data.jagSegments, data.forkSegments, data.stunSegments) + 1,
    mainLines = data.maxLinks * (1 + data.forks),
    strips = (mainLines + data.maxStuns) * 2, // tuning-ok: every line is drawn as a halo strip and a core strip
    maxVerts = strips * pointsPerLine * VERTS,
    maxIndices = strips * (pointsPerLine - 1) * 12, // tuning-ok: four triangles of three indices per ribbon segment
    position = new Float32Array(maxVerts * XYZ),
    colour = new Float32Array(maxVerts * RGBA),
    index = new Uint32Array(maxIndices),
    geometry = new T.BufferGeometry(),
    material = new T.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending,
    });
  geometry.setAttribute("position", new T.BufferAttribute(position, XYZ));
  geometry.setAttribute("aColor", new T.BufferAttribute(colour, RGBA));
  geometry.setIndex(new T.BufferAttribute(index, 1));
  const ribbon = new T.Mesh(geometry, material);
  ribbon.frustumCulled = false;
  ribbon.visible = false;
  ribbon.renderOrder = 999; // tuning-ok: drawn after the scene
  root.add(ribbon);

  const line = () => ({ pts: new Float32Array(pointsPerLine * XYZ), n: 0 }),
    bolts = Array.from({ length: data.maxLinks }, () => ({
      main: line(),
      forks: Array.from({ length: data.forks }, line),
      from: new T.Vector3(),
      to: new T.Vector3(),
      start: 0,
      live: false,
      shapes: 0,
      sparks: 0,
    })),
    stuns = Array.from({ length: data.maxStuns }, () => ({ ...line(), actor: null, until: 0, flicker: -1, height: 1 }));
  const sparkGeometry = new T.BufferGeometry(),
    sparkPositions = new Float32Array(data.maxLinks * data.sparkCount * XYZ),
    sparkVelocity = new Float32Array(sparkPositions.length),
    sparkAge = new Float32Array(data.maxLinks * data.sparkCount).fill(-1);
  sparkGeometry.setAttribute("position", new T.BufferAttribute(sparkPositions, XYZ));
  const sparks = new T.Points(
    sparkGeometry,
    new T.PointsMaterial({
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending,
      size: data.sparkSize,
      color: data.sparkColour,
    }),
  );
  sparks.frustumCulled = false;
  sparks.visible = false;
  root.add(sparks);

  const dir = new T.Vector3(),
    across = new T.Vector3(),
    up = new T.Vector3(),
    point = new T.Vector3(),
    tangent = new T.Vector3(),
    view = new T.Vector3(),
    side = new T.Vector3(),
    tint = new T.Color();
  let verts = 0,
    indices = 0;

  // Writes a jagged polyline from `a` to `b` into `out`; `segments + 1` points. The ends stay on the muzzle / the target.
  function jag(out, a, b, segments, amplitude) {
    dir.subVectors(b, a);
    const length = dir.length();
    dir.divideScalar(length || 1);
    across.set(0, 1, 0).cross(dir);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0); // tuning-ok: bolt straight up or down
    across.normalize();
    up.crossVectors(dir, across).normalize();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        wobble = Math.sin(Math.PI * t) * amplitude * length;
      point.lerpVectors(a, b, t);
      point.addScaledVector(across, (random() - 0.5) * 2 * wobble); // tuning-ok: centred random in -1..1
      point.addScaledVector(up, (random() - 0.5) * 2 * wobble); // tuning-ok: centred random in -1..1
      out.pts[i * XYZ] = point.x;
      out.pts[i * XYZ + 1] = point.y;
      out.pts[i * XYZ + 2] = point.z;
    }
    out.n = segments + 1;
  }
  const at = (l, i, into) => into.set(l.pts[i * XYZ], l.pts[i * XYZ + 1], l.pts[i * XYZ + 2]);

  // A fresh shape for one bolt: the main path plus up to `forks` short branches leaving it at random interior points.
  function reshape(bolt) {
    jag(bolt.main, bolt.from, bolt.to, data.jagSegments, data.jitter);
    const length = bolt.from.distanceTo(bolt.to);
    bolt.forks.forEach((fork) => {
      const k = 1 + Math.floor(random() * (data.jagSegments - 1)), // an interior point of the main path
        start = at(bolt.main, k, new T.Vector3()),
        heading = new T.Vector3(random() - 0.5, (random() - 0.5) * 0.5, random() - 0.5) // tuning-ok: forks mostly stay level
          .normalize()
          .addScaledVector(dir.subVectors(bolt.to, bolt.from).normalize(), 0.6) // tuning-ok: forks lean along the bolt
          .normalize();
      jag(
        fork,
        start,
        start.clone().addScaledVector(heading, length * data.forkLength),
        data.forkSegments,
        data.jitter,
      );
    });
  }

  // Metres across one screen pixel at `p`.
  function pixel(p) {
    if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / viewportHeight();
    return (2 * camera.position.distanceTo(p) * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight(); // tuning-ok: half the field of view, in radians
  }
  // Appends one ribbon along `l`: `widthPx` wide, centre alpha `mid`, edge alpha `edge` (0 gives the fading glow).
  function strip(l, widthPx, rgb, mid, edge) {
    if (l.n < 2 || mid <= 0) return; // tuning-ok: a ribbon needs two points
    const base = verts;
    tint.setHex(rgb);
    for (let i = 0; i < l.n; i++) {
      at(l, Math.min(i + 1, l.n - 1), tangent).sub(at(l, Math.max(i - 1, 0), point));
      at(l, i, point);
      view.subVectors(camera.position, point);
      side
        .crossVectors(tangent, view)
        .normalize()
        .multiplyScalar((pixel(point) * widthPx) / 2); // tuning-ok: half width each side
      for (let v = 0; v < VERTS; v++) {
        const o = verts++,
          s = v - 1, // -1 left, 0 centre, 1 right
          alpha = s === 0 ? mid : edge;
        position[o * XYZ] = point.x + side.x * s;
        position[o * XYZ + 1] = point.y + side.y * s;
        position[o * XYZ + 2] = point.z + side.z * s;
        colour.set([tint.r, tint.g, tint.b, alpha], o * RGBA);
      }
    }
    for (let i = 0; i < l.n - 1; i++) {
      const a = base + i * VERTS,
        b = a + VERTS;
      for (const t of [a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1]) index[indices++] = t; // tuning-ok: four triangles of the ribbon segment
    }
  }
  const glow = (l, widthPx, rgb, alpha) => strip(l, widthPx, rgb, alpha, 0),
    solid = (l, widthPx, rgb, alpha) => strip(l, widthPx, rgb, alpha, alpha);

  return {
    root,
    // `links` are the muzzle-to-target segments of one shot, in render coordinates; they light up one after the other.
    fire(links, now) {
      bolts.forEach((bolt, i) => {
        const link = links[i];
        bolt.live = !!link && i < data.maxLinks;
        if (!bolt.live) return;
        bolt.from.set(link.from.x, link.from.y, link.from.z);
        bolt.to.set(link.to.x, link.to.y, link.to.z);
        bolt.start = now + i * data.hopDelay;
        bolt.shapes = -1; // reshaped on the first frame it shows
        bolt.sparks = link.targetId != null ? data.sparkCount : 0;
      });
    },
    stun(actor, until, now) {
      const slot = stuns.find((s) => s.actor === actor) ?? stuns.find((s) => !s.actor) ?? stuns[0];
      slot.actor = actor;
      slot.until = until;
      slot.flicker = now - data.stunFlickerSeconds;
    },
    update(now, dt) {
      verts = 0;
      indices = 0;
      for (const [slot, bolt] of bolts.entries()) {
        if (!bolt.live) continue;
        const age = now - bolt.start;
        if (age < 0) continue;
        if (age >= data.boltSeconds) {
          bolt.live = false;
          continue;
        }
        const shape = Math.min(data.reJags, Math.floor((age / data.boltSeconds) * (data.reJags + 1))); // tuning-ok: 1 + reJags shapes over the life
        if (shape !== bolt.shapes) {
          reshape(bolt);
          if (bolt.shapes < 0 && bolt.sparks)
            for (let s = 0; s < bolt.sparks; s++) {
              const o = slot * data.sparkCount + s,
                spin = random() * LOOP;
              sparkPositions.set([bolt.to.x, bolt.to.y, bolt.to.z], o * XYZ);
              sparkVelocity.set(
                [Math.cos(spin) * data.sparkSpeed, random() * data.sparkSpeed, Math.sin(spin) * data.sparkSpeed],
                o * XYZ,
              );
              sparkAge[o] = 0;
            }
          bolt.shapes = shape;
        }
        const fade = (1 - age / data.boltSeconds) ** 2; // tuning-ok: quick falloff
        for (const l of [bolt.main, ...bolt.forks]) glow(l, data.haloWidth, data.haloColour, data.haloOpacity * fade);
        for (const l of [bolt.main, ...bolt.forks]) solid(l, data.coreWidth, data.coreColour, data.coreOpacity * fade);
      }
      let sparkLive = false;
      for (let i = 0; i < sparkAge.length; i++) {
        if (sparkAge[i] < 0) continue;
        sparkAge[i] += dt;
        if (sparkAge[i] >= data.sparkSeconds) {
          sparkAge[i] = -1;
          sparkPositions.fill(1e6, i * XYZ, i * XYZ + XYZ); // tuning-ok: parks a dead spark far off screen
          continue;
        }
        sparkLive = true;
        for (let k = 0; k < XYZ; k++) sparkPositions[i * XYZ + k] += sparkVelocity[i * XYZ + k] * dt;
      }
      sparks.visible = sparkLive;
      sparkGeometry.attributes.position.needsUpdate = true;
      for (const slot of stuns) {
        const actor = slot.actor;
        if (!actor || now >= slot.until || actor.hp <= 0) {
          slot.actor = null;
          continue;
        }
        if (now - slot.flicker >= data.stunFlickerSeconds) {
          slot.flicker = now;
          const height = bodyHeight(actor);
          for (let i = 0; i <= data.stunSegments; i++) {
            const turn = (i / data.stunSegments) * LOOP,
              radius = data.stunRadius * (0.6 + 0.8 * random()), // tuning-ok: 60 to 140 per cent crackle radius
              o = i * XYZ;
            slot.pts[o] = actor.pos.x + Math.cos(turn) * radius;
            slot.pts[o + 1] = height * (0.6 + 0.8 * random()); // tuning-ok: crackle spans 60 to 140 per cent of chest height
            slot.pts[o + 2] = -actor.pos.z + Math.sin(turn) * radius;
          }
          slot.n = data.stunSegments + 1;
        }
        const fade = Math.min(1, (slot.until - now) / data.boltSeconds);
        glow(slot, data.stunHaloWidth, data.haloColour, data.stunOpacity * fade * data.haloOpacity);
        solid(slot, data.stunCoreWidth, data.stunColour, data.stunOpacity * fade);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.index.needsUpdate = true;
      geometry.setDrawRange(0, indices);
      ribbon.visible = indices > 0;
      root.visible = ribbon.visible || sparkLive;
    },
    reset() {
      for (const bolt of bolts) bolt.live = false;
      for (const slot of stuns) slot.actor = null;
      sparkAge.fill(-1);
      sparks.visible = false;
      ribbon.visible = false;
      indices = 0;
      geometry.setDrawRange(0, 0);
    },
    stats() {
      return {
        drawObjects: root.children.length,
        ribbonTriangles: indices / 3,
        sparks: [...sparkAge].filter((a) => a >= 0).length,
      }; // tuning-ok: three indices per triangle
    },
    dispose() {
      scene.remove(root);
      geometry.dispose();
      material.dispose();
      sparkGeometry.dispose();
      sparks.material.dispose();
    },
  };
}
