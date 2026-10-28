// Living and dying burn look for the flamethrower. Presentation only: it reads flameBurnUntil / hp / the corpse list and never writes a
// simulation field. A burning body chars (albedo toward soot, ember glow), licks a few pooled flames and trails dark smoke; a fire kill
// keeps burning and smoking on the corpse until the corpse is removed. Rows: data/burnPresentation.json. Off switch: ?burn=0.
// Material tint is applied after actors.js has restored every flash material for the frame (effects.update runs later in the loop),
// so it is recomputed from the base values each frame and nothing needs restoring here; state is released when the actor leaves.
import { GAME_DATA } from "./game-data.js";
import { isFlameRecipe } from "./finisher-data.js";
import { combatTargetHeight } from "../pistol-targeting.js";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hexNumber = (hex) => Number(`0x${hex}`);
const TAU = Math.PI * 2; // tuning-ok: a full turn in radians
const GOLDEN = 0.6180339887498949; // tuning-ok: golden-ratio conjugate, spreads per-actor seeds evenly

export const burnEnabled = (row = GAME_DATA.burnPresentation, search = globalThis.location?.search ?? "") =>
  new URLSearchParams(search).get(row.flagParam) === row.offValue ? false : row.defaultOn;

export const newBurnState = (seed = 0) => ({
  seed,
  char: 0,
  heat: 0,
  smoke: 0,
  dead: false,
  deadAt: 0,
  fireKill: false,
  litUntil: -Infinity,
});
// An actor starts (or keeps) a burn look when the flame touched it within the death grace window; everything else costs nothing.
export const startsBurn = (row, e, time) => (e.flameBurnUntil ?? -Infinity) >= time - row.dying.graceSeconds;
// One step of the look for one actor. `dt` is game seconds since the last step (0 while paused). Returns the same state object.
export function stepBurn(row, s, e, time, dt) {
  const L = row.living,
    D = row.dying,
    lit = (e.flameBurnUntil ?? -Infinity) > time;
  if (lit) s.litUntil = time + L.afterburnSeconds;
  if (e.hp > 0) {
    s.dead = false;
    s.fireKill = false;
    const step = (dt * L.maxChar) / (lit ? L.chargeSeconds : L.cooldownSeconds);
    s.char = lit ? Math.min(L.maxChar, s.char + step) : Math.max(0, s.char - step);
    s.heat = clamp01((s.litUntil - time) / L.afterburnSeconds);
    s.smoke = clamp01(s.char / L.maxChar);
    return s;
  }
  if (!s.dead) {
    s.dead = true;
    s.deadAt = time;
    s.fireKill = startsBurn(row, e, time);
  }
  const age = Math.max(0, time - s.deadAt);
  if (s.fireKill) {
    s.char = Math.max(s.char, clamp01(age / D.charSeconds) * D.maxChar);
    s.heat = clamp01(1 - age / D.burnSeconds);
    s.smoke = clamp01(1 - age / D.smokeSeconds);
  } else {
    s.char = Math.max(0, s.char - (dt * L.maxChar) / L.cooldownSeconds);
    s.heat = 0;
    s.smoke = 0;
  }
  return s;
}
const idle = (s, time) => !s.dead && s.char <= 0 && s.heat <= 0 && s.smoke <= 0 && s.litUntil < time;

