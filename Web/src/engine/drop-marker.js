import * as T from "three";
import { GAME_DATA } from "./game-data.js";

// The ground marker on every unclaimed weapon or reward drop, so a drop is easy to see: a pulsing gold ring (the same gold as the hub
// storage entrance ring in route guidance), a short floating label, and a gentle pulse of the drop itself. Styling is
// Web/src/data/visual.json `dropMarker`. It lives in the drop's own group, so it is gone with the drop on pickup.
const STYLE = GAME_DATA.visual.dropMarker;
// Same slow fade in and out as the route arrow: opacity from minOpacity up to 1 and back every pulseSeconds.
const wave = (seconds, period) => 0.5 + 0.5 * Math.cos((2 * Math.PI * seconds) / period); // tuning-ok: a raised cosine, 0 to 1, one turn per period
export const dropPulse = (seconds, style = STYLE) =>
  style.minOpacity + (1 - style.minOpacity) * wave(seconds, style.pulseSeconds);

function labelSprite(text, style) {
  if (typeof globalThis.document?.createElement !== "function") return null; // no page (tests, workers): the ring alone
  const { canvasWidth: W, canvasHeight: H, textY, textMaxWidth, borderPx: B, renderOrder } = style.label,
    canvas = globalThis.document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext?.("2d");
  // Only fillRect and fillText are used (the border is four filled bars), so a minimal 2D context is enough.
  if (typeof ctx?.fillRect !== "function" || typeof ctx.fillText !== "function") return null;
  ctx.fillStyle = `#${style.labelBacking}`;
  ctx.globalAlpha = style.labelBackingOpacity;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `#${style.ringColour}`;
  for (const [x, y, w, h] of [
    [0, 0, W, B],
    [0, H - B, W, B],
    [0, 0, B, H],
    [W - B, 0, B, H],
  ])
    ctx.fillRect(x, y, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `#${style.labelColour}`;
  ctx.font = "600 30px sans-serif";
  ctx.fillText(text, W / 2, textY, textMaxWidth); // tuning-ok: the text is centred on the canvas
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.renderOrder = renderOrder; // drawn over the player and the drop, so the name is never clipped by a body standing on it
  sprite.scale.set(style.labelWidth, style.labelWidth / (W / H), 1); // the sprite keeps the canvas aspect ratio
  sprite.position.y = style.labelHeight;
  return sprite;
}

// A soft glow around and just inside the band: a radial gradient that is clear in the middle (the drop stays visible), warm at
// the band and fades out to glowOuter.
function glowMesh(style) {
  if (typeof globalThis.document?.createElement !== "function") return null;
  const G = style.glow,
    canvas = globalThis.document.createElement("canvas");
  canvas.width = canvas.height = G.canvasPx;
  const ctx = canvas.getContext?.("2d");
  if (typeof ctx?.createRadialGradient !== "function" || typeof ctx.fillRect !== "function") return null;
  const inner = style.ringInner / style.glowOuter,
    outer = style.ringOuter / style.glowOuter,
    rgb = new T.Color(`#${style.ringColour}`).toArray().map((c) => Math.round(c * 255)),
    middle = G.canvasPx / 2, // tuning-ok: the gradient is centred on the canvas
    gradient = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
  for (const [at, alpha] of [
    [0, 0],
    [inner * G.clearShare, G.clearAlpha],
    [inner, G.innerAlpha],
    [(inner + outer) / 2, G.bandAlpha], // tuning-ok: the middle of the band
    [outer, G.outerAlpha],
    [Math.min(1, outer + (1 - outer) * G.tailShare), G.tailAlpha],
    [1, 0],
  ])
    gradient.addColorStop(at, `rgba(${rgb.join(",")},${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, G.canvasPx, G.canvasPx);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const glow = new T.Mesh(
    new T.PlaneGeometry(style.glowOuter * 2, style.glowOuter * 2), // tuning-ok: a radius is half the plane's side
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2; // tuning-ok: a quarter turn lays the glow flat on the ground
  glow.position.y = G.groundY;
  return glow;
}

// The marker's band as a flat geometry in the XY plane (the ring mesh lies it on the ground). "circle" is a round band; the others are
// built from rectangles of the band's width on a square of half-width ringOuter, laid along the world axes: "square" a full outline,
// "brackets" only the four corners (each arm bracketArm of a side long), "diamond" the square turned 45 degrees.
export function markerGeometry(style) {
  if (style.shape === "circle") return new T.RingGeometry(style.ringInner, style.ringOuter, style.ringSegments);
  const o = style.ringOuter,
    i = style.ringInner,
    arm = o - 2 * o * style.bracketArm, // tuning-ok: a side is two half-widths long
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
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); // tuning-ok: x, y, z per vertex
  if (style.shape === "diamond") geometry.rotateZ(Math.PI / 4); // tuning-ok: an eighth of a turn, 45 degrees
  return geometry;
}

export function createDropMarker(label, style = STYLE) {
  const group = new T.Group(),
    glow = style.shape === "circle" ? glowMesh(style) : null, // the glow is radial: only a round band gets one
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
  group.name = "Drop marker"; // text-ok: scene-graph object name, never shown
  ring.rotation.x = -Math.PI / 2; // tuning-ok: a quarter turn lays the ring flat on the ground
  ring.position.y = style.ringY;
  if (glow) group.add(glow);
  group.add(ring);
  if (sprite) group.add(sprite);
  // Animated from the render of the ring itself: no view needs a per-frame call. The ring and its glow swell by ringPulse and
  // fade with the pulse; the parent (the drop's root) is scaled a few per cent in step, which is the pulse of the item, and the
  // marker group takes that scale back off so the ring and label keep their own size.
  ring.onBeforeRender = () => {
    const p = dropPulse(globalThis.performance?.now?.() / 1000 || 0, style),
      swell = 1 + style.ringPulse * ((p - style.minOpacity) / (1 - style.minOpacity)),
      item = 1 + style.itemPulse * (p - 0.5); // tuning-ok: the item pulse swings about the middle of the fade
    ring.material.opacity = style.peakOpacity * p;
    ring.scale.setScalar(swell);
    if (glow) {
      glow.material.opacity = style.glowOpacity * p;
      glow.scale.setScalar(swell);
    }
    if (sprite) sprite.material.opacity = style.label.opacityBase + style.label.opacitySwing * p;
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
  root.name = "Drop marker (model loading)"; // text-ok: scene-graph object name, never shown
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
