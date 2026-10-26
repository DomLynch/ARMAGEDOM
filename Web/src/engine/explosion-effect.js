import * as T from "three";
import { EXPLOSION as X } from "./explosion-effect-data.js";
// One shared, pooled explosion for the player rocket, the boss rocket and the grenade: a flash, a puffy fireball, sparks, lingering smoke and
// a ground scorch. Three instanced meshes (glow, smoke, scorch), so every blast on screen costs three draw calls in all; each shares one soft
// radial texture made in code. Drawn from game time (`g.time`), so it follows pauses and replays. All numbers: data/visual.json `explosion`.
const fract = (v) => v - Math.floor(v);
const hidden = new T.Matrix4().makeScale(0, 0, 0);
// Per-instance opacity: the instance colour tints, this attribute fades (additive glow and normal-blended smoke both need it).
function withInstanceAlpha(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aAlpha;\nvarying float vAlpha;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = aAlpha;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vAlpha;");
  };
  return material;
}
function softTexture() {
  const size = X.texture.size,
    half = size / 2, // tuning-ok: the centre is half the texture
    pixels = new Uint8Array(size * size * 4); // tuning-ok: four bytes (RGBA) per pixel
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4, // tuning-ok: four bytes (RGBA) per pixel
        r = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half); // tuning-ok: 0.5 = the pixel's centre
      pixels.fill(255, at, at + 3); // tuning-ok: white RGB, alpha is the fourth byte
      pixels[at + 3] = Math.round(Math.max(0, 1 - r) ** X.texture.falloffPower * 255); // tuning-ok: alpha is channel 3
    }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}
