import { FLAME_DEATH_DATA, flameDeathSeconds, isFlameRecipe } from "./finisher-data.js";
import { FLAME_VISUAL_DATA as DATA } from "./flame-data.js";
import { combatTargetHeight } from "../pistol-targeting.js";
import { GAME_DATA } from "./game-data.js";
// Falloff texture, puff spread and cosmetic burn placement: data/visual.json `flameEffect`.
const FX = GAME_DATA.visual.flameEffect;
// The golden angle in radians, pi * (3 - sqrt 5): each emitter puff turns by this much round the stream, so they never line up.
const GOLDEN_ANGLE = 2.399963229728653; // tuning-ok: the golden angle in radians, a mathematical constant
// One private draw with fixed slots. Cosmetic victim fire never dispatches damage.
export function createFlameEffect({
  THREE: T,
  scene,
  world,
  getSource,
  getView = () => null,
  getEmission = null,
  cosmeticBurn = true,
  reducedMotion = () => false,
}) {
  const size = DATA.textureSize,
    pixels = new Uint8Array(size * size * 4), // tuning-ok: four bytes (RGBA) per pixel
    half = size / 2; // tuning-ok: the texture centre is half its size
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4, // tuning-ok: four bytes (RGBA) per pixel
        r = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half); // tuning-ok: 0.5 = the pixel's centre
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 255; // tuning-ok: RGBA channel offsets, white
      pixels[at + 3] = Math.round(Math.max(0, 1 - r) ** FX.texture.falloffPower * FX.texture.peakAlpha); // tuning-ok: alpha is channel 3
    }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.needsUpdate = true;
  const geometry = new T.PlaneGeometry(1, 1),
    material = new T.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: T.AdditiveBlending,
      forceSinglePass: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
      alphaTest: FX.alphaTest,
    }),
    capacity = DATA.emitterCount + DATA.burnSlots * DATA.burnPerVictim,
    mesh = new T.InstancedMesh(geometry, material, capacity),
    pose = new T.Object3D(),
    color = new T.Color(),
    direction = new T.Vector3(),
    u = new T.Vector3(),
    v = new T.Vector3(),
    up = new T.Vector3(0, 1, 0),
    anchor = new T.Vector3(),
    pelvisAnchor = new T.Vector3();
  mesh.name = "Flamethrower pooled flame and cosmetic fire";
  mesh.renderOrder = FX.renderOrder;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(mesh);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color.setHex(DATA.palette[i % DATA.palette.length]));
  let disposed = false,
    owner = null,
    area = world.areaId,
    emitter = 0,
    burn = 0,
    victims = 0,
    source = null,
    corpseAnchors = [];
  const hide = (i) => {
    pose.scale.setScalar(0);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
  };
  function reset() {
    for (let i = 0; i < capacity; i++) hide(i);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = false;
    emitter = burn = victims = 0;
    source = null;
    corpseAnchors = [];
  }
  function put(i, x, y, z, r, palette, aspect = 1, lift = false) {
    const floor = FX.floorClearance;
    if (y <= floor && !lift) return false;
    const q = world.camera.quaternion,
      // The quad's screen-facing height from the camera quaternion's matrix terms: 2 * (xy + wz) and 1 - 2 * (xx + zz), halved.
      tilt = 2 * (q.x * q.y + q.w * q.z), // tuning-ok: quaternion-to-matrix term
      lean = 1 - 2 * (q.x * q.x + q.z * q.z), // tuning-ok: quaternion-to-matrix term
      halfHeight = (r * (Math.abs(tilt) + aspect * Math.abs(lean))) / 2; // tuning-ok: half the extent
    if (lift) y = Math.max(y, halfHeight + floor);
    const floorScale = halfHeight > 0 ? Math.min(1, (y - floor) / halfHeight) : 1;
    pose.position.set(x, y, -z);
    pose.quaternion.copy(q);
    pose.scale.set(r * floorScale, r * aspect * floorScale, r * floorScale);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, color.setHex(palette));
    return true;
  }
  function update(g, { paused = false } = {}) {
    if (disposed) return;
    if (owner !== g || area !== world.areaId) {
      reset();
      owner = g;
      area = world.areaId;
    }
    for (let i = 0; i < capacity; i++) hide(i);
    emitter = burn = victims = 0;
    source = null;
    corpseAnchors = [];
    if (paused || g.player.hp <= 0 || g.finished) {
      mesh.visible = false;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const emission = getEmission?.(g),
      data = getEmission ? (emission ? { contact: emission.contact } : null) : g.world?.flameData;
    if (!data) {
      mesh.visible = false;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const widthScale = Number.isFinite(emission?.widthScale) && emission.widthScale > 0 ? emission.widthScale : 1,
      light = reducedMotion(),
      count = light ? DATA.reducedCount : DATA.emitterCount;
    if (data && (getEmission ? !!emission : !!g.flame?.equipped && g.flame.active)) {
      const s = emission?.source ?? getSource?.();
      if (s) {
        source = s;
        direction.set(s.direction.x, s.direction.y, s.direction.z).normalize();
        u.crossVectors(direction, up);
        if (u.lengthSq() < 1e-8) u.set(1, 0, 0);
        else u.normalize();
        v.crossVectors(u, direction).normalize();
        for (let i = 0; i < count; i++) {
          // A reduced-motion puff sits at the middle of its slot (0.5); otherwise the stream cycles cyclesPerSecond times a second.
          const phase = light ? (i + 0.5) / count : (g.time * FX.cyclesPerSecond + i / count) % 1, // tuning-ok: 0.5 = slot middle
            distance = data.contact.range * phase,
            theta = i * GOLDEN_ANGLE,
            radius = Math.tan((data.contact.coneDegrees * Math.PI) / 360) * distance * FX.spread.radiusShare,
            radial = light ? 0 : Math.sin(i * FX.spread.jitterRate) * radius,
            x = s.position.x + direction.x * distance + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * radial,
            y = s.position.y + direction.y * distance + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * radial,
            z = s.position.z + direction.z * distance + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * radial,
            width =
              widthScale *
              (DATA.emitterWidth[0] + DATA.emitterWidth[1] * phase) *
              Math.sin(Math.PI * Math.max(FX.phaseClamp[0], Math.min(FX.phaseClamp[1], phase)));
          if (
            world.lineClear(emission?.origin ?? g.player.pos, { x: s.position.x, z: s.position.z }) &&
            world.lineClear({ x: s.position.x, z: s.position.z }, { x, z }) &&
            put(i, x, y, z, width, DATA.palette[Math.min(DATA.palette.length - 1, Math.floor(phase * DATA.palette.length))])
          )
            emitter++;
        }
      }
    }
    const burnBudget = DATA.burnSlots * DATA.burnPerVictim,
      corpses = g.corpses ?? [];
    let used = 0;
    const candidates = FLAME_DEATH_DATA.prioritizeCorpses
      ? [
          ...corpses.filter((e) => isFlameRecipe(e.finisher?.recipeId)),
          ...g.enemies,
          ...corpses.filter((e) => !isFlameRecipe(e.finisher?.recipeId)),
        ]
      : [...g.enemies, ...corpses];
    if (cosmeticBurn && !light)
      for (const e of candidates) {
        if (victims >= DATA.burnSlots) break;
        const view = getView(e),
          death = e.hp <= 0 && isFlameRecipe(e.finisher?.recipeId),
          count = death ? FLAME_DEATH_DATA.wisps.length : DATA.burnPerVictim,
          age = view?.finisherAge,
          bone =
            (death && FLAME_DEATH_DATA.anchorBones.map((name) => view?.model.getObjectByName(name)).find(Boolean)) ||
            (death && view?.model),
          pelvisBone =
            (death && FLAME_DEATH_DATA.pelvisBones.map((name) => view?.model.getObjectByName(name)).find(Boolean)) ||
            bone;
        let life, front, height;
        if (used + count > burnBudget) continue;
        if (death) {
          const end = flameDeathSeconds(view?.finisherDeathSeconds);
          if (view?.restoredCorpse || !bone || !Number.isFinite(age) || age < 0 || age >= end) continue;
          bone.getWorldPosition(anchor);
          pelvisBone.getWorldPosition(pelvisAnchor);
          front = { x: anchor.x, z: -anchor.z };
          height = anchor.y;
          life = Math.min(1, (end - age) / FLAME_DEATH_DATA.fadeSeconds);
          if (!world.lineClear(e.pos, front)) continue;
          corpseAnchors.push({
            victimId: e.id,
            age,
            position: { x: anchor.x, y: anchor.y, z: -anchor.z },
            pelvisPosition: { x: pelvisAnchor.x, y: pelvisAnchor.y, z: -pelvisAnchor.z },
            expiresAge: end,
            nativeDeathSeconds: view.finisherDeathSeconds ?? FX.corpseDeathFallbackSeconds,
          });
        } else {
          if (!(e.flameBurnUntil > g.time)) continue;
          life = Math.min(1, (e.flameBurnUntil - g.time) / DATA.burnSeconds);
          height = combatTargetHeight(e, g.time);
          const from = e.flameBurnFrom ?? g.player.pos,
            dx = from.x - e.pos.x,
            dz = from.z - e.pos.z,
            n = Math.hypot(dx, dz) || 1,
            surface = Math.min(FX.burnSurface.maxOffset, (e.radius ?? FX.burnSurface.defaultRadius) * (e.combatScale ?? 1) + FX.burnSurface.margin);
          front = { x: e.pos.x + (dx / n) * surface, z: e.pos.z + (dz / n) * surface };
          if (!world.lineClear(e.pos, front)) continue;
        }
        for (let j = 0; j < count; j++) {
          const i = DATA.emitterCount + used + j,
            w = death ? FLAME_DEATH_DATA.wisps[j] : null,
            offset = (j - 0.5) * FX.burnWisp.spacing, // tuning-ok: 0.5 puts the two burn sprites either side of the centre
            base = w?.anchor === "pelvis" ? { x: pelvisAnchor.x, z: -pelvisAnchor.z } : front,
            baseY = w?.anchor === "pelvis" ? pelvisAnchor.y : height,
            x = base.x + (w ? w.offset[0] : offset),
            y =
              baseY +
              (w
                ? FLAME_DEATH_DATA.anchorLift +
                  w.offset[1] +
                  FLAME_DEATH_DATA.rise * ((g.time * FLAME_DEATH_DATA.riseRate + w.phase) % 1)
                : FX.burnWisp.baseHeight + Math.sin(g.time * FX.burnWisp.wobbleRate + j) * FX.burnWisp.wobbleHeight),
            z = base.z + (w ? w.offset[2] : 0),
            width = w
              ? w.width * (1 + FLAME_DEATH_DATA.flickerSize * Math.sin(g.time * FLAME_DEATH_DATA.flickerRate + w.phase))
              : DATA.burnWidth[j];
          if (put(i, x, y, z, width * life, w ? w.color : DATA.palette[j], w ? w.aspect : DATA.burnAspect, death))
            burn++;
        }
        used += count;
        victims++;
      }
    mesh.visible = emitter + burn > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  reset();
  return {
    update,
    reset,
    snapshot() {
      return {
        emitterCapacity: 1,
        particleCapacity: capacity,
        emitterParticles: emitter,
        cosmeticVictims: victims,
        corpseAnchors,
        burnParticles: burn,
        drawCalls: mesh.visible ? 1 : 0,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        source,
      };
    },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
