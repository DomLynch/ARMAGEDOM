import * as T from "three";
import { GAME_DATA } from "./game-data.js";
import { gougeOutline, groupSlots, seeded } from "./heat-tally-strokes.js";

// The heat tally above the player (look in data/heat.json): groups of `groupSize`, the last of each full group a strike through the
// others, drawn as burnt-amber claw gouges on a canvas and shown as a camera-facing sprite.
const HEAT = GAME_DATA.heat;

function trace(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// One gouge: soft glow, body, hot core, dark torn edge.
function drawGouge(ctx, outline, core, alpha) {
  const c = HEAT.look.colours;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = `#${c.glow}`;
  ctx.shadowBlur = c.glowBlurPx;
  ctx.fillStyle = `#${c.fill}`;
  trace(ctx, outline);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = `#${c.core}`;
  trace(ctx, core);
  ctx.fill();
  ctx.strokeStyle = `#${c.edge}`;
  ctx.lineWidth = HEAT.look.mark.edgeLinePx;
  ctx.lineJoin = "round";
  trace(ctx, outline);
  ctx.stroke();
  ctx.restore();
}

// Paint the tally on its canvas. part "rest" draws every slot but the newest; part "newest" draws only the newest, so the fade needs no
// repaint: the newest slot sits in its own sprite whose material opacity does the dimming.
function drawTally(ctx, count, part) {
  const w = HEAT.world,
    size = HEAT.groupSize,
    look = HEAT.look,
    groups = Math.ceil(count / size);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let g = 0; g < groups; g++) {
    ctx.save();
    ctx.translate((g + look.centre) * w.canvasPxPerGroup, w.canvasHeightPx * look.centre); // the middle of this group's cell
    const slots = groupSlots(look, size, Math.min(size, count - g * size), (i) => seeded(HEAT.seed + (g * size + i) * HEAT.rng.stride));
    for (const slot of slots) {
      if ((g * size + slot.index === count - 1) !== (part === "newest")) continue;
      for (const spec of slot.gouges) {
        const core = { ...spec, widthPx: spec.widthPx * look.mark.coreShare, edgeJitterPx: spec.edgeJitterPx * look.mark.coreShare };
        drawGouge(ctx, gougeOutline(slot.rand, spec), gougeOutline(seeded(HEAT.seed + slot.index), core), 1);
      }
    }
    ctx.restore();
  }
}

function makeSprite(scene, count, groups, part) {
  const w = HEAT.world,
    canvas = globalThis.document.createElement("canvas");
  canvas.width = groups * w.canvasPxPerGroup;
  canvas.height = w.canvasHeightPx;
  drawTally(canvas.getContext("2d"), count, part);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.renderOrder = w.renderOrder;
  const perPx = w.widthMetresPerGroup / w.canvasPxPerGroup;
  sprite.scale.set(canvas.width * perPx, canvas.height * perPx, 1);
  scene.add(sprite);
  return sprite;
}

// Two textures per count (the settled marks, and the newest mark); a fade only changes the newest sprite's opacity, never builds a texture.
export function createHeatTallyView(scene) {
  if (typeof globalThis.document?.createElement !== "function") return null;
  let key = null,
    sprites = [];
  const dispose = () => {
    for (const sprite of sprites) {
      scene.remove(sprite);
      sprite.material.map.dispose();
      sprite.material.dispose();
    }
    sprites = [];
    key = null;
  };
  return {
    // shown: { count, lastAlpha } or null; position: the render-space point above the player's head.
    update(shown, position) {
      if (!shown || !shown.count) return dispose();
      const groups = Math.min(HEAT.world.maxGroups, Math.ceil(shown.count / HEAT.groupSize)),
        count = Math.min(shown.count, groups * HEAT.groupSize);
      if (count !== key) {
        dispose();
        sprites = [makeSprite(scene, count, groups, "rest"), makeSprite(scene, count, groups, "newest")];
        key = count;
      }
      sprites[1].material.opacity = shown.lastAlpha;
      for (const sprite of sprites) sprite.position.copy(position);
    },
    dispose,
  };
}
