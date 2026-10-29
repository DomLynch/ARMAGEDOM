import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GAME_DATA } from "./game-data.js";
// The chained Pitborn set-piece (data/chainedPitborn.json): the Pitborn shackled on the Westminster steps, thrashing against three
// chains. Presentation only: no entity, no AI, no collision and no hit surface, so combat never sees it. It draws when the data row
// is enabled, unless the page carries ?chainedpitborn=0 (the off switch). Chain links are one InstancedMesh, dust and sparks one pooled Points set;
// every temporary is allocated once, nothing is built per frame. Every number is in the data row.
const D = GAME_DATA.chainedPitborn,
  M = D.motion,
  C = D.chains,
  P = D.dust,
  F = D.flicker,
  TURN = T.MathUtils.DEG2RAD * 360, // one full turn in radians
  QUARTER = T.MathUtils.DEG2RAD * 90,
  VEC = new T.Vector3().toArray().length, // floats per position or colour
  LOOPS = { pingpong: T.LoopPingPong, repeat: T.LoopRepeat },
  DOWN = new T.Vector3(0, -1, 0),
  hex = (v) => new T.Color(`#${v}`);
const chainedPitbornOn = (search = globalThis.location?.search ?? "") =>
  D.enabled && new URLSearchParams(search).get(D.offParam) !== D.offValue;
