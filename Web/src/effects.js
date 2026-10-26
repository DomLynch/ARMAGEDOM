import { SALAMANDER_BREATH, salamanderMouthSource } from "./salamander-native.js";
import { touchTargetCue } from "./engine/touch-target.js";
import { bossWeaponCue } from "./engine/boss-weapon-runtime.js";
import { goreProfile, finisherPresentationId } from "./engine/finisher-data.js";
import { createFlameEffect } from "./engine/flame-effect.js";
import { createSeverBloodEffect } from "./engine/sever-blood-effect.js";
import { createFinisherImpactGate } from "./finisher-impact-profile.js";
import { createDroneLaserBolts } from "./drone-laser.js";
import { createArcBolts } from "./engine/arc-bolt-view.js";
import { droneHoverHeight } from "./drone-mechanics.js";
import { createCombatImpact } from "./combat-impact.js";
import { createDonorAudio, requestPlaybackAudioSession } from "./donor-audio.js";
import * as THREE from "three";
import { pistolCue } from "./pistol-targeting.js";
import { addPickupGlow } from "./pickup-glow.js";
import { createDropMarker } from "./engine/drop-marker.js";
import { GAME_DATA } from "./engine/game-data.js";
import { rigCapability } from "./rig-capabilities.js";
import { webText } from "./engine/web-text.js";
// Web/src/data/visual.json `effects`: hex strings, read as numbers once.
const hexNumber = (hex) => Number(`0x${hex}`);
// Pools, colours and finisher droplet motion: visual.json `effects.feedback`.
const FEEL = GAME_DATA.visual.effects.feedback,
  POOL = FEEL.pools,
  DROP = FEEL.finisherDrop,
  BURST = FEEL.burst,
  RETICLE = FEEL.reticle,
  LINE = FEEL.line,
  FRAME = FEEL.frame,
  EVENT = FEEL.events,
  CUE = FEEL.cue;
