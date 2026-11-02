import { GAME_DATA } from "./game-data.js";
import { gougeOutline, groupSlots, seeded } from "./heat-tally-strokes.js";

// Paints the heat tally on a canvas (shared by the world sprite and the HUD overlay).
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
export function drawTally(ctx, count, part) {
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