export function createChainedPitbornView(s) {
  const tmp = {
    a: new T.Vector3(),
    b: new T.Vector3(),
    p: new T.Vector3(),
    q: new T.Quaternion(),
    r: new T.Quaternion(),
    m: new T.Matrix4(),
    v: new T.Vector3(),
    sc: new T.Vector3(),
  };
  let parts = null,
    loading = false,
    disposed = false,
    last = null,
    snapped = false,
    lastPulse = 0;
  // Touch tap and mouse aim read the posed body of the shackled Pitborn through this (engine/loop.js `bodyViews`).
  s.chainedPitbornParts = () => parts;
  const show =(p, on) => {
    p.root.visible = p.link.visible = p.plate.visible = p.backplate.visible = p.points.visible = on;
  };
  function build(w, source) {
    const root = new T.Group(),
      model = clone(source.gltf.scene),
      hidden = new Set((source.description.starterHidden ?? []).map(T.PropertyBinding.sanitizeNodeName)),
      ground = w.geometry.ground(D.at),
      toward = w.geometry.ground(D.facesToward),
      scale = (w.layout.characterScale ?? 1) * (source.description.scale ?? 1) * D.scaleMultiplier;
    const skin = [],
      rim = { color: { value: hex(D.rim.color) }, power: { value: D.rim.power }, strength: { value: D.rim.strength } };
    model.traverse((o) => {
      if (hidden.has(o.name)) o.visible = false;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      // Own copies (the shared source stays untouched): a dim firelight emissive that flickers, and a fresnel rim so the horned
      // silhouette and the shoulders read against the dark street.
      o.material = o.material.clone();
      o.material.emissive?.set(hex(D.emissive.color));
      o.material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { rimColor: rim.color, rimPower: rim.power, rimStrength: rim.strength });
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform float rimStrength;")
          .replace(
            "#include <opaque_fragment>",
            [
              "float facing = saturate(dot(normalize(vNormal), normalize(vViewPosition)));",
              "outgoingLight += rimColor * rimStrength * pow(1.0 - facing, rimPower);",
              "#include <opaque_fragment>",
            ].join("\n"),
          );
      };
      skin.push(o.material);
    });
    const foot = D.motion.footBones.map((name) => model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name))).filter(Boolean);
    root.add(model);
    root.scale.setScalar(scale);
    root.position.copy(w.toRender(ground));
    const home = root.position.clone();
    root.rotation.y = Math.atan2(toward.x - ground.x, -(toward.z - ground.z));
    const mixer = new T.AnimationMixer(model);
    for (const row of M.clips) {
      const clip = source.gltf.animations.find((c) => c.name === row.clip);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(LOOPS[row.loop], Infinity).setEffectiveTimeScale(row.timeScale).setEffectiveWeight(row.weight).play();
    }
    const sanitize = T.PropertyBinding.sanitizeNodeName,
      bones = C.rows.map((row) => model.getObjectByName(sanitize(row.bone))),
      head = model.getObjectByName(sanitize(M.headBone)),
      fixed = C.rows.map((row) => w.toRender(w.geometry.ground(row.anchor), row.height));
    const metal = { roughness: C.roughness, metalness: C.metalness },
      link = new T.InstancedMesh(
        new T.TorusGeometry(C.linkRadius, C.linkTube, ...C.linkSegments),
        new T.MeshStandardMaterial({ color: hex(C.color), ...metal }),
        C.rows.length * C.links,
      ),
      // An iron ring bolted through a square backplate, one pair per chain: the chain's end passes through the ring.
      plate = new T.InstancedMesh(
        new T.TorusGeometry(C.anchorRadius, C.anchorTube, ...C.anchorSegments),
        new T.MeshStandardMaterial({ color: hex(C.anchorColor), ...metal }),
        C.rows.length,
      ),
      backplate = new T.InstancedMesh(
        new T.BoxGeometry(C.plateSize, C.plateSize, C.plateThickness),
        new T.MeshStandardMaterial({ color: hex(C.anchorColor), ...metal }),
        C.rows.length,
      );
    link.frustumCulled = plate.frustumCulled = backplate.frustumCulled = false;
    fixed.forEach((at, i) => {
      plate.setMatrixAt(i, tmp.m.makeTranslation(at.x, at.y, at.z + C.plateThickness));
      backplate.setMatrixAt(i, tmp.m.makeTranslation(at.x, at.y, at.z));
    });
    const geometry = new T.BufferGeometry(),
      pos = new Float32Array(P.count * VEC),
      col = new Float32Array(P.count * VEC),
      born = new Float32Array(P.count).fill(-P.neverSeconds),
      seed = Float32Array.from({ length: P.count }, (_, i) => (i * P.seedStep) % 1);
    geometry.setAttribute("position", new T.BufferAttribute(pos, VEC));
    geometry.setAttribute("color", new T.BufferAttribute(col, VEC));
    const points = new T.Points(
      geometry,
      new T.PointsMaterial({
        size: P.size,
        vertexColors: true,
        transparent: true,
        opacity: P.opacity,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    points.frustumCulled = false;
    s.scene.add(root, link, plate, backplate, points);
    return {
      ...{ root, model, mixer, bones, head, fixed, link, plate, backplate, points, skin, foot },
      ...{ geometry, pos, col, born, seed, home, base: root.rotation.y, next: 0 },
    };
  }
  function burst(p, time, feet) {
    const dust = hex(P.dustColor),
      spark = hex(P.sparkColor);
    for (let k = 0; k < P.burstCount; k++) {
      const i = p.next;
      p.next = (p.next + 1) % P.count;
      const isSpark = p.seed[i] < P.sparkShare,
        at = isSpark ? p.fixed[(i + k) % p.fixed.length] : feet,
        c = isSpark ? spark : dust,
        jx = (p.seed[i] - P.spreadOffset) * P.spreadMetres,
        jz = (p.seed[(i + 1) % P.count] - P.spreadOffset) * P.spreadMetres;
      p.born[i] = time;
      p.pos.set([at.x + jx, at.y, at.z + jz], i * VEC);
      p.col.set([c.r, c.g, c.b], i * VEC);
    }
  }
  function frame(p, g) {
    const t = g.time,
      dt = last === null ? 0 : Math.min(Math.max(t - last, 0), M.maxStepSeconds),
      wave = Math.sin((Math.PI * t) / M.pullSeconds),
      pull = wave * wave, // 0 slack to 1 taut, one cycle per pullSeconds
      jitter = pull > M.shakeAbove ? Math.sin(t * M.shakeHz * TURN) * M.shakeMetres : 0;
    last = t;
    p.mixer.update(dt);
    const away = p.root.getWorldDirection(tmp.v); // the Pitborn faces the spawn; slack lets it lean back toward the wall
    p.root.position.set(
      p.home.x - away.x * M.leanMetres * (1 - pull) + jitter,
      p.home.y,
      p.home.z - away.z * M.leanMetres * (1 - pull),
    );
    p.root.rotation.y = p.base;
    if (p.head) p.head.rotation.y += T.MathUtils.degToRad(M.headTurnDegrees) * Math.sin((t / M.headTurnSeconds) * TURN);
    p.root.updateMatrixWorld(true);
    // Feet stay on the stone: the lowest sole of the lunge is brought back to the step height.
    let low = Infinity;
    for (const f of p.foot) low = Math.min(low, f.getWorldPosition(tmp.v).y);
    if (low < Infinity) {
      p.root.position.y += p.home.y - low;
      p.root.updateMatrixWorld(true);
    }
    const flicker = 1 + F.amount * (Math.sin(t * F.hz * TURN) + Math.sin(t * F.hz * F.ratio * TURN)) / F.norm;
    for (const m of p.skin) m.emissiveIntensity = D.emissive.intensity * flicker;
    const slack = 1 - pull,
      point = (x, out) =>
        out.lerpVectors(tmp.a, tmp.b, x).addScaledVector(DOWN, C.sagMetres * slack * Math.sin(Math.PI * x));
    for (let c = 0; c < C.rows.length; c++) {
      (p.bones[c] ?? p.model).getWorldPosition(tmp.a);
      tmp.b.copy(p.fixed[c]);
      for (let k = 0; k < C.links; k++) {
        const u = (k + C.linkPhase) / C.links;
        point(u, tmp.p);
        point(Math.min(u + 1 / C.links, 1), tmp.v);
        tmp.v.sub(tmp.p).normalize();
        tmp.q.setFromUnitVectors(T.Object3D.DEFAULT_UP, tmp.v);
        tmp.r.setFromAxisAngle(tmp.v, (k & 1) * QUARTER); // alternate links turn a quarter, as real chain does
        tmp.q.premultiply(tmp.r);
        tmp.sc.set(1, C.linkStretch, 1);
        p.link.setMatrixAt(c * C.links + k, tmp.m.compose(tmp.p, tmp.q, tmp.sc));
      }
    }
    p.link.instanceMatrix.needsUpdate = true;
    if (pull > P.burstAt && t - lastPulse > M.pullSeconds * P.pulseGapShare) {
      lastPulse = t;
      burst(p, t, tmp.a.copy(p.root.position));
    }
    for (let i = 0; i < P.count; i++) {
      const age = t - p.born[i];
      if (age < 0 || age > P.lifeSeconds) p.pos[i * VEC + 1] = -P.parkHeight;
      else p.pos[i * VEC + 1] += (P.riseMetres / P.lifeSeconds) * dt;
    }
    p.geometry.attributes.position.needsUpdate = true;
    p.geometry.attributes.color.needsUpdate = true;
  }
  function drop() {
    if (!parts) return;
    for (const o of [parts.root, parts.link, parts.plate, parts.backplate, parts.points]) o.removeFromParent();
    for (const o of [parts.link, parts.plate, parts.backplate, parts.points]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    parts.mixer.stopAllAction();
    parts.model.traverse((o) => o.isMesh && o.material.dispose());
    parts = null;
  }
  return {
    update() {
      const g = s.game,
        w = s.world;
      if (disposed || !chainedPitbornOn()) return;
      if (!g || !w || !s.loaded || s.traveling || w.areaId !== D.areaId) {
        if (parts) show(parts, false);
        return;
      }
      if (!parts) {
        if (loading) return;
        loading = true;
        s.actors.modelAsset(D.model).then(
          (source) => {
            loading = false;
            if (!disposed && source && !parts && s.world === w) parts = build(w, source);
          },
          () => {
            loading = false;
          },
        );
        return;
      }
      const phase = g.chainBreak?.state ?? "chained";
      // Loose or dead: the real hunter (or nothing) stands there now, so the shackled prop is gone.
      if (phase === "loose" || phase === "done") {
        show(parts, false);
        return;
      }
      show(parts, true);
      frame(parts, g);
      // The snap: one dust-and-spark burst at the feet as the chains let go.
      if (phase === "snapping" && !snapped) {
        snapped = true;
        burst(parts, g.time, tmp.a.copy(parts.root.position));
      } else if (phase === "chained") snapped = false;
    },
    dispose() {
      disposed = true;
      drop();
    },
  };
}
