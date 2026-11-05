import { GAME_DATA } from "./game-data.js";

// Edge-of-screen threat arrows (data/threatArrows.json): a small arrow on the screen edge pointing at each hunter that is awake, after the
// player and outside the camera view. Presentation only: it reads the run and the camera and never changes either.
// Who counts: a marked hunter (always after the player), a boss once awake, and any other enemy that has aggro within `aggroMetres`.
// The arrows share the camera projection the boss labels use (world.toRender, then camera.project); nearest first, at most `maxArrows`,
// and hunters in the same `sectorDegrees` sector share one arrow. A hunter counts as on screen only inside `viewFraction` (90%) of the
// view, so its arrow appears as it nears the edge; the arrow is drawn stronger the closer the hunter is (`distanceFade`).

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
// The smallest turn between two directions in degrees, 0 to 180.
const turnBetween = (a, b) => {
  const turn = Math.abs(a - b) % 360;
  return turn > 180 ? 360 - turn : turn;
};

// Hunters that should be pointed at, nearest first: { id, pos, dist, strong } (strong = marked hunter or boss).
export function huntingThreats(g, data = GAME_DATA.threatArrows) {
  const from = g.player.pos,
    found = [];
  for (const e of g.enemies ?? []) {
    if (!(e.hp > 0) || e.hostile === false || e.safehouseSuppressed) continue;
    const dist = Math.hypot(e.pos.x - from.x, e.pos.z - from.z),
      boss = !!e.bossProfile,
      hunting = !!e.markedHunter || (e.alerted === true && (boss || dist <= data.aggroMetres));
    if (hunting) found.push({ id: e.id, pos: e.pos, dist, strong: !!e.markedHunter || boss });
  }
  return found.sort((a, b) => a.dist - b.dist);
}

// A ground position on the screen in CSS pixels, from the camera. `inView` is false when it is off screen or behind the camera; a point
// behind the camera is mirrored so the direction to it still reads right. `fraction` is how much of the view counts as in view: at 0.9 an
// enemy in the outer tenth of the screen already gets its arrow.
export function projectToScreen(world, camera, position, height, viewport, fraction = 1) {
  const point = world.toRender(position, height),
    behind = point.clone().applyMatrix4(camera.matrixWorldInverse).z > 0,
    ndc = point.project(camera),
    span = 1 + 1, // NDC runs from -1 to 1
    sign = behind ? -1 : 1;
  return {
    x: ((sign * ndc.x + 1) * viewport.width) / span,
    y: ((1 - sign * ndc.y) * viewport.height) / span,
    inView: !behind && Math.abs(ndc.x) <= fraction && Math.abs(ndc.y) <= fraction,
  };
}

// How strong an arrow is by distance, as a share of its own opacity: full at nearMetres or closer, minScale at farMetres or beyond, in a
// straight line between. Closer hunters read stronger.
export function distanceScale(dist, data = GAME_DATA.threatArrows) {
  const { nearMetres, farMetres, minScale } = data.distanceFade,
    along = clamp((dist - nearMetres) / (farMetres - nearMetres), 0, 1);
  return 1 - (1 - minScale) * along;
}

// The rectangle the arrows live in: the safe area, pulled in by insetPx. On a touch layout `bandPx` of the bottom is the control band
// (joystick, buttons, weapon tiles): arrows never sit in it. Null when the screen is too small for a rectangle.
export function arrowRect(safe, data, bandPx = 0) {
  const left = safe.left + data.insetPx,
    right = safe.right - data.insetPx,
    top = safe.top + data.insetPx,
    bottom = safe.bottom - data.insetPx;
  if (!(right > left && bottom > top)) return null;
  return { left, right, top, bottom, controlsBottom: clamp(safe.bottom - bandPx, top, bottom) };
}

// Where the ray from `origin` through `target` leaves the rectangle, and the turn of an up-pointing arrow (degrees clockwise from up)
// that faces along it. A hit on the bottom edge inside the control band slides to the side edge at the band's top.
export function edgeArrow(origin, target, rect) {
  const dx = target.x - origin.x,
    dy = target.y - origin.y;
  if (dx === 0 && dy === 0) return null;
  const ox = clamp(origin.x, rect.left, rect.right),
    oy = clamp(origin.y, rect.top, rect.bottom),
    reachX = dx > 0 ? (rect.right - ox) / dx : dx < 0 ? (rect.left - ox) / dx : Infinity,
    reachY = dy > 0 ? (rect.bottom - oy) / dy : dy < 0 ? (rect.top - oy) / dy : Infinity,
    reach = Math.min(reachX, reachY);
  let x = ox + dx * reach,
    y = oy + dy * reach;
  if (y > rect.controlsBottom) {
    y = rect.controlsBottom;
    x = dx < 0 ? rect.left : rect.right;
  }
  return { x, y, angle: Math.atan2(dx, -dy) * (180 / Math.PI) };
}

