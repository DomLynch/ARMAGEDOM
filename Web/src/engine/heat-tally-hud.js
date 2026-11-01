import { GAME_DATA } from "./game-data.js";
import { drawTally } from "./heat-tally-view.js";

// The heat tally as a screen overlay in the top right corner, below the menu button (layout in data/heat.json `hud`). The same gouges as
// the world sprite, on two stacked canvases: the settled marks, and the newest mark whose CSS opacity does the fade (no repaint).
const HEAT = GAME_DATA.heat;

function makeCanvas(root, count, groups, part) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = groups * HEAT.world.canvasPxPerGroup;
  canvas.height = HEAT.world.canvasHeightPx;
  drawTally(canvas.getContext("2d"), count, part);
  root.appendChild(canvas);
  return canvas;
}

export function createHeatTallyHud() {
  const h = HEAT.hud,
    w = HEAT.world,
    root = globalThis.document.createElement("div");
  root.id = "heat-tally";
  root.setAttribute("aria-hidden", "true");
  root.style.top = `calc(var(--safe-t) + ${h.topOffsetPx}px)`;
  root.style.right = `calc(var(--safe-r) + ${h.rightOffsetPx}px)`;
  root.style.zIndex = String(h.zIndex);
  root.hidden = true;
  (globalThis.document.getElementById?.("hud") ?? globalThis.document.body)?.appendChild(root);
  let key = null,
    newest = null;
  const clear = () => {
    root.replaceChildren?.();
    root.hidden = true;
    newest = null;
    key = null;
  };
  return {
    update(shown) {
      if (!shown || !shown.count) return clear();
      const groups = Math.min(w.maxGroups, Math.ceil(shown.count / HEAT.groupSize)),
        count = Math.min(shown.count, groups * HEAT.groupSize);
      if (count !== key) {
        clear();
        makeCanvas(root, count, groups, "rest");
        newest = makeCanvas(root, count, groups, "newest");
        root.style.width = `${groups * h.widthPxPerGroup}px`;
        root.style.height = `${(groups * h.widthPxPerGroup * w.canvasHeightPx) / (groups * w.canvasPxPerGroup)}px`;
        root.hidden = false;
        key = count;
      }
      newest.style.opacity = String(shown.lastAlpha);
    },
    dispose() {
      clear();
      root.remove?.();
    },
  };
}
