import * as T from "three";
import { GAME_DATA } from "./game-data.js";

// The airdrop on screen (state: engine/airdrop.js `g.airdrop`; styling: data/airdrop.json `view`). Built once, shared geometry and
// materials, nothing allocated per frame. The plane is a flat dark silhouette sliding across the ground (its shadow), the crate falls
// under a canopy and lands, and a column of red puffs rises from it with a pulsing glow on the ground until it is opened or lost.
const QUARTER = Math.acos(0),
  TURN = Math.PI + Math.PI,
  basic = (colour, extra = {}) => new T.MeshBasicMaterial({ color: `#${colour}`, toneMapped: false, ...extra });

export function createAirdropView(scene, toRender) {
  const style = GAME_DATA.airdrop.view,
    plane = GAME_DATA.airdrop.plane,
    fall = GAME_DATA.airdrop.crate.fallSeconds,
    root = new T.Group(),
    flat = (geometry) => geometry.rotateX(-QUARTER),
    ghost = (colour, opacity) => basic(colour, { transparent: true, opacity, depthWrite: false, side: T.DoubleSide }),
    shadowMaterial = ghost(style.shadowColour, style.shadowOpacity),
    flareMaterial = ghost(style.flareColour, style.flareOpacity),
    glowMaterial = ghost(style.flareColour, style.flareOpacity),
    geometries = [
      flat(new T.PlaneGeometry(style.shadowLength, style.shadowWidth * style.shadowBodyShare)),
      flat(new T.PlaneGeometry(style.shadowLength * style.shadowWingChord, style.shadowWidth)),
      new T.BoxGeometry(style.crateSize, style.crateSize, style.crateSize),
      new T.BoxGeometry(style.crateSize, style.crateSize * style.crateTrimShare, style.crateSize),
      new T.ConeGeometry(style.canopyRadius, style.canopyHeight, style.segments),
      new T.SphereGeometry(style.flareRadius, style.segments, style.segments),
      new T.SphereGeometry(style.flareCoreRadius, style.segments, style.segments),
      flat(new T.CircleGeometry(style.flareGlowRadius, style.segments + style.segments)),
    ],
    [bodyShape, wingShape, crateBox, trimBox, canopyCone, puffBall, coreBall, glowDisc] = geometries,
    shadow = new T.Group(),
    crate = new T.Group(),
    canopy = new T.Mesh(canopyCone, basic(style.canopyColour)),
    flare = new T.Group(),
    glow = new T.Mesh(glowDisc, glowMaterial),
    puffs = Array.from({ length: style.flarePuffs }, () => new T.Mesh(puffBall, flareMaterial)),
    materials = [shadowMaterial, flareMaterial, glowMaterial, canopy.material];
  shadow.add(new T.Mesh(bodyShape, shadowMaterial), new T.Mesh(wingShape, shadowMaterial));
  const body = new T.Mesh(crateBox, basic(style.crateColour)),
    trim = new T.Mesh(trimBox, basic(style.crateTrimColour)),
    core = new T.Mesh(coreBall, basic(style.flareColour));
  materials.push(body.material, trim.material, core.material);
  canopy.position.y = style.crateSize + style.canopyHeight; // the canopy rides above the crate on its cords
  crate.add(body, trim, canopy);
  flare.add(core, ...puffs);
  root.name = "airdrop";
  root.add(shadow, crate, flare, glow);
  root.visible = false;
  scene.add(root);
  const place = (object, point, height) => object.position.copy(toRender(point, height));
  let disposed = false;
  return {
    root,
    // Called every frame with the game: shows whatever `g.airdrop` says is in the air or on the ground.
    update(g) {
      const a = g.airdrop,
        flying = a && g.time - a.startAt < plane.seconds && a.startAt !== undefined,
        dropped = a && (a.phase === "falling" || a.phase === "landed");
      root.visible = !!(flying || dropped);
      shadow.visible = !!flying;
      crate.visible = flare.visible = glow.visible = !!dropped;
      if (!root.visible) return;
      if (flying) {
        const t = (g.time - a.startAt) / plane.seconds;
        place(shadow, { x: a.from.x + (a.to.x - a.from.x) * t, z: a.from.z + (a.to.z - a.from.z) * t }, style.groundLift);
        shadow.rotation.y = Math.atan2(a.to.z - a.from.z, a.to.x - a.from.x);
      }
      if (!dropped) return;
      const falling = a.phase === "falling",
        left = falling ? Math.max(0, (a.landAt - g.time) / fall) : 0,
        sway = Math.sin(g.time * style.swayRate) * style.flareSway * left;
      place(crate, a.crate, style.crateLift + style.dropHeight * left);
      crate.position.x += sway;
      canopy.visible = falling;
      place(flare, a.crate, style.crateLift + style.dropHeight * left);
      flare.position.x += sway;
      place(glow, a.crate, style.groundLift);
      const beat = Math.cos((g.time * Math.PI) / style.pulseSeconds);
      glowMaterial.opacity = style.flareOpacity * beat * beat;
      puffs.forEach((puff, i) => {
        const rise = (g.time / style.flareRiseSeconds + i / puffs.length) % 1;
        puff.position.set(Math.sin(g.time * style.swayRate + i * TURN / puffs.length) * style.flareSway * rise, rise * style.flareHeight, 0);
        puff.scale.setScalar(1 - rise);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
