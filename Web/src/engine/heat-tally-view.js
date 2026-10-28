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

// Paint `count` slots in groups; the newest slot takes `lastAlpha`.
export function drawTally(ctx, count, lastAlpha) {
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
      const alpha = g * size + slot.index === count - 1 ? lastAlpha : 1;
      for (const spec of slot.gouges) {
        const core = { ...spec, widthPx: spec.widthPx * look.mark.coreShare, edgeJitterPx: spec.edgeJitterPx * look.mark.coreShare };
        drawGouge(ctx, gougeOutline(slot.rand, spec), gougeOutline(seeded(HEAT.seed + slot.index), core), alpha);
      }
    }
    ctx.restore();
  }
}

export function createHeatTallyView(scene) {
  if (typeof globalThis.document?.createElement !== "function") return null;
  let key = null,
    sprite = null;
  const dispose = () => {
    if (!sprite) return;
    scene.remove(sprite);
    sprite.material.map.dispose();
    sprite.material.dispose();
    sprite = null;
    key = null;
  };
  return {
    // shown: { count, lastAlpha } or null; position: the render-space point above the player's head.
    update(shown, position) {
      if (!shown || !shown.count) return dispose();
      const w = HEAT.world,
        groups = Math.min(w.maxGroups, Math.ceil(shown.count / HEAT.groupSize)),
        count = Math.min(shown.count, groups * HEAT.groupSize),
        next = `${count}:${Math.round(shown.lastAlpha * 100)}`; // whole percent steps are enough to repaint a fade
      if (next !== key) {
        dispose();
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = groups * w.canvasPxPerGroup;
        canvas.height = w.canvasHeightPx;
        drawTally(canvas.getContext("2d"), count, shown.lastAlpha);
        const map = new T.CanvasTexture(canvas);
        map.colorSpace = T.SRGBColorSpace;
        sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
        sprite.renderOrder = w.renderOrder;
        const perPx = w.widthMetresPerGroup / w.canvasPxPerGroup;
        sprite.scale.set(canvas.width * perPx, canvas.height * perPx, 1);
        scene.add(sprite);
        key = next;
      }
      sprite.position.copy(position);
    },
    dispose,
  };
}