function layer(texture, capacity, blending, order) {
  const geometry = new T.PlaneGeometry(1, 1),
    material = withInstanceAlpha(
      new T.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending,
        depthWrite: false,
        toneMapped: false,
        side: T.DoubleSide,
      }),
    ),
    mesh = new T.InstancedMesh(geometry, material, capacity),
    alpha = new T.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("aAlpha", alpha);
  alpha.setUsage(T.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.setColorAt(0, new T.Color());
  mesh.instanceColor.setUsage(T.DynamicDrawUsage);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
  return { mesh, alpha, geometry, material };
}
export function createExplosionEffects(s) {
  const F = X.fireball,
    M = X.smoke,
    P = X.sparks,
    C = X.scorch,
    glowPer = 1 + F.lobes + P.count,
    slots = Array.from({ length: X.maxActive }, () => ({ live: false, start: 0, radius: 0, at: new T.Vector3() })),
    colour = {
      flash: new T.Color(`#${X.flash.colour}`),
      from: new T.Color(`#${F.colourStart}`),
      to: new T.Color(`#${F.colourEnd}`),
      smoke: new T.Color(`#${M.colour}`),
      spark: new T.Color(`#${P.colour}`),
      scorch: new T.Color(`#${C.colour}`),
    },
    pose = new T.Matrix4(),
    scale = new T.Vector3(),
    place = new T.Vector3(),
    tint = new T.Color(),
    flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2), // tuning-ok: quarter turn lays the scorch flat
    identity = new T.Quaternion(),
    lifetime = Math.max(X.flash.seconds, F.seconds, M.delay + M.seconds, P.seconds, C.seconds);
  let layers = null;
  function build() {
    const texture = softTexture(),
      glow = layer(texture, X.maxActive * glowPer, T.AdditiveBlending, X.renderOrder),
      smoke = layer(texture, X.maxActive * M.count, T.NormalBlending, X.renderOrder - 1),
      scorch = layer(texture, X.maxActive, T.NormalBlending, X.renderOrder - 1);
    for (const l of [scorch, smoke, glow]) s.scene.add(l.mesh);
    layers = { texture, glow, smoke, scorch };
  }
  function put(l, index, quaternion, position, diameter, rgb, opacity) {
    pose.compose(position, quaternion, scale.setScalar(diameter));
    l.mesh.setMatrixAt(index, pose);
    l.mesh.setColorAt(index, rgb);
    l.alpha.setX(index, opacity);
  }
  function hide(l, index) {
    l.mesh.setMatrixAt(index, hidden);
    l.alpha.setX(index, 0);
  }
  function drawSlot(index, slot, age, facing) {
    const { glow, smoke, scorch } = layers,
      r = slot.radius,
      base = index * glowPer;
    const flashT = age / X.flash.seconds;
    if (flashT < 1)
      put(glow, base, facing, place.copy(slot.at).setY(slot.at.y + X.flash.lift * r), X.flash.diameterRatio * r * (1 + flashT), colour.flash, 1 - flashT);
    else hide(glow, base);
    const fireT = age / F.seconds,
      grown = 1 - (1 - Math.min(fireT, 1)) ** F.easePower;
    for (let i = 0; i < F.lobes; i++) {
      if (fireT >= 1) {
        hide(glow, base + 1 + i);
        continue;
      }
      const angle = X.goldenAngle * i,
        out = i > 0 ? F.spreadRatio * r : 0, // tuning-ok: the first lobe sits on the blast centre
        diameter = (F.startDiameterRatio + (F.peakDiameterRatio - F.startDiameterRatio) * grown) * r * F.lobeShrink ** i;
      place.set(slot.at.x + Math.cos(angle) * out * grown, slot.at.y + (F.lift + F.liftStep * i) * r * grown, slot.at.z + Math.sin(angle) * out * grown);
      tint.copy(colour.from).lerp(colour.to, fireT);
      put(glow, base + 1 + i, facing, place, diameter, tint, F.opacity * (1 - fireT) ** F.fadePower);
    }
    for (let j = 0; j < P.count; j++) {
      const at = base + 1 + F.lobes + j,
        t = age / P.seconds;
      if (t >= 1) {
        hide(glow, at);
        continue;
      }
      const angle = X.goldenAngle * j,
        pitch = P.elevationMin + (P.elevationMax - P.elevationMin) * fract(j * P.elevationStride),
        speed = P.speedRatio * r * (1 + P.speedStep * fract(j * P.elevationStride)),
        flatSpeed = Math.cos(pitch) * speed;
      place.set(
        slot.at.x + Math.cos(angle) * flatSpeed * age,
        Math.max(slot.at.y, slot.at.y + P.liftRatio * r + Math.sin(pitch) * speed * age - P.gravity * age * age),
        slot.at.z + Math.sin(angle) * flatSpeed * age,
      );
      put(glow, at, facing, place, P.sizeRatio * r * (1 - t), colour.spark, 1 - t);
    }
    for (let k = 0; k < M.count; k++) {
      const puffAge = age - M.delay,
        t = puffAge / M.seconds;
      if (puffAge < 0 || t >= 1) {
        hide(smoke, index * M.count + k);
        continue;
      }
      const angle = X.goldenAngle * k,
        out = M.spreadRatio * r * Math.min(1, puffAge / F.seconds);
      place.set(
        slot.at.x + Math.cos(angle) * out,
        slot.at.y + (F.lift + F.liftStep) * r + M.riseSpeed * puffAge,
        slot.at.z + Math.sin(angle) * out,
      );
      const fadeIn = Math.min(1, puffAge / M.fadeInSeconds);
      put(smoke, index * M.count + k, facing, place, (M.startDiameterRatio + (M.endDiameterRatio - M.startDiameterRatio) * t) * r, colour.smoke, M.opacity * fadeIn * (1 - t));
    }
    const burnT = age / C.seconds;
    if (burnT < 1) {
      place.set(slot.at.x, slot.at.y + X.groundLift, slot.at.z);
      put(scorch, index, flat, place, C.diameterRatio * r, colour.scorch, C.opacity * (1 - Math.max(0, (burnT - C.fadeStart) / (1 - C.fadeStart))));
    } else hide(scorch, index);
  }
  function flush() {
    for (const l of [layers.glow, layers.smoke, layers.scorch]) {
      l.mesh.instanceMatrix.needsUpdate = true;
      l.mesh.instanceColor.needsUpdate = true;
      l.alpha.needsUpdate = true;
    }
  }
  return {
    // `position` is the render-space blast centre (ground level); `radius` the blast radius in metres; `time` the game time it went off.
    spawn(position, radius, time) {
      if (!layers) build();
      const free = slots.find((slot) => !slot.live) ?? slots.reduce((a, b) => (b.start < a.start ? b : a));
      free.live = true;
      free.start = time;
      free.radius = radius;
      free.at.copy(position);
    },
    update(time) {
      if (!layers) return;
      const facing = s.world?.camera?.quaternion ?? identity;
      let drew = false;
      slots.forEach((slot, index) => {
        if (!slot.live) return;
        const age = time - slot.start;
        if (age >= lifetime || age < 0) {
          slot.live = false;
          for (let i = 0; i < glowPer; i++) hide(layers.glow, index * glowPer + i);
          for (let k = 0; k < M.count; k++) hide(layers.smoke, index * M.count + k);
          hide(layers.scorch, index);
        } else drawSlot(index, slot, age, facing);
        drew = true;
      });
      if (drew) flush();
    },
    clear() {
      for (const slot of slots) slot.live = false;
      if (!layers) return;
      for (let i = 0; i < slots.length * glowPer; i++) hide(layers.glow, i);
      for (let i = 0; i < slots.length * M.count; i++) hide(layers.smoke, i);
      for (let i = 0; i < slots.length; i++) hide(layers.scorch, i);
      flush();
    },
    dispose() {
      if (!layers) return;
      for (const l of [layers.glow, layers.smoke, layers.scorch]) {
        l.mesh.removeFromParent();
        l.geometry.dispose();
        l.material.dispose();
        l.mesh.dispose();
      }
      layers.texture.dispose();
      layers = null;
    },
  };
}