const noop = {
  update() {},
  reset() {},
  dispose() {},
  snapshot: () => ({ enabled: false, tracked: 0, actors: 0, flamePuffs: 0, smokePuffs: 0, drawCalls: 0 }),
};
// Two pooled instanced draws (additive flame licks, normal-blended smoke), capacity fixed by the row; no lights, no per-frame allocation
// beyond the sorted candidate list.
export function createBurnPresentation({
  THREE: T,
  scene,
  world,
  getView = () => null,
  reducedMotion = () => false,
  row = GAME_DATA.burnPresentation,
  enabled = burnEnabled(row),
}) {
  if (!enabled) return noop;
  const X = row.texture,
    size = X.size,
    half = size / 2, // tuning-ok: the texture centre is half its size
    pixels = new Uint8Array(size * size * 4); // tuning-ok: four bytes (RGBA) per pixel
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4, // tuning-ok: four bytes (RGBA) per pixel
        r = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half); // tuning-ok: 0.5 = the pixel's centre
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 255; // tuning-ok: RGBA channel offsets, white
      pixels[at + 3] = Math.round(Math.max(0, 1 - r) ** X.falloffPower * X.peakAlpha); // tuning-ok: alpha is channel 3
    }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.needsUpdate = true;
  const geometry = new T.PlaneGeometry(1, 1),
    material = (extra) =>
      new T.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        side: T.DoubleSide,
        alphaTest: X.alphaTest,
        ...extra,
      }),
    flameMaterial = material({ blending: T.AdditiveBlending, forceSinglePass: true }),
    smokeMaterial = material({ opacity: row.smoke.opacity }),
    flameCap = row.maxActors * row.flame.puffs,
    smokeCap = row.maxActors * row.smoke.puffs,
    flameMesh = new T.InstancedMesh(geometry, flameMaterial, flameCap),
    smokeMesh = new T.InstancedMesh(geometry, smokeMaterial, smokeCap),
    pose = new T.Object3D(),
    colour = new T.Color(),
    soot = new T.Color(hexNumber(row.tint.sootColour)),
    ember = new T.Color(hexNumber(row.tint.emberColour)),
    smokeColour = hexNumber(row.smoke.colour),
    palette = row.flame.palette.map(hexNumber),
    states = new Map(),
    seen = new Set(),
    active = [];
  flameMesh.name = "Burn pooled flame licks"; // text-ok: scene-graph object name
  smokeMesh.name = "Burn pooled smoke"; // text-ok: scene-graph object name
  for (const m of [flameMesh, smokeMesh]) {
    m.renderOrder = X.renderOrder;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.visible = false;
    scene.add(m);
  }
  for (let i = 0; i < flameCap; i++) flameMesh.setColorAt(i, colour.setHex(palette[0]));
  for (let i = 0; i < smokeCap; i++) smokeMesh.setColorAt(i, colour.setHex(smokeColour));
  let disposed = false,
    owner = null,
    area = world.areaId,
    lastTime = null,
    seeds = 0,
    flames = 0,
    smokes = 0,
    shown = 0;
  const hide = (mesh, from) => {
    pose.scale.setScalar(0);
    pose.updateMatrix();
    for (let i = from; i < mesh.count; i++) mesh.setMatrixAt(i, pose.matrix);
  };
  function clear() {
    states.clear();
    seen.clear();
    active.length = 0;
    hide(flameMesh, 0);
    hide(smokeMesh, 0);
    flameMesh.visible = smokeMesh.visible = false;
    flameMesh.instanceMatrix.needsUpdate = smokeMesh.instanceMatrix.needsUpdate = true;
    flames = smokes = shown = 0;
  }
  function put(mesh, i, x, y, z, width, aspect) {
    const rise = width * aspect * 0.5; // tuning-ok: half the billboard height keeps its lower edge off the floor
    pose.position.set(x, Math.max(y, row.floorClearance + rise), z);
    pose.quaternion.copy(world.camera.quaternion);
    pose.scale.set(width, width * aspect, width);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
  }
  function tint(view, s, time) {
    const T0 = row.tint,
      flash = (view?.impactFlashLife ?? 0) > 0,
      flicker = 1 - (T0.flickerDepth * (1 - Math.sin(time * T0.flickerHz + s.seed * TAU))) / 2; // tuning-ok: map sine -1..1 to 0..1
    for (const m of view?.flashMaterials ?? []) {
      const mat = m.material;
      if (m.color && !flash) mat.color.copy(m.color).lerp(soot, s.char * T0.blend);
      if (Number.isFinite(m.roughness))
        mat.roughness = m.roughness + (Math.max(m.roughness, T0.roughnessFloor) - m.roughness) * s.char;
      if (mat.emissive && m.emissive && s.heat > 0 && !flash) {
        // Added on top of the base glow, in the emissive colour itself, so the intensity the material already has stays as it was.
        mat.emissive
          .copy(m.emissive)
          .add(colour.copy(ember).multiplyScalar((T0.emberIntensity * s.heat * flicker) / (m.intensity || 1)));
      }
    }
  }
  function draw(g, light) {
    const time = g.time,
      F = row.flame,
      S = row.smoke,
      nFlame = light ? F.reducedPuffs : F.puffs,
      nSmoke = light ? S.reducedPuffs : S.puffs;
    active.sort((a, b) => a.d - b.d);
    flames = smokes = 0;
    shown = Math.min(active.length, row.maxActors);
    for (let j = 0; j < shown; j++) {
      const { e, s } = active[j],
        age = s.dead ? time - s.deadAt : 0,
        lie = s.dead ? 1 - (1 - row.dying.lieHeightShare) * clamp01(age / row.dying.lieSeconds) : 1,
        h = combatTargetHeight(e, time) * lie,
        scale = e.mobSize ?? 1,
        x0 = e.pos.x,
        z0 = -e.pos.z;
      if (s.heat > 0 && !(e.hp > 0 && e.flameBurnUntil > time))
        // the short contact burn in flame-effect.js already covers a live hit
        for (let i = 0; i < nFlame; i++) {
          const phase = light ? (i + 1) / (nFlame + 1) : (time * F.cyclesPerSecond + i / nFlame + s.seed) % 1,
            angle = (i / nFlame + s.seed) * TAU,
            width = F.width * scale * s.heat * Math.sin(Math.PI * phase); // tuning-ok: half-sine fade in and out of one lick
          flameMesh.setColorAt(
            flames,
            colour.setHex(palette[Math.min(palette.length - 1, Math.floor(phase * palette.length))]),
          );
          put(
            flameMesh,
            flames++,
            x0 + Math.cos(angle) * F.spread * scale,
            h * (F.heightMin + (F.heightMax - F.heightMin) * ((i + phase) / nFlame)),
            z0 + Math.sin(angle) * F.spread * scale,
            width,
            F.aspect,
          );
        }
      if (s.smoke > 0)
        for (let i = 0; i < nSmoke; i++) {
          const phase = light ? (i + 1) / (nSmoke + 1) : (time / S.lifeSeconds + i / nSmoke + s.seed) % 1,
            angle = (i / nSmoke + s.seed) * TAU,
            width =
              (S.startWidth + (S.endWidth - S.startWidth) * phase) *
              scale *
              s.smoke *
              Math.sqrt(Math.sin(Math.PI * phase)); // tuning-ok: soft fade at both ends
          put(
            smokeMesh,
            smokes++,
            x0 + Math.cos(angle) * S.drift * phase * scale,
            h * S.startHeightShare + S.rise * phase,
            z0 + Math.sin(angle) * S.drift * phase * scale,
            width,
            S.aspect,
          );
        }
    }
    hide(flameMesh, flames);
    hide(smokeMesh, smokes);
    flameMesh.visible = flames > 0;
    smokeMesh.visible = smokes > 0;
    flameMesh.instanceMatrix.needsUpdate = smokeMesh.instanceMatrix.needsUpdate = true;
    flameMesh.instanceColor.needsUpdate = true;
  }
  function update(g, { paused = false } = {}) {
    if (disposed) return;
    if (owner !== g || area !== world.areaId) {
      clear();
      owner = g;
      area = world.areaId;
      lastTime = null;
    }
    const time = g.time,
      dt = paused || lastTime === null ? 0 : Math.max(0, time - lastTime);
    lastTime = time;
    seen.clear();
    active.length = 0;
    for (const list of [g.enemies ?? [], g.corpses ?? []])
      for (const e of list) {
        const dead = !(e.hp > 0);
        let s = states.get(e);
        if (dead && isFlameRecipe(e.finisher?.recipeId)) continue; // flame-effect.js and applyFlameCorpseChar already dress these
        if (!s) {
          if (!startsBurn(row, e, time) || (dead && getView(e)?.restoredCorpse)) continue;
          s = newBurnState((seeds++ * GOLDEN) % 1);
          states.set(e, s);
        }
        seen.add(e);
        stepBurn(row, s, e, time, dt);
        if (s.char > 0 || s.heat > 0) tint(getView(e), s, time);
        if (s.heat > 0 || s.smoke > 0) {
          const dx = e.pos.x - g.player.pos.x,
            dz = e.pos.z - g.player.pos.z;
          active.push({ e, s, d: dx * dx + dz * dz });
        }
      }
    for (const [e, s] of states) if (!seen.has(e) || idle(s, time)) states.delete(e); // release: the actor left or the look ended
    draw(g, reducedMotion());
  }
  return {
    update,
    reset: clear,
    snapshot: () => ({
      enabled: true,
      tracked: states.size,
      actors: shown,
      flamePuffs: flames,
      smokePuffs: smokes,
      flameCapacity: flameCap,
      smokeCapacity: smokeCap,
      drawCalls: Number(flameMesh.visible) + Number(smokeMesh.visible),
    }),
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      for (const m of [flameMesh, smokeMesh]) {
        m.removeFromParent();
        m.dispose();
      }
      geometry.dispose();
      flameMaterial.dispose();
      smokeMaterial.dispose();
      texture.dispose();
    },
  };
}
