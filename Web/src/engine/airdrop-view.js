import * as T from "three";
import { GAME_DATA } from "./game-data.js";

// The airdrop on screen (state: engine/airdrop.js `g.airdrop`; styling: data/airdrop.json `view`). Built once when the first plane is
// called, shared geometry and materials, nothing allocated per frame. The plane is a flat dark silhouette sliding across the ground (its
// shadow), the crate falls under a canopy and lands, and a thin column of soft red puffs rises from it over a pulsing glow on the ground
// until the crate is opened or lost.
const QUARTER = Math.acos(0),
  basic = (colour, extra = {}) => new T.MeshBasicMaterial({ color: `#${colour}`, toneMapped: false, ...extra });

// A soft round dot, white in the middle fading to clear: tinted by the material colour. Null where there is no page to draw on.
function softDot(pixels) {
  const canvas = globalThis.document?.createElement?.("canvas"),
    ctx = canvas?.getContext?.("2d");
  if (typeof ctx?.createRadialGradient !== "function") return null;
  canvas.width = canvas.height = pixels;
  const middle = pixels / (1 + 1),
    gradient = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, pixels, pixels);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}

export function createAirdropView(scene, toRender) {
  const style = GAME_DATA.airdrop.view,
    plane = GAME_DATA.airdrop.plane,
    fall = GAME_DATA.airdrop.crate.fallSeconds,
    root = new T.Group(),
    flat = (geometry) => geometry.rotateX(-QUARTER),
    ghost = (colour, opacity, extra = {}) =>
      basic(colour, { transparent: true, opacity, depthWrite: false, side: T.DoubleSide, ...extra }),
    dot = softDot(style.texturePx),
    shadowMaterial = ghost(style.shadowColour, style.shadowOpacity),
    glowMaterial = ghost(style.flareColour, style.flareGlowOpacity, { map: dot }),
    puffMaterial = new T.SpriteMaterial({
      color: `#${style.flareColour}`,
      map: dot,
      transparent: true,
      depthWrite: false,
      opacity: style.flareOpacity,
      toneMapped: false,
    }),
    geometries = [
      flat(new T.PlaneGeometry(style.shadowLength, style.shadowWidth * style.shadowBodyShare)),
      flat(new T.PlaneGeometry(style.shadowLength * style.shadowWingChord, style.shadowWidth)),
      new T.BoxGeometry(style.crateSize, style.crateSize, style.crateSize),
      new T.BoxGeometry(style.crateSize, style.crateSize * style.crateTrimShare, style.crateSize),
      new T.ConeGeometry(style.canopyRadius, style.canopyHeight, style.segments),
      flat(new T.PlaneGeometry(style.flareGlowRadius + style.flareGlowRadius, style.flareGlowRadius + style.flareGlowRadius)),
    ],
    [bodyShape, wingShape, crateBox, trimBox, canopyCone, glowPlane] = geometries,
    shadow = new T.Group(),
    crate = new T.Group(),
    body = new T.Mesh(crateBox, basic(style.crateColour)),
    trim = new T.Mesh(trimBox, basic(style.crateTrimColour)),
    canopy = new T.Mesh(canopyCone, basic(style.canopyColour)),
    flare = new T.Group(),
    glow = new T.Mesh(glowPlane, glowMaterial),
    // The hold-out's circle on the ground: as wide as the hold itself (extraction.holdRadius), bright while the player stands in it.
    EXTRACTION = GAME_DATA.apocalypseRun.extraction,
    ringStyle = EXTRACTION.view.ring,
    ringMaterial = ghost(ringStyle.colour, ringStyle.opacity),
    ringGeometry = flat(new T.RingGeometry(EXTRACTION.holdRadius - ringStyle.width, EXTRACTION.holdRadius, ringStyle.segments)),
    ring = new T.Mesh(ringGeometry, ringMaterial),
    // One material per puff: each fades on its own as it rises.
    puffs = Array.from({ length: style.flarePuffs }, () => new T.Sprite(puffMaterial.clone())),
    materials = [shadowMaterial, glowMaterial, ringMaterial, puffMaterial, body.material, trim.material, canopy.material, ...puffs.map((p) => p.material)];
  shadow.add(new T.Mesh(bodyShape, shadowMaterial), new T.Mesh(wingShape, shadowMaterial));
  canopy.position.y = style.crateSize + style.canopyHeight; // the canopy rides above the crate on its cords
  crate.add(body, trim, canopy);
  flare.add(...puffs);
  root.name = "airdrop";
  root.add(shadow, crate, flare, glow, ring);
  root.visible = false;
  scene.add(root);
  const place = (object, point, height) => object.position.copy(toRender(point, height)),
    size = style.flareRadius + style.flareRadius;
  let disposed = false;
  return {
    root,
    // Called every frame with the game: shows whatever `g.airdrop` says is in the air or on the ground.
    update(g) {
      // The run's hold-out (engine/apocalypse-run.js `g.run.hold`) borrows the flare and glow: they stand at the hold, while the plane and
      // the crate of a real airdrop in the same area stay as they are (the crate keeps its place and stays openable).
      const hold = g.run?.hold,
        beacon = hold && hold.areaId === g.world?.areaId ? hold : null,
        a = g.airdrop,
        flying = !!a && a.startAt !== undefined && g.time - a.startAt < plane.seconds,
        dropped = !!a && (a.phase === "falling" || a.phase === "landed");
      root.visible = flying || dropped || !!beacon;
      shadow.visible = flying;
      flare.visible = glow.visible = dropped || !!beacon;
      ring.visible = !!beacon;
      crate.visible = dropped;
      if (!root.visible) return;
      if (flying) {
        const t = (g.time - a.startAt) / plane.seconds;
        place(shadow, { x: a.from.x + (a.to.x - a.from.x) * t, z: a.from.z + (a.to.z - a.from.z) * t }, style.groundLift);
        shadow.rotation.y = Math.atan2(a.to.z - a.from.z, a.to.x - a.from.x);
      }
      if (!dropped && !beacon) return;
      const falling = dropped && a.phase === "falling",
        left = falling ? Math.max(0, (a.landAt - g.time) / fall) : 0,
        sway = Math.sin(g.time * style.swayRate) * style.flareSway * left,
        marker = beacon ? beacon.at : a.crate;
      if (dropped) {
        place(crate, a.crate, style.crateLift + style.dropHeight * left);
        crate.position.x += sway;
        canopy.visible = falling;
      }
      place(flare, marker, style.crateLift + (beacon ? 0 : style.dropHeight * left));
      if (!beacon) flare.position.x += sway;
      place(glow, marker, style.groundLift);
      if (beacon) {
        place(ring, marker, style.groundLift);
        const inside = Math.hypot(g.player.pos.x - marker.x, g.player.pos.z - marker.z) <= EXTRACTION.holdRadius;
        ringMaterial.opacity = ringStyle.opacity * (inside ? 1 : ringStyle.outsideShare);
      }
      const beat = Math.cos((g.time * Math.PI) / style.pulseSeconds);
      glowMaterial.opacity = style.flareGlowOpacity * beat * beat;
      puffs.forEach((puff, i) => {
        const rise = (g.time / style.flareRiseSeconds + i / puffs.length) % 1,
          wobble = Math.sin(g.time * style.swayRate + i) * style.flareSway * rise;
        puff.position.set(wobble, rise * style.flareHeight, 0);
        puff.scale.setScalar(size * (1 + rise * style.flareGrow));
        puff.material.opacity = style.flareOpacity + (style.flareTopOpacity - style.flareOpacity) * rise;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geometry of [...geometries, ringGeometry]) geometry.dispose();
      for (const material of materials) material.dispose();
      dot?.dispose();
    },
  };
}