const colors = Object.fromEntries(
  Object.entries(GAME_DATA.visual.effects.swingColours).map(([name, hex]) => [name, hexNumber(hex)]),
);
// Where an effect aims at a target of the given rig, from visual.json `effects.targetHeights`. `drone`, `scale` and `cue` are what a
// row's drone / scaled / cue entries resolve to (drone and scale are functions, only called when the row needs them).
const TARGET_HEIGHTS = GAME_DATA.visual.effects.targetHeights;
function targetHeight(site, rig, { drone, scale, cue, fallback }) {
  const rows = TARGET_HEIGHTS[site],
    row = Object.hasOwn(rows, rig) ? rows[rig] : rows.default;
  if ("fixed" in row) return row.fixed;
  if (row.drone) return drone();
  if (row.cue) return cue;
  if ("scaled" in row) return row.scaled * scale();
  return fallback;
}
export function createEffects(
  scene,
  world,
  pistolAsset = null,
  getMuzzle = () => null,
  {
    reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    hitMarker = null,
    getView = () => null,
    getFlameSource = () => null,
  } = {},
) {
  const projection = new THREE.Matrix4(),
    inverse = new THREE.Matrix4(),
    shift = new THREE.Matrix4(),
    cueProjection = new THREE.Vector3();
  const active = (game) =>
    !!(
      game.pistol?.equipped ||
      game.rifle?.selected ||
      game.bossEquipment?.shotgun?.selected ||
      game.bossEquipment?.rocketLauncher?.selected ||
      game.bossEquipment?.commanderPistol?.selected
    ) &&
    !game.flame?.equipped &&
    game.player.hp > 0 &&
    !game.finished;
  const shots = [],
    transient = [],
    loot = new Map(),
    gem = new THREE.OctahedronGeometry(FEEL.lootGemRadius),
    lootMaterials = GAME_DATA.visual.effects.lootColours.map(
      (hex) => new THREE.MeshBasicMaterial({ color: hexNumber(hex) }),
    );
  const droneLasers = createDroneLaserBolts({ scene, world, camera: world.camera });
  // Built on the first arc shot, so scenes that never fire the Arc Gun carry none of its pooled lines.
  let arcBolts = null;
  const arcView = () =>
    (arcBolts ??= createArcBolts({
      scene,
      data: GAME_DATA.visual.arcGun,
      camera: world.camera,
      viewportHeight: () => viewportHeight,
    }));
  let arcClock = 0;
  const droneY = (actor, time) => getView(actor)?.root?.position?.y ?? droneHoverHeight(time);
  let confirmation = null;
  let requestedMode = "high",
    motionReduced = !!reducedMotion();
  const impact = createCombatImpact({ mode: requestedMode, reducedMotion: motionReduced });
  let feedback = impact.update(0),
    particleIndex = 0,
    tracerIndex = 0,
    flashLife = 0,
    lastEquipped = false,
    basicRecoil = 0,
    viewportWidth = globalThis.innerWidth ?? FEEL.viewportFallback.width,
    viewportHeight = globalThis.innerHeight ?? FEEL.viewportFallback.height;
  const pool = new THREE.Group();
  pool.name = "Combat feedback pool"; // text-ok: scene-graph object name, never shown
  scene.add(pool);
  const unit = new THREE.BoxGeometry(1, 1, 1),
    particleMaterial = new THREE.MeshBasicMaterial({ color: "white", depthTest: true, depthWrite: false }),
    particleMesh = new THREE.InstancedMesh(unit, particleMaterial, POOL.particles),
    pose = new THREE.Object3D(),
    particleColour = new THREE.Color(),
    particleUp = new THREE.Vector3(0, 0, 1),
    particleVelocity = new THREE.Vector3(),
    particleCamera = new THREE.Quaternion(),
    particleCameraInverse = new THREE.Quaternion(),
    particleSpin = new THREE.Quaternion();
  const dropletMask = new THREE.InstancedBufferAttribute(new Float32Array(POOL.particles), 1);
  unit.setAttribute("goreDrop", dropletMask);
  particleMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute float goreDrop; varying float vGoreDropMask; varying vec2 vGoreDropPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvGoreDropMask=goreDrop; vGoreDropPosition=position.xy*2.0;",
    );
    shader.fragmentShader = "varying float vGoreDropMask; varying vec2 vGoreDropPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif(vGoreDropMask>0.5){vec2 drop=vec2(vGoreDropPosition.x/(0.78-0.28*vGoreDropPosition.y),vGoreDropPosition.y);if(dot(drop,drop)>1.0)discard;}",
    );
  };
  particleMaterial.customProgramCacheKey = () => "scoped-gore-drop-v1";
  particleMesh.name = "Combat pooled particles"; // text-ok: scene-graph object name, never shown
  particleMesh.renderOrder = 1;
  /* Same draw, after opaque actors0/masks-90; depth test retained. */ particleMesh.frustumCulled = false;
  particleMesh.visible = false;
  pool.add(particleMesh);
  const flameEffect = world.flameData
      ? createFlameEffect({ THREE, scene, world, getSource: getFlameSource, getView, reducedMotion })
      : null,
    severBlood = createSeverBloodEffect({ THREE, scene, world }),
    finisherGate = createFinisherImpactGate(),
    finisherBursts = new Map(),
    severEvents = [];
  let poolTime = 0;
  const bossFlame = Object.values(world.bossData?.profiles ?? {}).some((p) => p.weapon?.kind === "flame")
    ? createFlameEffect({
        THREE,
        scene,
        world,
        getView,
        reducedMotion,
        cosmeticBurn: false,
        getEmission: (g) => {
          const e = g.enemies.find(
              (e) =>
                e.bossProfile?.weapon?.kind === "flame" &&
                e.hp > 0 &&
                e.bossWeapon?.phase === "active" &&
                g.time >= e.recoverUntil &&
                g.time >= e.staggerUntil,
            ),
            mount = e && getView(e)?.flameMount,
            m = mount?.visible && mount.getObjectByName("Muzzle");
          if (!m) return null;
          const p = m.getWorldPosition(new THREE.Vector3()),
            d = m.getWorldDirection(new THREE.Vector3());
          return {
            source: { position: { x: p.x, y: p.y, z: -p.z }, direction: { x: d.x, y: d.y, z: -d.z } },
            origin: e.pos,
            contact: e.bossProfile.weapon,
            widthScale: e.rig === "boss-westminster-witch" ? FEEL.flameWidthScale.witch : 1,
          };
        },
      })
    : null;
  const salamanderPoint = new THREE.Vector3();
  const salamanderFlame = createFlameEffect({
    THREE,
    scene,
    world,
    getView,
    reducedMotion,
    cosmeticBurn: false,
    getEmission: (g) => {
      const e = g.enemies.find(
        (e) =>
          rigCapability(e.rig, "breathEmitter") &&
          e.hp > 0 &&
          e.bossWeapon?.phase === "active" &&
          g.time >= e.recoverUntil &&
          g.time >= e.staggerUntil,
      );
      if (!e) return null;
      const source = salamanderMouthSource(getView(e), e, salamanderPoint);
      return source
        ? { source, origin: e.pos, contact: SALAMANDER_BREATH, widthScale: FEEL.flameWidthScale.salamander }
        : null;
    },
  });
  const particles = Array.from({ length: POOL.particles }, () => ({
    life: 0,
    total: 1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0,
  }));
  const tracers = Array.from({ length: POOL.tracers }, () => {
    const geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(6), 3), // tuning-ok: a line segment is two points of three coordinates
      ),
      material = new THREE.LineBasicMaterial({
        color: hexNumber(FEEL.tracer.colour),
        transparent: true,
        opacity: FEEL.tracer.opacity,
        depthWrite: false,
      }),
      mesh = new THREE.Line(geometry, material);
    mesh.name = "Combat pooled tracer"; // text-ok: scene-graph object name, never shown
    mesh.visible = false;
    mesh.frustumCulled = false;
    pool.add(mesh);
    return { mesh, life: 0 };
  });
  const muzzleFlash = new THREE.Mesh(
    unit,
    new THREE.MeshBasicMaterial({ color: hexNumber(FEEL.muzzleFlashColour), depthWrite: false }),
  );
  muzzleFlash.name = "Combat muzzle flash"; // text-ok: scene-graph object name, never shown
  muzzleFlash.visible = false;
  pool.add(muzzleFlash);
  function nextParticle() {
    for (let n = 0; n < POOL.particles; n++) {
      const p = particles[particleIndex++ % POOL.particles];
      if (!p.finisherOwner) return p;
    }
    return null;
  }
  function nextTracer() {
    for (let n = 0; n < POOL.tracers; n++) {
      const t = tracers[tracerIndex++ % POOL.tracers];
      if (!t.finisherOwner) return t;
    }
    return null;
  }
  function releaseFinisher(token) {
    const burst = finisherBursts.get(token);
    if (!burst) return;
    finisherGate.cancel(token);
    for (const p of burst.particles) {
      p.finisherOwner = null;
      p.goreComposition = false;
      p.stretch = null;
      p.life = 0;
      p.delay = 0;
    }
    for (const t of burst.trails) {
      t.finisherOwner = null;
      t.life = 0;
    }
    finisherBursts.delete(token);
  }
  function clearFinisherBursts() {
    severBlood.reset();
    severEvents.length = 0;
    finisherGate.clear();
    for (const token of [...finisherBursts.keys()]) releaseFinisher(token);
  }
  function finisherSnapshot() {
    return {
      bursts: finisherBursts.size,
      reservedParticles: particles.filter((p) => p.finisherOwner).length,
      reservedTrails: tracers.filter((t) => t.finisherOwner).length,
      activeParticles: particles.filter((p) => p.finisherOwner && p.life > 0 && !(p.delay > 0)).length,
      activeTrails: tracers.filter((t) => t.finisherOwner && t.life > 0).length,
      poolTime,
      effects: [...finisherBursts.values()].map(({ effect }) => ({
        recipeId: effect.recipeId,
        origin: { ...effect.origin },
        startedAt: effect.startedAt,
        expiresAt: effect.expiresAt,
        palette: [...effect.palette],
      })),
    };
  }
  pool.userData.finisherImpact = finisherSnapshot; // Read-only receipt, no actor/clock authority.
  const impactAnchors = (view) =>
    view.gore?.started ? view.gore.impactAnchors() : view.finisher?.impactAnchors(view.finisherAge ?? 0);
  function syncFinisherBursts(game) {
    const corpses = (game.corpses ?? []).filter((e) => e.hp <= 0),
      views = new Set(corpses.map((e) => getView(e)).filter(Boolean));
    for (const token of [...finisherBursts.keys()])
      if (!views.has(token)) {
        releaseFinisher(token);
        severBlood.cancel(token);
      } else if (token.finisher?.stats().expired) releaseFinisher(token);
    for (const entity of corpses) {
      const view = getView(entity);
      if (!view || !(view.finisherStarted || view.gore?.started) || view.finisherImpactConsumed || !entity.finisher)
        continue;
      if (view.restoredCorpse || motionReduced || requestedMode === "off" || entity.finisher.recipeId === "ordinary") {
        view.finisherImpactConsumed = true;
        continue;
      }
      if (goreProfile(entity.finisher.recipeId) && !view.gore?.started) continue;
      const anchors = impactAnchors(view);
      if (!anchors) continue;
      view.finisherImpactConsumed = true;
      const headSever = ["decapitation", "pistol-decapitation"].includes(
          finisherPresentationId(entity.finisher.recipeId),
        ),
        sameImpact = (p) =>
          (headSever || !!goreProfile(entity.finisher.recipeId)) && !p.finisherOwner && p.impactVictimId === entity.id;
      const freeParticles = particles.filter((p) => !p.finisherOwner && (p.life <= 0 || sameImpact(p))),
        freeTrails = tracers.filter((t) => !t.finisherOwner && t.life <= 0);
      const effect = finisherGate.start(
        view,
        {
          lethal: true,
          victimId: entity.id,
          recipeId: entity.finisher.recipeId,
          damageType: entity.finisher.damageType,
          impactDirection: entity.finisher.impactDirection,
        },
        anchors,
        { now: poolTime, freeParticles: freeParticles.length, freeTrails: freeTrails.length },
      );
      if (!effect) continue;
      // An admitted sever/gore burst replaces only its victim’s generic hit spray.
      for (const p of particles) if (sameImpact(p)) p.life = 0;
      const allocated = freeParticles.slice(0, effect.droplets),
        trails = freeTrails.slice(0, effect.trails),
        d = effect.direction;
      if (!effect.gore?.burst) {
        allocated.forEach((p, i) => {
          p.goreComposition = false;
          p.stretch = null;
          const angle =
              effect.gore?.mode === "radial"
                ? ((i / allocated.length) * effect.gore.spreadDegrees * Math.PI) / 180
                : ((i / (allocated.length - 1) - 0.5) * // tuning-ok: 0.5 centres the fan on the impact direction
                    (effect.gore?.spreadDegrees ?? effect.spreadDegrees) *
                    Math.PI) /
                  180,
            speed =
              effect.speed *
              (DROP.speedBase + (DROP.speedSpread * ((i * DROP.speedStride) % allocated.length)) / allocated.length);
          Object.assign(p, {
            finisherOwner: view,
            impactVictimId: null,
            delay: effect.gore ? (effect.gore.emitSeconds * i) / Math.max(1, allocated.length - 1) : 0,
            palette: effect.palette[i % effect.palette.length],
            gravity: effect.gravity,
            groundClip: effect.groundClip,
            life: effect.lifetime,
            total: effect.lifetime,
            x: effect.origin.x,
            y: effect.origin.y,
            z: effect.origin.z,
            vx: (d.x * Math.cos(angle) - d.z * Math.sin(angle)) * speed,
            vy: effect.gore
              ? effect.gore.verticalSpeed + effect.speed * DROP.liftShare * (i % DROP.liftCycle)
              : effect.speed * (DROP.baseLift + DROP.liftShare * (i % DROP.liftCycle)),
            vz: (d.x * Math.sin(angle) + d.z * Math.cos(angle)) * speed,
            size: effect.dropSize,
          });
        });
      } else
        allocated.forEach((p, i) => {
          const c = effect.gore.burst,
            leading = i < c.leadingCount,
            j = leading ? i : i - c.leadingCount,
            count = leading ? c.leadingCount : allocated.length - c.leadingCount,
            fraction = count > 1 ? j / (count - 1) : 0.5, // tuning-ok: a lone droplet sits at the middle of the fan
            spread = (effect.gore.spreadDegrees * Math.PI) / 180,
            angle =
              (effect.gore.mode === "radial" ? (j / count) * spread : (fraction - 0.5) * spread) + // tuning-ok: 0.5 centres the fan
              (effect.gore.mode === "fan" ? Math.PI / 2 : 0), // tuning-ok: a fan opens a quarter turn (pi / 2) off the direction
            speed = effect.speed * (leading ? 1 : DROP.tailSpeedShare),
            range = c.extent[0] + (c.extent[1] - c.extent[0]) * fraction,
            band = leading ? c.leadingSize : c.tailSize,
            half = Math.ceil(count / 2); // tuning-ok: the first half of the droplets use the first delay, the rest the second
          Object.assign(p, {
            finisherOwner: view,
            goreComposition: true,
            stretch: anchors.gore?.material !== "machine" ? (c.stretch ?? null) : null,
            spawned: false,
            finisherAnchor: effect.anchor,
            travelled: 0,
            travelLimit: range * (leading ? 1 : DROP.tailTravelShare),
            holdSeconds: leading ? (c.holdSeconds ?? 0) : 0,
            impactVictimId: null,
            delay: leading ? (c.leadingDelays?.[j < half ? 0 : 1] ?? 0) : c.tailDelays[j < half ? 0 : 1],
            palette:
              effect.palette[
                leading ? (c.leadingPaletteIndices?.[j] ?? i % effect.palette.length) : i % effect.palette.length
              ],
            gravity: effect.gravity,
            groundClip: effect.groundClip,
            life: effect.lifetime,
            total: effect.lifetime,
            x: effect.origin.x,
            y: effect.origin.y,
            z: effect.origin.z,
            vx: (d.x * Math.cos(angle) - d.z * Math.sin(angle)) * speed,
            vy: effect.gore.verticalSpeed + (c.holdSeconds ? 0 : effect.speed * DROP.liftShare * (i % DROP.liftCycle)),
            vz: (d.x * Math.sin(angle) + d.z * Math.cos(angle)) * speed,
            size: band[0] + (band[1] - band[0]) * fraction,
          });
        });
      trails.forEach((t, i) => {
        const at = anchors.trails?.[i % (anchors.trails?.length ?? 1)] ?? effect.origin;
        t.finisherOwner = view;
        t.anchorIndex = i;
        t.previous = { ...at };
        t.life = t.total = effect.trailLifetime;
        t.maxLength = effect.trailLength;
        t.mesh.material.color.setHex(effect.palette[i % effect.palette.length]);
        t.mesh.material.depthTest = true;
        t.mesh.material.depthWrite = false;
        const p = t.mesh.geometry.attributes.position;
        p.setXYZ(0, at.x, at.y, at.z);
        p.setXYZ(1, at.x, at.y, at.z);
        p.needsUpdate = true;
      });
      finisherBursts.set(view, { effect, particles: allocated, trails });
      if (headSever || effect.gore) severBlood.start(view, effect, anchors);
      if (["decapitation", "pistol-decapitation"].includes(finisherPresentationId(effect.recipeId)))
        severEvents.push({ type: "sever-presented", victimId: entity.id, recipeId: effect.recipeId });
    }
    for (const [token, burst] of finisherBursts) {
      const anchors = impactAnchors(token);
      if (!anchors) continue;
      for (const t of burst.trails) {
        if (t.life <= 0) continue;
        const at = anchors.trails?.[t.anchorIndex % (anchors.trails?.length ?? 1)] ?? burst.effect.origin,
          old = t.previous,
          dx = at.x - old.x,
          dy = at.y - old.y,
          dz = at.z - old.z,
          n = Math.hypot(dx, dy, dz),
          r = n > t.maxLength ? t.maxLength / n : 1,
          p = t.mesh.geometry.attributes.position;
        p.setXYZ(0, at.x - dx * r, at.y - dy * r, at.z - dz * r);
        p.setXYZ(1, at.x, at.y, at.z);
        p.needsUpdate = true;
        t.previous = { ...at };
      }
    }
    severBlood.update(poolTime);
    tickPool(0);
  }
  function tickPool(dt) {
    if (confirmation) {
      confirmation.life = Math.max(0, confirmation.life - dt);
      if (!confirmation.life) confirmation = null;
    }
    if (world.camera) world.camera.getWorldQuaternion(particleCamera);
    else particleCamera.identity();
    particleCameraInverse.copy(particleCamera).invert();
    for (let i = 0; i < POOL.particles; i++) {
      const p = particles[i];
      pose.quaternion.identity();
      dropletMask.setX(i, p.stretch ? 1 : 0);
      if (p.delay > 0) {
        p.delay = Math.max(0, p.delay - dt);
        pose.scale.setScalar(0);
        pose.updateMatrix();
        particleMesh.setMatrixAt(i, pose.matrix);
        continue;
      }
      if (p.goreComposition && !p.spawned) {
        const a = impactAnchors(p.finisherOwner)?.[p.finisherAnchor];
        if (a) {
          p.x = a.x;
          p.y = a.y;
          p.z = a.z;
        } else p.life = 0;
        p.spawned = true;
      }
      p.life = Math.max(0, p.life - dt);
      if (p.life) {
        let horizontalDt = dt;
        if (p.goreComposition) {
          const speed = Math.hypot(p.vx, p.vz);
          horizontalDt = speed > 0 ? Math.min(dt, Math.max(0, p.travelLimit - p.travelled) / speed) : 0;
          p.travelled += speed * horizontalDt;
        }
        p.x += p.vx * horizontalDt;
        p.y += p.vy * dt;
        p.z += p.vz * horizontalDt;
        p.vy -= (p.gravity ?? FEEL.particle.gravity) * dt;
        if (p.groundClip && p.y <= 0) p.life = 0;
        pose.position.set(p.x, p.y, p.z);
        const visibleMass =
          p.goreComposition && p.holdSeconds > 0
            ? Math.min(1, p.life / Math.max(FEEL.particle.minLife, p.total - p.holdSeconds))
            : p.life / p.total;
        if (p.stretch) {
          pose.scale.set(
            p.size * visibleMass * p.stretch[0],
            p.size * visibleMass * p.stretch[1],
            p.size * visibleMass * p.stretch[2],
          );
          particleVelocity.set(p.vx, p.vy, p.vz).applyQuaternion(particleCameraInverse);
          const angle =
            particleVelocity.x * particleVelocity.x + particleVelocity.y * particleVelocity.y > 1e-12
              ? Math.atan2(-particleVelocity.x, particleVelocity.y)
              : 0;
          particleSpin.setFromAxisAngle(particleUp, angle);
          pose.quaternion.copy(particleCamera).multiply(particleSpin);
        } else pose.scale.setScalar(p.size * visibleMass);
        particleColour
          .setHex(p.palette ?? hexNumber(FEEL.particle.palette))
          .multiplyScalar(FEEL.particle.dimBase + FEEL.particle.dimSpan * visibleMass);
        particleMesh.setColorAt(i, particleColour);
      } else pose.scale.setScalar(0);
      pose.updateMatrix();
      particleMesh.setMatrixAt(i, pose.matrix);
    }
    particleMesh.visible = particles.some((p) => p.life > 0);
    particleMesh.instanceMatrix.needsUpdate = true;
    dropletMask.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
    for (const t of tracers) {
      t.life = Math.max(0, t.life - dt);
      t.mesh.visible = t.life > 0;
      t.mesh.material.opacity = FEEL.tracer.opacity * Math.min(1, t.life / (t.total ?? FEEL.tracer.defaultSeconds));
    }
    flashLife = Math.max(0, flashLife - dt);
    muzzleFlash.visible = flashLife > 0;
  }
  function clearFeedback() {
    confirmation = null;
    if (hitMarker) hitMarker.hidden = true;
    impact.reset();
    feedback = impact.update(0);
    for (const p of particles) if (!p.finisherOwner) p.life = 0;
    for (const t of tracers) if (!t.finisherOwner) t.life = 0;
    flashLife = basicRecoil = 0;
    tickPool(0);
  }
  function direction(event) {
    const d = event.direction ?? event.impactDirection ?? event.dir ?? { x: 0, z: 1 };
    if (!world.camera) return { x: d.x, y: -d.z };
    const a = world.toRender(event.position ?? event.origin ?? event.actor.pos, 1),
      b = a.clone().add(new THREE.Vector3(d.x, 0, -d.z));
    a.project(world.camera);
    b.project(world.camera);
    return { x: ((b.x - a.x) * viewportWidth) / 2, y: ((a.y - b.y) * viewportHeight) / 2 }; // tuning-ok: NDC spans 2 over the screen
  }
  function burst(event, killed, time) {
    const p = event.position ?? event.actor.pos,
      d = event.impactDirection ?? { x: 0, z: 1 },
      count =
        feedback.mode === "off"
          ? BURST.counts.off
          : feedback.mode === "low"
            ? BURST.counts.low
            : killed
              ? BURST.counts.killed
              : BURST.counts.hit,
      life =
        feedback.mode === "off" ? BURST.lifeSeconds.off : killed ? BURST.lifeSeconds.killed : BURST.lifeSeconds.hit,
      size = event.actor.mobSize ?? 1;
    for (let i = 0; i < count; i++) {
      const v = nextParticle(),
        a = (i / count) * Math.PI * 2; // tuning-ok: a full turn is 2 * pi
      if (!v) break;
      Object.assign(v, {
        stretch: null,
        impactVictimId: event.actor.id,
        palette: hexNumber(FEEL.particle.palette),
        gravity: FEEL.particle.gravity,
        groundClip: false,
        life,
        total: life,
        x: p.x,
        y: targetHeight("burst", event.actor.rig, {
          drone: () => droneY(event.actor, time),
          scale: () => getView(event.actor)?.root.scale.y ?? size,
        }),
        z: -p.z,
        vx: Math.cos(a) * BURST.spread + d.x,
        vy: BURST.liftBase + (i % BURST.liftCycle) * BURST.liftStep,
        vz: Math.sin(a) * BURST.spread - d.z,
        size:
          (feedback.mode === "off"
            ? BURST.sizes.off
            : feedback.mode === "low"
              ? BURST.sizes.low
              : killed
                ? BURST.sizes.killed
                : BURST.sizes.hit) * size,
      });
    }
  }
  const pickup = new THREE.Group(),
    reticle = new THREE.Group();
  pickup.name = "Starting pistol pickup"; // text-ok: scene-graph object name, never shown
  reticle.name = "Pistol aim marker"; // text-ok: scene-graph object name, never shown
  const pickupContours = [];
  if (pistolAsset) {
    const gun = pistolAsset.scene.clone(true),
      surfaces = [];
    gun.rotation.set(Math.PI / 2, 0, FEEL.pickupGun.tilt); // tuning-ok: pi / 2 lays the gun flat, a quarter turn
    gun.position.y = FEEL.pickupGun.height;
    gun.scale.setScalar(FEEL.pickupGun.scale);
    gun.traverse((o) => {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (o.isMesh && !o.isSkinnedMesh && materials.every((m) => m?.isMeshStandardMaterial)) surfaces.push(o);
    });
    for (const mesh of surfaces) {
      const contour = addPickupGlow(mesh);
      // The HUD's pale gold.
      contour.halo.material.uniforms.color.value.set(hexNumber(FEEL.pickupGun.contourColour));
      pickupContours.push(contour);
    }
    pickup.add(gun);
  }
  const pickupMarker = createDropMarker(webText("effects.pistolDropLabel"));
  pickup.add(pickupMarker.group);
  const bracketGeometry = (padding) => {
    const vertices = [];
    const rect = (x, y, w, h) => {
      const l = x - w / 2, // tuning-ok: half the width either side of the centre
        r = x + w / 2, // tuning-ok: half the width either side of the centre
        b = y - h / 2, // tuning-ok: half the height either side of the centre
        t = y + h / 2; // tuning-ok: half the height either side of the centre
      vertices.push(l, b, 0, r, b, 0, r, t, 0, l, b, 0, r, t, 0, l, t, 0);
    };
    const {
      barLength: bar,
      barThickness: thick,
      cornerNear: near,
      cornerFar: far,
      cornerLength: long,
      cornerThickness: lip,
    } = RETICLE;
    rect(0, 0, bar + padding, thick + padding);
    rect(0, 0, thick + padding, bar + padding);
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        rect(x * near, y * far, long + padding, lip + padding);
        rect(x * far, y * near, lip + padding, long + padding);
      }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); // tuning-ok: x, y, z
  };
  const outlineGeometry = bracketGeometry(RETICLE.outlinePad),
    cueGeometry = bracketGeometry(0),
    outlineMaterial = new THREE.MeshBasicMaterial({
      color: hexNumber(RETICLE.outlineColour),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }),
    cueMaterial = new THREE.MeshBasicMaterial({
      color: hexNumber(RETICLE.cueColour),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
  const outline = new THREE.Mesh(outlineGeometry, outlineMaterial),
    brackets = new THREE.Mesh(cueGeometry, cueMaterial),
    accentGeometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(RETICLE.accentTriangle, 3), // tuning-ok: x, y, z per vertex
    ),
    accentMaterial = new THREE.MeshBasicMaterial({
      color: hexNumber(RETICLE.accentColour),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }),
    accent = new THREE.Mesh(accentGeometry, accentMaterial);
  outline.renderOrder = RETICLE.renderOrders.outline;
  brackets.renderOrder = RETICLE.renderOrders.cue;
  accent.renderOrder = RETICLE.renderOrders.accent;
  accent.position.y = RETICLE.accentY;
  reticle.add(outline, brackets, accent);
  pickup.visible = reticle.visible = false;
  scene.add(pickup, reticle);

  function line(center, dir, radius, arc, color, expires, height = LINE.defaultHeight, stroke = false) {
    const ring = arc >= LINE.ringArcDegrees,
      points = [],
      steps = LINE.steps,
      angle = Math.atan2(dir.x, -dir.z);
    if (!ring && !stroke) points.push(new THREE.Vector3(0, height, 0));
    for (let i = 0; i <= steps; i++) {
      const a = angle - (arc * Math.PI) / 360 + (((arc * Math.PI) / 180) * i) / steps;
      points.push(new THREE.Vector3(Math.sin(a) * radius, height, Math.cos(a) * radius));
    }
    if (!ring && !stroke) points.push(new THREE.Vector3(0, height, 0));
    const mesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: LINE.opacity, depthWrite: false }),
    );
    mesh.position.copy(world.toRender(center));
    scene.add(mesh);
    transient.push({ mesh, expires });
    return mesh;
  }
  function erase(effect) {
    scene.remove(effect.mesh);
    effect.mesh.geometry.dispose();
    effect.mesh.material.dispose();
  }
  return {
    takeSeverEvents() {
      return severEvents.splice(0);
    },
    configureFeedback(mode) {
      requestedMode = ["high", "low", "off"].includes(mode) ? mode : "low";
      impact.configure({ mode: requestedMode, reducedMotion: !!reducedMotion() });
      clearFinisherBursts();
      clearFeedback();
    },
    advance(dt, { paused = false } = {}) {
      const reduced = !!reducedMotion();
      if (reduced !== motionReduced) {
        motionReduced = reduced;
        impact.configure({ mode: requestedMode, reducedMotion: reduced });
        clearFinisherBursts();
        clearFeedback();
      }
      const visualDt = Math.min(FRAME.maxStep, Math.max(0, Number.isFinite(dt) ? dt : 0));
      feedback = impact.update(visualDt, { paused });
      if (!paused) {
        poolTime += visualDt;
        severBlood.update(poolTime);
        for (const expired of finisherGate.expire(poolTime))
          for (const [token, burst] of finisherBursts) if (burst.effect === expired) releaseFinisher(token);
        const elapsed = visualDt;
        basicRecoil *= Math.exp(-elapsed * FRAME.recoilDecay);
        if (basicRecoil < FRAME.recoilSettle) basicRecoil = 0;
        tickPool(elapsed);
      }
    },
    snapshot() {
      return {
        ...feedback,
        flame: flameEffect?.snapshot() ?? null,
        bossFlame: bossFlame?.snapshot() ?? null,
        salamanderFlame: salamanderFlame.snapshot(),
        requestedMode,
        particleCapacity: POOL.particles,
        tracerCapacity: POOL.tracers,
        activeParticles: particles.filter((p) => p.life > 0 && !(p.delay > 0)).length,
        activeTracers: tracers.filter((t) => t.life > 0).length,
        finisherImpact: finisherSnapshot(),
        severBlood: severBlood.snapshot(),
        muzzleFlash: muzzleFlash.visible,
        hitConfirmation: confirmation ? { life: confirmation.life, killed: confirmation.killed } : null,
      };
    },
    clearFlameFeedback() {
      flameEffect?.reset();
      bossFlame?.reset();
      salamanderFlame.reset();
      for (let i = transient.length - 1; i >= 0; i--)
        if (transient[i].bossWarning) {
          erase(transient[i]);
          transient.splice(i, 1);
        }
    },
    clearPistolFeedback() {
      clearFeedback();
      reticle.visible = false;
      reticle.userData.targetId = null;
      reticle.userData.ready = false;
    },
    pistolRecoil(game) {
      return active(game) ? (feedback.mode === "off" ? basicRecoil * FRAME.offRecoilShare : feedback.shot) : 0;
    },
    render(renderer, camera, game, height, width = height * (camera.aspect ?? 1)) {
      const visible = game.player.hp > 0 && !game.finished && !reducedMotion(),
        x = visible ? feedback.cameraX : 0,
        y = visible ? feedback.cameraY : 0;
      if (!(height > 0) || (!x && !y)) return renderer.render(scene, camera);
      projection.copy(camera.projectionMatrix);
      inverse.copy(camera.projectionMatrixInverse);
      // tuning-ok: pixels to normalised device coordinates, which span 2 across the screen (y is flipped)
      camera.projectionMatrix.premultiply(shift.makeTranslation((2 * x) / Math.max(1, width), (-2 * y) / height, 0)); // tuning-ok: NDC spans 2
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      try {
        return renderer.render(scene, camera);
      } finally {
        camera.projectionMatrix.copy(projection);
        camera.projectionMatrixInverse.copy(inverse);
      }
    },
    events(game) {
      const dead = new Set(game.events.filter((e) => e.type === "death").map((e) => e.actor?.id));
      for (const event of game.events) {
        const actor = event.actor,
          donor = game.pilot === "donor-knife";
        if (event.type === "railgun-shot") {
          const a = event.origin;
          muzzleFlash.position.set(a.x, a.y, a.z);
          muzzleFlash.scale.set(...EVENT.railgun.flashScale);
          flashLife = EVENT.railgun.flashSeconds;
        }
        if (event.type === "arc-chain") arcView().fire(event.links, game.time);
        if (event.type === "arc-stun") arcView().stun(event.actor, game.time + event.seconds, game.time);

        if (event.type === "boss-ranged-warning") {
          line(actor.pos, event.dir, event.range, event.arc, hexNumber(EVENT.warningColour), event.until);
          transient.at(-1).bossGunWarning = actor.id;
        }
        if (event.type === "boss-shotgun-shot")
          shots.push(...event.pellets.map((ray) => ({ ...event, ...ray, pellets: undefined })));
        if (event.type === "shot") {
          if (event.weapon === "shotgun" && Array.isArray(event.pellets))
            shots.push(...event.pellets.map((ray) => ({ ...event, ...ray, pellets: undefined })));
          else shots.push(event);
          lastEquipped = true;
          basicRecoil = 1;
          impact.event({ type: "shot", ...direction(event), pistol: true });
          feedback = impact.update(0);
        }
        if (event.type === "holster") this.clearPistolFeedback();
        if (event.type === "enemy-attack" && actor.swing)
          line(
            actor.pos,
            event.dir,
            event.range,
            event.arc,
            hexNumber(
              actor.kind === EVENT.attackColours.specialKind ? EVENT.attackColours.special : EVENT.attackColours.other,
            ),
            actor.swing.hitAt,
          );
        if (event.type === "hit" && donor && !event.blocked && event.amount > 0) {
          const killed = dead.has(actor.id);
          impact.event({ type: killed ? "death" : "hit", ...direction(event), pistol: event.weapon === "pistol" });
          feedback = impact.update(0);
          if (event.weapon !== "flamethrower") burst(event, killed, game.time);
          if (actor !== game.player)
            confirmation = {
              recipeId: actor.finisher?.recipeId,
              position: { ...(event.position ?? actor.pos) },
              height: targetHeight("confirm", actor.rig, {
                drone: () => droneY(actor, game.time),
                scale: () => getView(actor)?.root.scale.y ?? actor.mobSize ?? 1,
              }),
              killed,
              life: EVENT.confirmationSeconds,
            };
        }
        if (event.type === "strike") {
          const size = actor.kind >= 0 ? (actor.mobSize ?? 1) : 1;
          if (
            ["rat_low", "rat_bite", "dog_low", "dog_bite", "roach_low", "roach_bite", "drone_low"].includes(
              event.moveId,
            )
          )
            line(
              actor.pos,
              event.dir,
              ["rat_bite", "roach_bite"].includes(event.moveId) && actor.contactGoalReach
                ? actor.contactGoalReach
                : ["rat_bite", "roach_bite"].includes(event.moveId)
                  ? EVENT.lowLine.biteReach
                  : event.moveId === "dog_bite"
                    ? (actor.contactGoalReach ?? EVENT.lowLine.dogBiteReach)
                    : EVENT.lowLine.otherReach,
              90,
              colors.slash,
              game.time + EVENT.lineSeconds,
              ["dog_bite", "roach_bite"].includes(event.moveId) && actor.contactGoalReach
                ? (actor.swing?.calfGoal?.y ??
                    (event.moveId === "roach_bite" ? EVENT.lowLine.roachBiteHeight : EVENT.lowLine.dogBiteHeight))
                : ["dog_low", "drone_low"].includes(event.moveId) && actor.swing?.clip === "DogMidSlash"
                  ? EVENT.lowLine.midSlashShare * (getView(actor)?.root.scale.y ?? EVENT.lowLine.midSlashScaleFallback)
                  : EVENT.lowLine.height,
              true,
            );
          else if (donor && event.action === "special")
            line(
              actor.pos,
              event.dir,
              EVENT.special.reach * (actor.combatScale ?? EVENT.special.combatScaleFallback),
              90,
              colors.special,
              game.time + EVENT.lineSeconds,
              EVENT.special.height * size,
              true,
            );
          else if (event.action === "stab") {
            const a = world.toRender(actor.pos, EVENT.stab.height * size),
              b = a
                .clone()
                .add(
                  new THREE.Vector3(event.dir.x * EVENT.stab.length * size, 0, -event.dir.z * EVENT.stab.length * size),
                );
            const mesh = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([a, b]),
              new THREE.LineBasicMaterial({ color: colors.stab, transparent: true, opacity: EVENT.stab.opacity }),
            );
            scene.add(mesh);
            transient.push({ mesh, expires: game.time + EVENT.lineSeconds });
          } else
            line(
              actor.pos,
              event.dir,
              event.action === "special"
                ? EVENT.melee.specialReach
                : event.action === "heavy"
                  ? EVENT.melee.heavyReach * size
                  : EVENT.melee.slashReach * size,
              event.action === "special" ? 360 : EVENT.melee.arc,
              colors[event.action],
              game.time + EVENT.lineSeconds,
              EVENT.melee.height * size,
              true,
            );
        }
        if (event.type === "saw-contact") {
          const target =
            game.enemies.find((e) => e.id === event.targetId) ??
            (game.player.id === event.targetId ? game.player : null);
          if (target)
            burst({ actor: target, position: event.position, impactDirection: actor.facing }, false, game.time);
        }
        if (["parry", "block", "guard-break"].includes(event.type))
          line(
            donor ? (event.position ?? actor.pos) : actor.pos,
            actor.facing,
            EVENT.defence.reach,
            donor && event.type !== "guard-break" ? EVENT.defence.arc : 360,
            hexNumber(
              event.type === "parry"
                ? EVENT.defence.colours.parry
                : event.type === "block"
                  ? EVENT.defence.colours.block
                  : EVENT.defence.colours.break,
            ),
            game.time + EVENT.defence.seconds,
          );
      }
      tickPool(0);
    },
    update(
      game,
      {
        paused = false,
        visibleIds,
        viewportHeight: height = FEEL.viewportFallback.height,
        viewportWidth: width = FEEL.viewportFallback.width,
      } = {},
    ) {
      viewportHeight = height;
      viewportWidth = width;
      syncFinisherBursts(game);
      for (let i = transient.length - 1; i >= 0; i--)
        if (
          game.time >= transient[i].expires ||
          game.finished ||
          (transient[i].bossGunWarning &&
            (paused || !game.enemies.some((e) => e.id === transient[i].bossGunWarning && e.hp > 0 && e.bossRanged))) ||
          (transient[i].bossWarning &&
            (!game.enemies.some(
              (e) =>
                e.id === transient[i].bossWarning &&
                e.bossProfile?.weapon?.kind === "flame" &&
                e.hp > 0 &&
                e.bossWeapon?.phase === "warning",
            ) ||
              paused))
        ) {
          erase(transient[i]);
          transient.splice(i, 1);
        }
      for (const shot of shots) {
        const muzzle = shot.npcSource ? null : getMuzzle(),
          a = shot.npcSource
            ? new THREE.Vector3(shot.npcSource.x, shot.npcSource.y, shot.npcSource.z)
            : muzzle
              ? muzzle.getWorldPosition(new THREE.Vector3())
              : world.toRender(shot.origin, FEEL.shot.originHeight),
          victim = [...game.enemies, ...(game.corpses ?? [])].find((e) => e.id === shot.targetId),
          b = world.toRender(
            shot.end,
            targetHeight("tracer", victim?.rig, {
              drone: () => droneY(victim, game.time),
              scale: () => getView(victim)?.root.scale.y ?? 1,
              fallback: a.y,
            }),
          ),
          t = nextTracer();
        if (!t) continue;
        const p = t.mesh.geometry.attributes.position;
        const flash = feedback.mode === "high" ? FEEL.shot.flash.high : FEEL.shot.flash.low;
        t.total = FEEL.tracer.defaultSeconds;
        t.mesh.material.color.setHex(hexNumber(FEEL.tracer.colour));
        t.mesh.material.depthTest = true;
        p.setXYZ(0, a.x, a.y, a.z);
        p.setXYZ(1, b.x, b.y, b.z);
        p.needsUpdate = true;
        t.life = FEEL.tracer.defaultSeconds;
        muzzleFlash.position.copy(a);
        muzzleFlash.scale.set(...flash.scale);
        flashLife = flash.seconds;
      }
      tickPool(0);
      shots.length = 0;
      if (hitMarker) {
        hitMarker.hidden = !confirmation;
        if (confirmation) {
          const p = world.toRender(confirmation.position, confirmation.height);
          if (world.camera) p.project(world.camera);
          const lift = confirmation.killed ? (goreProfile(confirmation.recipeId)?.burst?.markerLiftPx ?? 0) : 0,
            m = FEEL.hitMarker,
            screenX = ((p.x + 1) * width) / 2, // tuning-ok: NDC spans 2 over the screen
            screenY = ((1 - p.y) * height) / 2, // tuning-ok: NDC spans 2 over the screen
            markerX = lift ? Math.max(m.sideMargin, Math.min(width - m.sideMargin, screenX)) : screenX,
            markerY = lift
              ? Math.max(Math.min(m.topMax, height * m.topShare), Math.min(height * m.bottomShare, screenY - lift))
              : screenY;
          hitMarker.style.transform = `translate(${markerX}px,${markerY}px) translate(-50%,-50%)`;
          hitMarker.textContent = feedback.mode === "high" ? (confirmation.killed ? "DOWN" : "HIT") : "×";
        }
      }
      const pistol = game.pistol;
      if ((lastEquipped && !active(game)) || game.finished || game.player.hp <= 0) this.clearPistolFeedback();
      lastEquipped = active(game);
      pickup.visible = !!pistol && !pistol.collected && world.areaId === pistol.pickupAreaId && !game.finished;
      if (pickup.visible) {
        pickup.position.copy(world.toRender(pistol.pickupPos));
        // The starting pistol is the first thing a new player must find: its outline breathes until picked up.
        // The outline is a fixed screen-pixel stroke, so a phone-width screen gets a thicker one to read at that size.
        const pulse = FEEL.pickupPulse,
          strokeScale =
            (pulse.base + pulse.swing * Math.sin(game.time * pulse.rate)) *
            (width <= pulse.phoneWidth ? pulse.phoneScale : 1);
        for (const contour of pickupContours) contour.halo.userData.strokeScale = strokeScale;
      }
      const weaponCue = pistolCue(game, { paused, visibleIds }) ?? bossWeaponCue(game, { paused, visibleIds }),
        selectionCue = touchTargetCue(game, { paused, visibleIds }),
        cue = game.touchTarget
          ? selectionCue
            ? game.flame?.equipped
              ? selectionCue
              : weaponCue
                ? { ...weaponCue, ready: weaponCue.ready && selectionCue.ready, selection: true }
                : null
            : null
          : weaponCue;
      reticle.visible = !!cue;
      if (cue) {
        const target = cue.targetId != null,
          camera = world.camera;
        reticle.userData.targetId = cue.targetId;
        reticle.userData.ready = cue.ready;
        reticle.userData.explicitSelection = cue.selection === true;
        reticle.userData.selectedId = game.touchTarget?.id ?? null;
        const actor = target ? game.enemies.find((e) => e.id === cue.targetId) : null,
          height =
            actor && !cue.ground && !cue.heightLocked
              ? targetHeight("reticle", actor.rig, {
                  drone: () => droneY(actor, game.time),
                  scale: () => getView(actor)?.root.scale.y ?? actor.mobSize ?? 1,
                  cue: cue.height,
                })
              : cue.height;
        reticle.position.copy(world.toRender(cue.position, height));
        if (camera) {
          reticle.quaternion.copy(camera.quaternion);
          cueProjection.copy(reticle.position).project(camera);
          const maxX = 1 - CUE.edgeMargin / Math.max(CUE.minViewport, viewportWidth),
            maxY = 1 - CUE.edgeMargin / Math.max(CUE.minViewport, viewportHeight),
            edge =
              Math.abs(cueProjection.x) > maxX || Math.abs(cueProjection.y) > maxY || Math.abs(cueProjection.z) > 1;
          reticle.userData.edge = edge;
          if (edge)
            reticle.position.copy(
              cueProjection
                .set(
                  Math.max(-maxX, Math.min(maxX, cueProjection.x)),
                  Math.max(-maxY, Math.min(maxY, cueProjection.y)),
                  Math.max(-CUE.clampZ, Math.min(CUE.clampZ, cueProjection.z)),
                )
                .unproject(camera),
            );
          const depth = reticle.position.distanceTo(camera.position),
            pixels = target ? CUE.pixels.target : CUE.pixels.ground;
          reticle.scale.setScalar(
            (2 * pixels * depth) / (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]), // tuning-ok: NDC spans 2
          );
        } else reticle.scale.setScalar(target ? CUE.fallbackScale.target : CUE.fallbackScale.ground);
        cueMaterial.opacity = cue.ready ? (target ? CUE.opacity.readyTarget : CUE.opacity.ready) : CUE.opacity.notReady;
        outlineMaterial.opacity = CUE.outlineOpacity;
        accent.visible = target || !!reticle.userData.edge;
      } else {
        reticle.userData.targetId = null;
        reticle.userData.ready = false;
      }

      const sync = (items, map, geometry, material, height) => {
        const ids = new Set(items.map((x) => x.id));
        for (const [id, mesh] of map)
          if (!ids.has(id)) {
            scene.remove(mesh);
            map.delete(id);
          }
        for (const item of items) {
          let mesh = map.get(item.id);
          if (!mesh) {
            mesh = new THREE.Mesh(geometry, typeof material === "function" ? material(item) : material);
            map.set(item.id, mesh);
            scene.add(mesh);
          }
          mesh.position.copy(world.toRender(item.pos, item.height ?? height));
          if (geometry === gem) mesh.rotation.y = game.time * FEEL.loot.spinRate;
        }
      };
      if (!paused)
        for (const e of game.enemies)
          if (
            e.hp > 0 &&
            e.bossProfile?.weapon?.kind === "flame" &&
            e.rig !== "boss-westminster-witch" &&
            e.bossWeapon?.phase === "warning" &&
            !transient.some((t) => t.bossWarning === e.id)
          ) {
            const w = e.bossProfile.weapon,
              m = getView(e)?.flameMount?.getObjectByName("Muzzle"),
              p = m?.getWorldPosition(new THREE.Vector3()),
              origin = p ? { x: p.x, z: -p.z } : e.pos;
            line(
              origin,
              e.bossWeapon.direction,
              w.range,
              w.coneDegrees,
              hexNumber(EVENT.warningColour),
              (e.bossWeapon.startTick + w.windupTicks) / 60,
            );
            transient.at(-1).bossWarning = e.id;
          }
      bossFlame?.update(game, { paused });
      salamanderFlame.update(game, { paused });
      flameEffect?.update(game, { paused });
      droneLasers.sync(game.bolts, game.time);
      if (!paused) arcBolts?.update(game.time, Math.max(0, game.time - arcClock));
      arcClock = game.time;
      sync(game.loot, loot, gem, (l) => lootMaterials[l.kind], FEEL.loot.height);
    },
    reset() {
      flameEffect?.reset();
      bossFlame?.reset();
      salamanderFlame.reset();
      clearFinisherBursts();
      this.clearPistolFeedback();
      shots.length = 0;
      pickup.visible = reticle.visible = false;
      for (const e of transient) erase(e);
      transient.length = 0;
      droneLasers.reset();
      arcBolts?.reset();
      for (const map of [loot]) {
        for (const mesh of map.values()) scene.remove(mesh);
        map.clear();
      }
    },
    dispose() {
      this.reset();
      severBlood.dispose();
      flameEffect?.dispose();
      bossFlame?.dispose();
      salamanderFlame.dispose();
      finisherGate.dispose();
      delete pool.userData.finisherImpact;
      scene.remove(pickup, reticle);
      for (const contour of pickupContours) contour.dispose();
      pickupMarker.dispose();
      outlineGeometry.dispose();
      cueGeometry.dispose();
      accentGeometry.dispose();
      outlineMaterial.dispose();
      cueMaterial.dispose();
      accentMaterial.dispose();
      particleMesh.dispose();
      unit.dispose();
      particleMaterial.dispose();
      muzzleFlash.material.dispose();
      for (const t of tracers) {
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
      }
      scene.remove(pool);
      droneLasers.dispose();
      arcBolts?.dispose();
      gem.dispose();
      for (const m of lootMaterials) m.dispose();
    },
  };
}
// Small local cues: start audio only on the player's Enter/Resume gesture.
export function createAudio(options = {}) {
  if (options.donor) return createDonorAudio(options);
  let context = null,
    enabled = true;
  return {
    async unlock() {
      requestPlaybackAudioSession();
      context ??= new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
    },
    setEnabled(value) {
      enabled = value;
    },
    pause() {
      if (context?.state === "running") context.suspend();
    },
    play(events) {
      if (!enabled || context?.state !== "running") return;
      for (const e of events) {
        const tone = FEEL.audio,
          frequency = tone.frequencies[e.type];
        if (!frequency) continue;
        const oscillator = context.createOscillator(),
          gain = context.createGain(),
          start = context.currentTime,
          duration = e.type === "death" ? tone.seconds.death : tone.seconds.other;
        oscillator.type = tone.sineEvents.includes(e.type) ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(tone.minFrequency, frequency * tone.rampShare),
          start + duration,
        );
        gain.gain.setValueAtTime(tone.gain, start);
        gain.gain.exponentialRampToValueAtTime(tone.gainEnd, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    },
  };
}
