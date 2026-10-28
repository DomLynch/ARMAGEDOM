// Hub NPC shops (data/shops.json rows): the tap target over each shopkeeper, the proximity gate, and the panel. Tap-to-open: while the
// player stands inside a shop row's radius in the hub, an invisible button covers that NPC (with a small stall tag above it); tapping or
// clicking it opens the panel. Walking out of the radius, leaving the hub, opening the field menu or the off switch closes it again.
// The only thing a trade writes into the run is the signed cash delta of the server's answer (see onCash in browser-session.js).
import { GAME_DATA } from "./game-data.js";
import { hubNpcsOn } from "./hub-npcs.js";
import { createShopController, say, shopsOn } from "./shop-core.js";
import { createShopView } from "./shop-view.js";

const DATA = GAME_DATA.shops;

// The screen box of a body standing at `ground`: feet to head, as pixels of the canvas.
export function bodyBox(world, camera, bounds, ground) {
  const { half, heightUnits, minPx, widthRatio } = DATA.hotspot;
  const at = (height) => {
    const v = world.toRender(ground, height).project(camera);
    return { x: bounds.left + (v.x + 1) * half * bounds.width, y: bounds.top + (1 - v.y) * half * bounds.height, z: v.z };
  };
  const foot = at(0),
    head = at(heightUnits),
    height = Math.max(minPx, foot.y - head.y),
    width = Math.max(minPx, height * widthRatio);
  return { left: foot.x - width * half, top: foot.y - height, width, height, visible: foot.z < 1 && head.z < 1 };
}

// market: () => adapter | null; isGuest: () => bool; localCash: () => number | null; onCash(delta): move the run's carried cash;
// blocked: () => bool (paused, travelling, menu open).
export function createShop({
  doc = globalThis.document,
  market,
  isGuest,
  localCash,
  onCash,
  blocked,
  search,
  enabled = DATA.enabled, // a test passes true: the data ships false until the market server is live
  listen = (target, type, handler) => target.addEventListener(type, handler),
}) {
  const controller = createShopController({ api: market, isGuest, localCash, onCash, enabled, onChange: (v) => view.render(v) }),
    view = createShopView({ doc, controller }),
    layer = doc.createElement("div"),
    spots = new Map(),
    grounds = new Map(); // shopId -> { world, ground }
  layer.id = "shop-hotspots";
  for (const row of DATA.shops) {
    const spot = doc.createElement("button"),
      tag = doc.createElement("span");
    spot.type = "button";
    spot.className = "shop-hotspot";
    spot.hidden = true;
    tag.className = "shop-tag";
    tag.textContent = say("tagLine", { stall: row.stallLabel });
    spot.append(tag);
    spot.addEventListener("click", () => controller.open(row.shopId));
    spots.set(row.shopId, spot);
    layer.append(spot);
  }
  doc.body.append(layer, view.root);
  const keyOff = (event) => {
    if (event.key === DATA.closeKey && controller.isOpen) controller.close();
  };
  listen(doc, "keydown", keyOff);

  function groundOf(row, world) {
    const cached = grounds.get(row.shopId);
    if (cached?.world === world) return cached.ground;
    const npc = GAME_DATA.hubNpcs.npcs.find((n) => n.id === row.npcId),
      ground = npc ? world.geometry.ground(npc.at) : null;
    grounds.set(row.shopId, { world, ground });
    return ground;
  }
  return {
    controller,
    // Every frame, after the world has moved: s is the loop's context (world, game, camera, canvas).
    update(s) {
      const live = shopsOn(search, enabled) && hubNpcsOn(search) && s.world?.areaId === DATA.area && !blocked();
      if (!live) {
        if (controller.isOpen) controller.close();
        for (const spot of spots.values()) spot.hidden = true;
        return;
      }
      s.camera.updateMatrixWorld();
      const bounds = s.canvas.getBoundingClientRect(),
        player = s.game.player.pos;
      for (const row of DATA.shops) {
        const spot = spots.get(row.shopId),
          ground = groundOf(row, s.world),
          near = !!ground && Math.hypot(player.x - ground.x, player.z - ground.z) <= row.radius;
        if (!near && controller.isOpen && controller.view().shop.shopId === row.shopId) controller.close();
        const box = near && !controller.isOpen ? bodyBox(s.world, s.camera, bounds, ground) : null;
        spot.hidden = !box?.visible;
        if (box?.visible) {
          spot.style.left = `${box.left}px`;
          spot.style.top = `${box.top}px`;
          spot.style.width = `${box.width}px`;
          spot.style.height = `${box.height}px`;
        }
      }
    },
    open: (shopId) => controller.open(shopId),
    close: () => controller.close(),
    dispose() {
      layer.remove();
      view.dispose();
    },
  };
}
