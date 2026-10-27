import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GAME_DATA } from "./game-data.js";
// The chained Pitborn set-piece (data/chainedPitborn.json): the Pitborn shackled on the Westminster steps, thrashing against three
// chains. Presentation only: no entity, no AI, no collision and no hit surface, so combat never sees it. It draws only when the data row
// is enabled or the page carries ?preview=chained-pitborn. Chain links are one InstancedMesh, dust and sparks one pooled Points set;
// every temporary is allocated once, nothing is built per frame.
const D = GAME_DATA.chainedPitborn,
  M = D.motion,
  C = D.chains,
  P = D.dust,
  TURN = Math.PI * 2, // tuning-ok: one full turn in radians
  LOOPS = { pingpong: T.LoopPingPong, repeat: T.LoopRepeat },
  DOWN = new T.Vector3(0, -1, 0),
  hex = (v) => new T.Color(`#${v}`);
export const chainedPitbornOn = (search = globalThis.location?.search ?? "") =>
  D.enabled || new URLSearchParams(search).get(D.previewParam) === D.previewValue;
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
    lastPulse = 0;
  function anchors(w) {
    return C.rows.map((row) => w.toRender(w.geometry.ground(row.anchor), row.height));
  }
  function build(w, source) {
    const root = new T.Group(),
      model = clone(source.gltf.scene),
      hidden = new Set((source.description.starterHidden ?? []).map(T.PropertyBinding.sanitizeNodeName)),
      ground = w.geometry.ground(D.at),
      toward = w.geometry.ground(D.facesToward),
      scale = (w.layout.characterScale ?? 1) * (source.description.scale ?? 1) * D.scaleMultiplier;
    model.traverse((o) => {
      if (hidden.has(o.name)) o.visible = false;
      if (o.isMesh) o.frustumCulled = false;
    });
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
    const bones = C.rows.map((row) => model.getObjectByName(T.PropertyBinding.sanitizeNodeName(row.bone))),
      head = model.getObjectByName(T.PropertyBinding.sanitizeNodeName(M.headBone)),
      fixed = anchors(w);
    const link = new T.InstancedMesh(
      new T.TorusGeometry(C.linkRadius, C.linkTube, 6, 10), // tuning-ok: low-poly ring, phone-light
      new T.MeshStandardMaterial({ color: hex(C.color), roughness: C.roughness, metalness: C.metalness }),
      C.rows.length * C.links,
    );
    link.frustumCulled = false;
    const plate = new T.InstancedMesh(
      new T.SphereGeometry(C.anchorRadius, 8, 6), // tuning-ok: low-poly bolt head
      new T.MeshStandardMaterial({ color: hex(C.anchorColor), roughness: C.roughness, metalness: C.metalness }),
      C.rows.length,
    );
    fixed.forEach((at, i) => plate.setMatrixAt(i, tmp.m.makeTranslation(at.x, at.y, at.z)));
    const geometry = new T.BufferGeometry(),
      pos = new Float32Array(P.count * 3), // tuning-ok: xyz
      col = new Float32Array(P.count * 3), // tuning-ok: rgb
      born = new Float32Array(P.count).fill(-1e9),
      seed = Float32Array.from({ length: P.count }, (_, i) => Math.sin(i * 12.9898) * 0.5 + 0.5); // tuning-ok: fixed pseudo-random spread
    geometry.setAttribute("position", new T.BufferAttribute(pos, 3)); // tuning-ok: xyz
    geometry.setAttribute("color", new T.BufferAttribute(col, 3)); // tuning-ok: rgb
    const points = new T.Points(
      geometry,
      new T.PointsMaterial({ size: P.size, vertexColors: true, transparent: true, opacity: P.opacity, depthWrite: false, sizeAttenuation: true }),
    );
    points.frustumCulled = false;
    s.scene.add(root, link, plate, points);
    return { root, model, mixer, bones, head, fixed, link, plate, points, geometry, pos, col, born, seed, home, base: root.rotation.y, next: 0 };
  }
  function burst(p, time, feet) {
    const dust = hex(P.dustColor),
      spark = hex(P.sparkColor),
      n = Math.round(P.count / 3); // tuning-ok: a third of the pool per pulse
    for (let k = 0; k < n; k++) {
      const i = p.next;
      p.next = (p.next + 1) % P.count;
      const isSpark = p.seed[i] < P.sparkShare,
        at = isSpark ? p.fixed[(i + k) % p.fixed.length] : feet,
        c = isSpark ? spark : dust;
      p.born[i] = time;
      // tuning-ok: xyz stride and decorrelating offsets
      const jx = (p.seed[(i + 7) % P.count] - 0.5) * P.spreadMetres,
        jz = (p.seed[(i + 13) % P.count] - 0.5) * P.spreadMetres;
      p.pos.set([at.x + jx, at.y, at.z + jz], i * 3);
      p.col.set([c.r, c.g, c.b], i * 3); // tuning-ok: rgb stride
    }
  }
  function frame(p, g) {
    const dt = last === null ? 0 : Math.min(Math.max(g.time - last, 0), 0.1), // tuning-ok: clamp a long frame
      t = g.time,
      pull = 0.5 + 0.5 * Math.sin((t / M.pullSeconds) * TURN), // tuning-ok: half-amplitude wave, 0 slack to 1 taut
      jitter = pull > 0.7 ? Math.sin(t * M.shakeHz * TURN) * M.shakeMetres : 0; // tuning-ok: only shakes when nearly taut
    last = t;
    p.mixer.update(dt);
    const away = p.root.getWorldDirection(tmp.v); // faces the spawn; pulling leans it toward the player's side? no: back toward the wall
    p.root.position.set(p.home.x - away.x * M.leanMetres * (1 - pull) + jitter, p.home.y, p.home.z - away.z * M.leanMetres * (1 - pull));
    p.root.rotation.y = p.base;
    if (p.head) p.head.rotation.y += T.MathUtils.degToRad(M.headTurnDegrees) * Math.sin((t / M.headTurnSeconds) * TURN);
    p.root.updateMatrixWorld(true);
    const slack = 1 - pull;
    for (let c = 0; c < C.rows.length; c++) {
      (p.bones[c] ?? p.model).getWorldPosition(tmp.a);
      tmp.b.copy(p.fixed[c]);
      for (let k = 0; k < C.links; k++) {
        const u = (k + 0.5) / C.links, // tuning-ok: link centre along the chain
          u2 = (k + 1.5) / C.links; // tuning-ok: next link centre, for the tangent
        const point = (x, out) => out.lerpVectors(tmp.a, tmp.b, x).addScaledVector(DOWN, C.sagMetres * slack * 4 * x * (1 - x)); // tuning-ok: parabola sag
        point(u, tmp.p);
        point(Math.min(u2, 1), tmp.v);
        tmp.v.sub(tmp.p).normalize();
        tmp.q.setFromUnitVectors(T.Object3D.DEFAULT_UP, tmp.v);
        tmp.r.setFromAxisAngle(tmp.v, (k % 2) * Math.PI / 2); // tuning-ok: alternate links turn a quarter
        tmp.q.premultiply(tmp.r);
        tmp.sc.set(1, 1 + C.linkLength / C.linkRadius * 0.3, 1); // tuning-ok: stretch each ring a little along the chain
        p.link.setMatrixAt(c * C.links + k, tmp.m.compose(tmp.p, tmp.q, tmp.sc));
      }
    }
    p.link.instanceMatrix.needsUpdate = true;
    if (pull > P.burstAt && t - lastPulse > M.pullSeconds * 0.5) { // tuning-ok: at most one pulse per half cycle
      lastPulse = t;
      burst(p, t, tmp.a.copy(p.root.position));
    }
    let any = false;
    for (let i = 0; i < P.count; i++) {
      const age = t - p.born[i];
      if (age < 0 || age > P.lifeSeconds) {
        p.pos[i * 3 + 1] = -100; // tuning-ok: park dead specks out of sight
        continue;
      }
      any = true;
      p.pos[i * 3 + 1] += (P.riseMetres / P.lifeSeconds) * dt; // tuning-ok: xyz stride
    }
    if (any) p.geometry.attributes.position.needsUpdate = true;
    p.geometry.attributes.color.needsUpdate = true;
  }
  function drop() {
    if (!parts) return;
    parts.root.removeFromParent();
    for (const o of [parts.link, parts.plate, parts.points]) {
      o.removeFromParent();
      o.geometry.dispose();
      o.material.dispose();
    }
    parts.mixer.stopAllAction();
    parts = null;
  }
  return {
    update() {
      const g = s.game,
        w = s.world;
      if (disposed || !chainedPitbornOn()) return;
      if (!g || !w || !s.loaded || s.traveling || w.areaId !== D.areaId) {
        if (parts) parts.root.visible = parts.link.visible = parts.plate.visible = parts.points.visible = false;
        return;
      }
      if (!parts) {
        if (loading) return;
        loading = true;
        s.actors.modelAsset(D.model).then((source) => {
          loading = false;
          if (!disposed && source && !parts && s.world === w) parts = build(w, source);
        }, () => { loading = false; });
        return;
      }
      parts.root.visible = parts.link.visible = parts.plate.visible = parts.points.visible = true;
      frame(parts, g);
    },
    dispose() {
      disposed = true;
      drop();
    },
  };
}
