import * as T from "three";
// The Thundercoil Arc Gun's lightning: a jagged blue-white bolt from the muzzle to each target in turn (a short flicker), sparks on
// each hit and a crackle around stunned enemies. Everything is pooled (nothing is allocated while playing) and disposed with the
// effects. Every number is data/visual.json `arcGun` (see game-data-arc-gun.js); `variant` picks the look.
const MAX_HALOS = 3; // tuning-ok: the most halo lines any look may use (game-data-arc-gun.js caps `halos` at 3)
const MAX_SPARKS = 16; // tuning-ok: the most sparks any look may use (game-data-arc-gun.js caps `sparkCount` at 16)
const LOOP = Math.PI * 2; // tuning-ok: full turn

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

export function createArcBolts({ scene, data, bodyHeight = () => 1, seed = 1 }) {
  const root = new T.Group();
  root.name = "Arc gun lightning";
  scene.add(root);
  let look = data.variants[data.variant];
  const random = generator(seed),
    linePoints = Math.max(...Object.values(data.variants).map((v) => v.jagSegments)) + 1,
    stunPoints = Math.max(...Object.values(data.variants).map((v) => v.stunSegments)) + 1,
    makeLine = (points) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(points * 3), 3)); // tuning-ok: xyz
      const line = new T.Line(
        geometry,
        new T.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }),
      );
      line.frustumCulled = false;
      line.visible = false;
      root.add(line);
      return line;
    };
  const bolts = Array.from({ length: data.maxLinks }, () => ({
      lines: Array.from({ length: 1 + MAX_HALOS }, () => makeLine(linePoints)),
      from: new T.Vector3(),
      to: new T.Vector3(),
      start: 0,
      age: -1,
      flicker: 0,
      sparks: 0,
    })),
    stuns = Array.from({ length: data.maxStuns }, () => ({ line: makeLine(stunPoints), actor: null, flicker: 0 }));
  const sparkGeometry = new T.BufferGeometry(),
    sparkPositions = new Float32Array(data.maxLinks * MAX_SPARKS * 3), // tuning-ok: xyz
    sparkVelocity = new Float32Array(sparkPositions.length),
    sparkAge = new Float32Array(data.maxLinks * MAX_SPARKS).fill(-1);
  sparkGeometry.setAttribute("position", new T.BufferAttribute(sparkPositions, 3)); // tuning-ok: xyz
  const sparks = new T.Points(
    sparkGeometry,
    new T.PointsMaterial({ sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }),
  );
  sparks.frustumCulled = false;
  sparks.visible = false;
  root.add(sparks);
  const dir = new T.Vector3(),
    across = new T.Vector3(),
    up = new T.Vector3(),
    point = new T.Vector3();

  // Writes a jagged polyline from `a` to `b` into the line's position attribute and draws `segments + 1` points of it.
  function jag(line, a, b, segments, amplitude) {
    const position = line.geometry.attributes.position;
    dir.subVectors(b, a);
    const length = dir.length();
    dir.divideScalar(length || 1);
    across.set(0, 1, 0).cross(dir);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0); // tuning-ok: bolt straight up or down
    across.normalize();
    up.crossVectors(dir, across).normalize();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        wobble = Math.sin(Math.PI * t) * amplitude * length; // the ends stay on the muzzle and the target
      point.lerpVectors(a, b, t);
      point.addScaledVector(across, (random() - 0.5) * 2 * wobble); // tuning-ok: centred random in -1..1
      point.addScaledVector(up, (random() - 0.5) * 2 * wobble); // tuning-ok: centred random in -1..1
      position.setXYZ(i, point.x, point.y, point.z);
    }
    line.geometry.setDrawRange(0, segments + 1);
    position.needsUpdate = true;
  }
  function style(bolt, fade) {
    bolt.lines.forEach((line, n) => {
      const halo = n > 0,
        on = !halo || n <= look.halos;
      line.visible = on && fade > 0;
      if (!on) return;
      line.material.color.setHex(halo ? look.haloColour : look.coreColour);
      line.material.opacity = (halo ? look.haloOpacity : look.coreOpacity) * fade;
    });
  }
  return {
    root,
    get variant() {
      return data.variant;
    },
    setVariant(name) {
      if (!Object.hasOwn(data.variants, name)) throw RangeError("Unknown arc gun look");
      look = data.variants[name];
    },
    // `links` are the muzzle-to-target segments of one shot, in render coordinates; they light up one after the other.
    fire(links, now) {
      links.slice(0, data.maxLinks).forEach((link, i) => {
        const bolt = bolts[i];
        bolt.from.set(link.from.x, link.from.y, link.from.z);
        bolt.to.set(link.to.x, link.to.y, link.to.z);
        bolt.start = now + i * look.hopDelay;
        bolt.age = 0;
        bolt.flicker = 0;
        bolt.sparks = link.targetId != null ? look.sparkCount : 0;
      });
      for (let i = links.length; i < bolts.length; i++) bolts[i].age = -1;
    },
    stun(actor, until, now) {
      const slot = stuns.find((s) => s.actor === actor) ?? stuns.find((s) => !s.actor) ?? stuns[0];
      slot.actor = actor;
      slot.until = until;
      slot.flicker = now;
    },
    update(now, dt) {
      let any = false;
      for (const [index, bolt] of bolts.entries()) {
        if (bolt.age < 0) {
          for (const line of bolt.lines) line.visible = false;
          continue;
        }
        const age = now - bolt.start;
        if (age < 0) continue;
        if (age >= look.boltSeconds) {
          bolt.age = -1;
          for (const line of bolt.lines) line.visible = false;
          continue;
        }
        any = true;
        if (bolt.age === 0 || now - bolt.flicker >= look.flickerSeconds) {
          bolt.flicker = now;
          bolt.lines.forEach((line, n) => {
            if (n <= look.halos) jag(line, bolt.from, bolt.to, look.jagSegments, look.jitter * (n ? look.haloSpread : 1));
          });
          if (bolt.age === 0 && bolt.sparks)
            for (let s = 0; s < bolt.sparks; s++) {
              const at = (index * MAX_SPARKS + s) * 3; // tuning-ok: xyz
              sparkPositions.set([bolt.to.x, bolt.to.y, bolt.to.z], at);
              const spin = random() * LOOP,
                lift = random();
              sparkVelocity.set([Math.cos(spin) * look.sparkSpeed, lift * look.sparkSpeed, Math.sin(spin) * look.sparkSpeed], at);
              sparkAge[index * MAX_SPARKS + s] = 0;
            }
        }
        bolt.age = age + 1e-9; // tuning-ok: keeps age above 0 after the first frame
        style(bolt, (1 - age / look.boltSeconds) * (0.7 + 0.3 * random())); // tuning-ok: 70 to 100 per cent flicker
      }
      let sparkLive = false;
      for (let i = 0; i < sparkAge.length; i++) {
        if (sparkAge[i] < 0) continue;
        sparkAge[i] += dt;
        if (sparkAge[i] >= look.sparkSeconds) {
          sparkAge[i] = -1;
          sparkPositions.fill(1e6, i * 3, i * 3 + 3); // tuning-ok: parks a dead spark far off screen
          continue;
        }
        sparkLive = true;
        for (let k = 0; k < 3; k++) sparkPositions[i * 3 + k] += sparkVelocity[i * 3 + k] * dt; // tuning-ok: xyz
      }
      sparks.visible = sparkLive;
      sparks.material.size = look.sparkSize;
      sparks.material.color.setHex(look.sparkColour);
      sparks.material.opacity = 1;
      sparkGeometry.attributes.position.needsUpdate = true;
      for (const slot of stuns) {
        const actor = slot.actor;
        if (!actor || now >= slot.until || actor.hp <= 0) {
          slot.actor = null;
          slot.line.visible = false;
          continue;
        }
        any = true;
        if (now - slot.flicker >= look.flickerSeconds || !slot.line.visible) {
          slot.flicker = now;
          const position = slot.line.geometry.attributes.position,
            y = bodyHeight(actor),
            n = look.stunSegments;
          for (let i = 0; i <= n; i++) {
            const turn = (i / n) * LOOP,
              radius = look.stunRadius * (0.6 + 0.8 * random()); // tuning-ok: 60 to 140 per cent crackle radius
            position.setXYZ(
              i,
              actor.pos.x + Math.cos(turn) * radius,
              y * (0.6 + 0.8 * random()), // tuning-ok: crackle spans 60 to 140 per cent of chest height
              -actor.pos.z + Math.sin(turn) * radius,
            );
          }
          slot.line.geometry.setDrawRange(0, n + 1);
          position.needsUpdate = true;
        }
        slot.line.visible = true;
        slot.line.material.color.setHex(look.stunColour);
        slot.line.material.opacity = look.stunOpacity * Math.min(1, (slot.until - now) / look.boltSeconds);
      }
      root.visible = any || sparkLive;
    },
    reset() {
      for (const bolt of bolts) {
        bolt.age = -1;
        for (const line of bolt.lines) line.visible = false;
      }
      sparkAge.fill(-1);
      sparks.visible = false;
      for (const slot of stuns) {
        slot.actor = null;
        slot.line.visible = false;
      }
    },
    stats() {
      return {
        lines: bolts.flatMap((b) => b.lines).filter((l) => l.visible).length + stuns.filter((s) => s.line.visible).length,
        sparks: [...sparkAge].filter((a) => a >= 0).length,
        drawObjects: root.children.length,
      };
    },
    dispose() {
      scene.remove(root);
      for (const line of root.children) {
        line.geometry?.dispose();
        line.material?.dispose();
      }
    },
  };
}
