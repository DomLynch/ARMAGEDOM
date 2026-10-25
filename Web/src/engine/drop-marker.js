import * as T from "three";
import { GAME_DATA } from "./game-data.js";

// The ground marker on every unclaimed weapon or reward drop, so a drop is easy to see: a pulsing gold ring (the same gold as the hub
// storage entrance ring in route guidance), a short floating label, and a gentle pulse of the drop itself. Styling is
// Web/src/data/visual.json `dropMarker`. It lives in the drop's own group, so it is gone with the drop on pickup.
const STYLE = GAME_DATA.visual.dropMarker;
// Same slow fade in and out as the route arrow: opacity from minOpacity up to 1 and back every pulseSeconds.
export const dropPulse = (seconds, style = STYLE) =>
  style.minOpacity + (1 - style.minOpacity) * (0.5 + 0.5 * Math.cos((2 * Math.PI * seconds) / style.pulseSeconds));

function labelSprite(text, style) {
  if (typeof globalThis.document?.createElement !== "function") return null; // no page (tests, workers): the ring alone
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 64;
  const ctx = canvas.getContext?.("2d");
  // Only fillRect and fillText are used (the border is four filled bars), so a minimal 2D context is enough.
  if (typeof ctx?.fillRect !== "function" || typeof ctx.fillText !== "function") return null;
  ctx.fillStyle = `#${style.labelBacking}`;
  ctx.globalAlpha = style.labelBackingOpacity;
  ctx.fillRect(0, 0, 384, 64);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `#${style.ringColour}`;
  for (const [x, y, w, h] of [
    [0, 0, 384, 3],
    [0, 61, 384, 3],
    [0, 0, 3, 64],
    [381, 0, 3, 64],
  ])
    ctx.fillRect(x, y, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `#${style.labelColour}`;
  ctx.font = "600 30px sans-serif";
  ctx.fillText(text, 192, 34, 360);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.renderOrder = 10; // drawn over the player and the drop, so the name is never clipped by a body standing on it
  sprite.scale.set(style.labelWidth, style.labelWidth / 6, 1);
  sprite.position.y = style.labelHeight;
  return sprite;
}

// A soft glow around and just inside the band: a radial gradient that is clear in the middle (the drop stays visible), warm at
// the band and fades out to glowOuter.
function glowMesh(style) {
  if (typeof globalThis.document?.createElement !== "function") return null;
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext?.("2d");
  if (typeof ctx?.createRadialGradient !== "function" || typeof ctx.fillRect !== "function") return null;
  const inner = style.ringInner / style.glowOuter,
    outer = style.ringOuter / style.glowOuter,
    rgb = new T.Color(`#${style.ringColour}`).toArray().map((c) => Math.round(c * 255)),
    gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, alpha] of [
    [0, 0],
    [inner * 0.8, 0.05],
    [inner, 0.45],
    [(inner + outer) / 2, 0.6],
    [outer, 0.45],
    [Math.min(1, outer + (1 - outer) * 0.35), 0.18],
    [1, 0],
  ])
    gradient.addColorStop(at, `rgba(${rgb.join(",")},${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const glow = new T.Mesh(
    new T.PlaneGeometry(style.glowOuter * 2, style.glowOuter * 2),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  return glow;
}

// The marker's band as a flat geometry in the XY plane (the ring mesh lies it on the ground). "circle" is a round band; the others are
// built from rectangles of the band's width on a square of half-width ringOuter, laid along the world axes: "square" a full outline,
// "brackets" only the four corners (each arm bracketArm of a side long), "diamond" the square turned 45 degrees.
export function markerGeometry(style) {
  if (style.shape === "circle") return new T.RingGeometry(style.ringInner, style.ringOuter, 48);
  const o = style.ringOuter,
    i = style.ringInner,
    arm = o - 2 * o * style.bracketArm,
    rects = [];
  if (style.shape === "brackets")
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        rects.push([sx * arm, sx * o, sy * i, sy * o]); // the arm along the horizontal edge, corner square included
        rects.push([sx * i, sx * o, sy * arm, sy * i]); // the arm along the vertical edge, corner square left out
      }
  else rects.push([-o, o, i, o], [-o, o, -o, -i], [-o, -i, -i, i], [i, o, -i, i]);
  const positions = [];
  for (const [x0, x1, y0, y1] of rects)
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  if (style.shape === "diamond") geometry.rotateZ(Math.PI / 4);
  return geometry;
}

export function createDropMarker(label, style = STYLE) {
  const group = new T.Group(),
    glow = glowMesh(style),
    ring = new T.Mesh(
      markerGeometry(style),
      new T.MeshBasicMaterial({
        color: new T.Color(`#${style.ringColour}`),
        side: T.DoubleSide,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
    sprite = labelSprite(String(label).toUpperCase(), style);
  group.name = "Drop marker";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  if (glow) group.add(glow);
  group.add(ring);
  if (sprite) group.add(sprite);
  // Animated from the render of the ring itself: no view needs a per-frame call. The ring and its glow swell by ringPulse and
  // fade with the pulse; the parent (the drop's root) is scaled a few per cent in step, which is the pulse of the item, and the
  // marker group takes that scale back off so the ring and label keep their own size.
  ring.onBeforeRender = () => {
    const p = dropPulse(globalThis.performance?.now?.() / 1000 || 0, style),
      swell = 1 + style.ringPulse * ((p - style.minOpacity) / (1 - style.minOpacity)),
      item = 1 + style.itemPulse * (p - 0.5);
    ring.material.opacity = style.peakOpacity * p;
    ring.scale.setScalar(swell);
    if (glow) {
      glow.material.opacity = style.glowOpacity * p;
      glow.scale.setScalar(swell);
    }
    if (sprite) sprite.material.opacity = 0.75 + 0.25 * p;
    if (group.parent) {
      group.parent.scale.setScalar(item);
      group.scale.setScalar(1 / item);
    }
  };
  let disposed = false;
  return {
    group,
    ring,
    sprite,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      ring.geometry.dispose();
      ring.material.dispose();
      glow?.geometry.dispose();
      glow?.material.map?.dispose();
      glow?.material.dispose();
      sprite?.material.map?.dispose();
      sprite?.material.dispose();
    },
  };
}

// A drop with no model yet (its asset is still loading): only the ring and the label, so a slow phone still shows where it is.
export function createMarkerOnlyDrop(label) {
  const root = new T.Group();
  root.name = "Drop marker (model loading)";
  return markDrop({ root, dispose: () => root.removeFromParent() }, label);
}

// Puts a marker on a drop view ({ root, dispose }) and makes its dispose take the marker down too.
export function markDrop(view, label) {
  const marker = createDropMarker(label),
    dispose = view.dispose;
  view.root.add(marker.group);
  view.marker = marker;
  view.dispose = () => {
    marker.dispose();
    dispose.call(view);
  };
  return view;
}
