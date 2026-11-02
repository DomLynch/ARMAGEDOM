// The light around a coin drop (data/killDrops.json `looks.<name>.fx.<tier>`, data/worldPickups.json `fx.<kind>`): a soft glow pool on the floor, a
// vertical light shaft, glints that twinkle where the coins catch the light, and sparkles that burst up and fade. Every size, colour and rate is a
// data row; this file only places the sprites and moves them with the game clock. Textures are drawn once per stage from `fxStyle` and shared.
const TAU = (360 * Math.PI) / 180; // a full turn in radians
const HALF = 1 / (1 + 1); // the middle of a canvas, half a turn of the pulse wave
const FLAT = -Math.PI * HALF; // lays the pool plane on the floor

export function createDropFxKit(THREE, style) {
  const textures = new Map();
  const canvas = (draw) => {
    if (!globalThis.document) return null; // a headless test has no canvas: the sprites are then plain colour
    const c = globalThis.document.createElement("canvas");
    c.width = c.height = style.textureSize;
    const ctx = c.getContext("2d");
    if (typeof ctx?.createLinearGradient(0, 0, 0, 0)?.addColorStop !== "function") return null; // a test's stub canvas cannot draw gradients
    draw(ctx, style.textureSize);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const cached = (key, make) => {
    if (!textures.has(key)) textures.set(key, make());
    return textures.get(key);
  };
  const white = (alpha) => `rgba(255,255,255,${alpha})`;
  const pool = (ringAt) =>
    cached(`pool${ringAt}`, () =>
      canvas((ctx, s) => {
        const mid = s * HALF,
          g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
        for (const [stop, alpha] of style.poolStops) g.addColorStop(stop, white(alpha));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        if (ringAt > 0) {
          ctx.strokeStyle = white(style.ringAlpha);
          ctx.lineWidth = style.ringWidth;
          ctx.beginPath();
          ctx.arc(mid, mid, mid * ringAt, 0, TAU);
          ctx.stroke();
        }
      }),
    );
  const star = () =>
    cached("star", () =>
      canvas((ctx, s) => {
        const mid = s * HALF,
          g = ctx.createRadialGradient(mid, mid, 0, mid, mid, s * style.starCore),
          arm = s * style.starArm,
          w = style.starWidth;
        g.addColorStop(0, white(1));
        g.addColorStop(1, white(0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = white(style.starAlpha);
        ctx.fillRect(mid - arm * HALF, mid - w * HALF, arm, w);
        ctx.fillRect(mid - w * HALF, mid - arm * HALF, w, arm);
      }),
    );
  const fade = () =>
    cached("fade", () =>
      canvas((ctx, s) => {
        const g = ctx.createLinearGradient(0, s, 0, 0);
        for (const [stop, alpha] of style.beamStops) g.addColorStop(stop, white(alpha));
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
        own = [];
      let draw = 0;
      const next = () => hash(id, draw++),
        material = (m) => {
          own.push(m);
          return m;
        };
      if (fx.pool) {
        const p = fx.pool,
          mat = material(
            new THREE.MeshBasicMaterial({
              map: pool(p.ringAt ?? 0),
              color: `#${p.colour}`,
              opacity: p.opacity,
              ...additive,
            }),
          ),
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.radius + p.radius, p.radius + p.radius), mat);
        mesh.rotation.x = FLAT;
        mesh.position.y = style.floorLift;
        mesh.renderOrder = style.renderOrder;
        group.add(mesh);
        own.push(mesh.geometry);
        moving.push((t) => {
          mat.opacity = p.opacity * (1 - p.pulse + p.pulse * (HALF + HALF * Math.sin(t * p.hz * TAU + id)));
        });
      }
      if (fx.beam) {
        const b = fx.beam,
          mat = material(
            new THREE.MeshBasicMaterial({
              map: fade(),
              color: `#${b.colour}`,
              opacity: b.opacity,
              side: THREE.DoubleSide,
              ...additive,
            }),
          ),
          geometry = new THREE.CylinderGeometry(b.radius * b.taper, b.radius, b.height, style.beamSegments, 1, true),
          mesh = new THREE.Mesh(geometry, mat);
        geometry.translate(0, b.height * HALF, 0);
        mesh.renderOrder = style.renderOrder;
        group.add(mesh);
        own.push(geometry);
      }
      if (fx.glint) {
        const gl = fx.glint,
          sprites = [];
        for (let i = 0; i < gl.count; i++) {
          const a = next() * TAU,
            r = Math.sqrt(next()) * gl.radius,
            s = new THREE.Sprite(
              material(
                new THREE.SpriteMaterial({ map: star(), color: `#${gl.colour}`, ...additive, opacity: gl.opacity }),
              ),
            );
          s.position.set(Math.cos(a) * r, gl.height * (style.heightLow + next()), Math.sin(a) * r);
          s.renderOrder = style.renderOrder + 1;
          group.add(s);
          sprites.push({ s, phase: next() * TAU, rate: gl.hz * (1 + next()) });
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
          const a = next() * TAU,
            s = new THREE.Sprite(
              material(new THREE.SpriteMaterial({ map: star(), color: `#${bu.colour}`, ...additive })),
            );
          s.renderOrder = style.renderOrder + 1;
          group.add(s);
          sprites.push({ s, dx: Math.cos(a), dz: Math.sin(a), lag: i / bu.count, lift: 1 + next() });
        }
        moving.push((t) => {
          for (const k of sprites) {
            const u = (t / bu.period + k.lag) % 1;
            k.s.position.set(
              k.dx * bu.spread * u,
              bu.base + bu.rise * k.lift * Math.sin(u * Math.PI * style.burstArc),
              k.dz * bu.spread * u,
            );
            k.s.scale.setScalar(bu.size * (1 - u) + style.minScale);
          }
        });
      }
      return { group, update: (t) => moving.forEach((f) => f(t)), dispose: () => own.forEach((d) => d.dispose()) };
    },
    dispose() {
      for (const t of textures.values()) t?.dispose();
      textures.clear();
    },
  };
}
