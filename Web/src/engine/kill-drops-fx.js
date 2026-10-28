// The light around a coin drop (data/killDrops.json `looks.<name>.fx.<tier>`): a soft glow pool on the floor, a vertical light shaft, glints that twinkle
// where the coins catch the light, and sparkles that burst up and fade. Every size, colour and rate is a data row; this file only places the sprites
// and moves them with the game clock. Textures are drawn once per stage from `fxStyle` and shared by every drop.
const TAU = Math.PI * 2;

export function createDropFxKit(THREE, style) {
  const textures = new Map();
  const canvas = (draw) => {
    const c = document.createElement("canvas");
    c.width = c.height = style.textureSize;
    draw(c.getContext("2d"), style.textureSize);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const cached = (key, make) => {
    if (!textures.has(key)) textures.set(key, make());
    return textures.get(key);
  };
  const pool = (ringAt) =>
    cached(`pool${ringAt}`, () =>
      canvas((ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        for (const [stop, alpha] of style.poolStops) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        if (ringAt > 0) {
          ctx.strokeStyle = `rgba(255,255,255,${style.ringAlpha})`;
          ctx.lineWidth = style.ringWidth;
          ctx.beginPath();
          ctx.arc(s / 2, s / 2, (s / 2) * ringAt, 0, TAU);
          ctx.stroke();
        }
      }),
    );
  const star = () =>
    cached("star", () =>
      canvas((ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * style.starCore);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        const arm = s * style.starArm;
        ctx.fillRect((s - arm) / 2, (s - style.starWidth) / 2, arm, style.starWidth);
        ctx.fillRect((s - style.starWidth) / 2, (s - arm) / 2, style.starWidth, arm);
      }),
    );
  const fade = () =>
    cached("fade", () =>
      canvas((ctx, s) => {
        const g = ctx.createLinearGradient(0, s, 0, 0);
        for (const [stop, alpha] of style.beamStops) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      }),
    );
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
  const hash = (id, k) => {
    const x = Math.sin(id * style.hashA + k * style.hashB) * style.hashC;
    return x - Math.floor(x);
  };
  return {
    // One drop's light, as a group the view moves with the coins. update(clock) animates it; the group owns no per-drop textures.
    build(fx, id) {
      const group = new THREE.Group(),
        moving = [],
        own = [],
        material = (m) => {
          own.push(m);
          return m;
        };
      if (fx.pool) {
        const p = fx.pool,
          mat = material(new THREE.MeshBasicMaterial({ map: pool(p.ringAt ?? 0), color: `#${p.colour}`, opacity: p.opacity, ...additive })),
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.radius * 2, p.radius * 2), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = style.floorLift;
        mesh.renderOrder = style.renderOrder;
        group.add(mesh);
        moving.push((t) => {
          mat.opacity = p.opacity * (1 - p.pulse + p.pulse * (0.5 + 0.5 * Math.sin(t * p.hz * TAU + id)));
        });
      }
      if (fx.beam) {
        const b = fx.beam,
          mat = material(new THREE.MeshBasicMaterial({ map: fade(), color: `#${b.colour}`, opacity: b.opacity, side: THREE.DoubleSide, ...additive })),
          geometry = new THREE.CylinderGeometry(b.radius * b.taper, b.radius, b.height, style.beamSegments, 1, true);
        geometry.translate(0, b.height / 2, 0);
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.renderOrder = style.renderOrder;
        group.add(mesh);
        own.push(geometry);
      }
      if (fx.glint) {
        const gl = fx.glint,
          sprites = [];
        for (let i = 0; i < gl.count; i++) {
          const a = hash(id, i) * TAU,
            r = Math.sqrt(hash(id, i + style.seedStep)) * gl.radius,
            mat = material(new THREE.SpriteMaterial({ map: star(), color: `#${gl.colour}`, ...additive })),
            s = new THREE.Sprite(mat);
          s.position.set(Math.cos(a) * r, gl.height * (style.heightLow + hash(id, i + style.seedStep * 2)), Math.sin(a) * r);
          s.renderOrder = style.renderOrder + 1;
          group.add(s);
          sprites.push({ s, phase: hash(id, i + style.seedStep * 3) * TAU, rate: gl.hz * (1 + hash(id, i + style.seedStep * 4)) });
        }
        moving.push((t) => {
          for (const k of sprites) {
            const wave = Math.max(0, Math.sin(t * k.rate * TAU + k.phase));
            k.s.scale.setScalar(gl.size * Math.pow(wave, gl.sharpness) + style.minScale);
          }
        });
      }
      if (fx.burst) {
        const bu = fx.burst,
          sprites = [];
        for (let i = 0; i < bu.count; i++) {
          const a = hash(id, i + style.seedStep * 5) * TAU,
            mat = material(new THREE.SpriteMaterial({ map: star(), color: `#${bu.colour}`, ...additive })),
            s = new THREE.Sprite(mat);
          s.renderOrder = style.renderOrder + 1;
          group.add(s);
          sprites.push({ s, dx: Math.cos(a), dz: Math.sin(a), lag: i / bu.count, lift: 1 + hash(id, i + style.seedStep * 6) });
        }
        moving.push((t) => {
          for (const k of sprites) {
            const u = (t / bu.period + k.lag) % 1;
            k.s.position.set(k.dx * bu.spread * u, bu.base + bu.rise * k.lift * Math.sin(u * Math.PI * style.burstArc), k.dz * bu.spread * u);
            k.s.scale.setScalar(bu.size * (1 - u) + style.minScale);
          }
        });
      }
      return { group, update: (t) => moving.forEach((f) => f(t)), dispose: () => own.forEach((d) => d.dispose()) };
    },
    dispose() {
      for (const t of textures.values()) t.dispose();
      textures.clear();
    },
  };
}