// One arrow per sector, nearest first, at most maxArrows. A hunter within the sector of an arrow already placed joins it (the arrow
// keeps the nearest one's place, and turns strong when any member is). Beyond the cap, a hunter in a new sector gets no arrow.
export function mergeSectors(items, data) {
  const arrows = [];
  for (const item of [...items].sort((a, b) => a.dist - b.dist)) {
    // The sector reaches half its width either side of the arrow it belongs to.
    const arrow = arrows.find((a) => turnBetween(a.angle, item.angle) * (1 + 1) <= data.sectorDegrees);
    if (arrow) {
      arrow.count += 1;
      arrow.strong ||= item.strong;
    } else if (arrows.length < data.maxArrows) arrows.push({ ...item, count: 1 });
  }
  return arrows;
}

// The arrows to show: `view` is { origin, rect, project(position) -> { x, y, inView } } in CSS pixels.
export function planArrows(threats, view, data = GAME_DATA.threatArrows) {
  const items = [];
  for (const threat of threats) {
    const seen = view.project(threat.pos);
    if (seen.inView) continue;
    const arrow = edgeArrow(view.origin, seen, view.rect);
    if (arrow) items.push({ ...arrow, dist: threat.dist, strong: threat.strong });
  }
  return mergeSectors(items, data);
}

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// The arrows' DOM: a pool of maxArrows spans in one host inside #hud. The host is pinned to the safe-area variables (style.css), so its
// own rectangle is the safe area. Fade-in is a CSS opacity transition, none under reduced motion; hiding is immediate.
export function createThreatArrows(
  s,
  { doc = globalThis.document, win = globalThis, data = GAME_DATA.threatArrows } = {},
) {
  const hud = doc?.getElementById("hud");
  if (!hud || !data.enabled) return { update() {}, dispose() {} };
  const host = doc.createElement("div"),
    pool = [];
  host.id = "threat-arrows";
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    left: "var(--safe-l)",
    right: "var(--safe-r)",
    top: "var(--safe-t)",
    bottom: "var(--safe-b)",
    pointerEvents: "none",
    filter: `drop-shadow(0 0 ${data.outline.blurPx}px #${data.outline.colour})`,
  });
  for (let i = 0; i < data.maxArrows; i++) {
    const el = doc.createElement("span");
    el.className = "threat-arrow";
    Object.assign(el.style, { position: "absolute", opacity: "0", clipPath: data.clipPath, pointerEvents: "none" });
    host.append(el);
    pool.push({ el, shown: false, key: "" });
  }
  hud.append(host);
  let safe = null,
    disposed = false;
  const forget = () => {
    safe = null;
  };
  win.addEventListener?.("resize", forget);
  const reduced = () => win.matchMedia?.(MOTION_QUERY)?.matches ?? false;
  const hide = (slot) => {
    if (!slot.shown) return;
    slot.shown = false;
    slot.el.style.transition = "none";
    slot.el.style.opacity = "0";
  };
  const show = (slot, arrow) => {
    const look = arrow.strong ? data.marked : data.plain,
      // The host is the safe area, so its children are placed from the safe area's corner, not the screen's.
      x = Math.round(arrow.x - safe.left),
      y = Math.round(arrow.y - safe.top),
      turn = Math.round(arrow.angle),
      strength = String(Math.round(look.opacity * distanceScale(arrow.dist, data) * 100) / 100),
      key = `${x} ${y} ${turn} ${look.colour}`;
    if (key !== slot.key) {
      slot.key = key;
      Object.assign(slot.el.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${look.sizePx}px`,
        height: `${look.sizePx}px`,
        background: `#${look.colour}`,
        transform: `translate(-50%, -50%) rotate(${turn}deg)`,
      });
      slot.el.dataset.kind = arrow.strong ? "marked" : "plain";
    }
    if (!slot.shown) {
      slot.shown = true;
      slot.el.style.transition = reduced() || !data.fadeInMs ? "none" : `opacity ${data.fadeInMs}ms linear`;
    }
    if (slot.el.style.opacity !== strength) slot.el.style.opacity = strength;
  };
  const safeRect = () => {
    if (!safe) {
      const box = host.getBoundingClientRect();
      if (box.right > box.left && box.bottom > box.top)
        safe = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }
    return safe;
  };
  function update() {
    if (disposed) return;
    const g = s.game,
      camera = s.camera,
      world = s.world,
      active =
        !!g &&
        !!camera &&
        !!world &&
        s.loaded &&
        !s.traveling &&
        !s.paused &&
        !s.contextLost &&
        !s.resetting &&
        g.player.hp > 0 &&
        !g.finished;
    let arrows = [];
    if (active) {
      const threats = huntingThreats(g, data),
        box = threats.length ? safeRect() : null,
        touch = !!doc.body?.classList?.contains("touch"),
        viewport = { width: win.innerWidth, height: win.innerHeight },
        band = touch ? (viewport.height > viewport.width ? data.touchBandPx.portrait : data.touchBandPx.landscape) : 0,
        rect = box ? arrowRect(box, data, band) : null;
      if (rect) {
        camera.updateMatrixWorld();
        const project = (position) =>
          projectToScreen(world, camera, position, data.projectHeight, viewport, data.viewFraction);
        arrows = planArrows(threats, { origin: project(g.player.pos), rect, project }, data);
      }
    }
    pool.forEach((slot, i) => (arrows[i] ? show(slot, arrows[i]) : hide(slot)));
  }
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener?.("resize", forget);
      host.remove();
    },
  };
}
