import * as T from "three";
import { GAME_DATA } from "./game-data.js";
import { createHeatTallyHud } from "./heat-tally-hud.js";
import { drawTally } from "./heat-tally-draw.js";

// The heat tally above the player (look in data/heat.json): groups of `groupSize`, the last of each full group a strike through the
// others, drawn as dark red claw gouges on a canvas and shown as a camera-facing sprite.
const HEAT = GAME_DATA.heat;

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
export function createHeatTallyView(scene, placement = HEAT.look.placement) {
  if (typeof globalThis.document?.createElement !== "function") return null;
  if (placement === "hud") return createHeatTallyHud();
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
