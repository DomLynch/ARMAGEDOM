import * as T from "three";
import { GAME_DATA } from "./engine/game-data.js";

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
  if (!ctx) return null;
  ctx.fillStyle = "rgba(22,23,20,.88)";
  ctx.fillRect(0, 0, 384, 64);
  ctx.strokeStyle = `#${style.ringColour}`;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 380, 60);
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

export function createDropMarker(label, style = STYLE) {
  const group = new T.Group(),
    ring = new T.Mesh(
      new T.RingGeometry(style.ringInner, style.ringOuter, 48),
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
  group.add(ring);
  if (sprite) group.add(sprite);
  // Animated from the render of the ring itself: no view needs a per-frame call. The parent (the drop's root) is scaled a few
  // per cent in step with the ring, which is the pulse of the item.
  ring.onBeforeRender = () => {
    const p = dropPulse(globalThis.performance?.now?.() / 1000 || 0, style);
    ring.material.opacity = p;
    if (sprite) sprite.material.opacity = 0.7 + 0.3 * p;
    group.parent?.scale.setScalar(1 + style.itemPulse * (p - 0.5));
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
