import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { placementsFor } from "./world-pickups-core.js";
import { huntTarget } from "./route-guidance.js";
import { expeditionObjective } from "./expedition-runtime.js";
import { extractionTarget } from "./apocalypse-run.js";
import { corpseTarget } from "./corpse-run.js";
import { bossExitGate } from "./area-bosses.js";

// The corner minimap (data/minimap.json): a small round canvas in the HUD, the player at its centre and the picture's own orientation (up the
// screen is up the map). It shows the walkable ground of the area, the exits (dimmed while locked), loot lying about, nearby hostiles as red
// dots, bosses as a larger marker and the one objective if there is one. Exits, bosses and the objective that lie beyond the map's radius
// are pinned to its rim so the way is always readable; hostiles and loot beyond it are left out.
// Presentation only: it reads the run and the world and never changes either. One tap steps small -> large -> hidden (data `cycle`), the
// choice is remembered in localStorage (every access guarded), `?nomap=1` switches the whole thing off.
// Phone cost: the canvas is redrawn `hz` times a second (not every frame), the dots come from fixed pools that are reused (no per-redraw
// arrays or objects for them), and nothing is drawn while the map is hidden, the menu is open, or the run is not live.
const MAP = GAME_DATA.minimap;
const HALF = 1 / (1 + 1);
const TURN = Math.PI * (1 + 1);

// The URL parameter named in the data (offSwitch.param) set to offSwitch.value turns the map off for the page load.
export const minimapOn = (data = MAP, search = globalThis.location?.search ?? "") =>
  data.enabled && new URLSearchParams(search).get(data.offSwitch.param) !== data.offSwitch.value;

// What the button says a tap will do, by the mode it is in (the three modes are fixed by the validator; the ids are written out so the
// text-drift test can see every caller).
const tapText = (mode) =>
  mode === "small"
    ? webText("minimap.tap.small")
    : mode === "large"
      ? webText("minimap.tap.large")
      : webText("minimap.tap.hidden");

// The mode a tap leads to: the next one in data `cycle` (an unknown mode starts the cycle over).
export const nextMode = (mode, data = MAP) => data.cycle[(data.cycle.indexOf(mode) + 1) % data.cycle.length];

// Storage that may refuse: the getter, the read and the write each can throw (private window, blocked site data).
const storageOf = (win) => {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
};
export function readMode(storage, data = MAP) {
  try {
    const saved = storage?.getItem(data.storageKey);
    return data.cycle.includes(saved) ? saved : data.defaultMode;
  } catch {
    return data.defaultMode;
  }
}
export function writeMode(storage, mode, data = MAP) {
  try {
    storage?.setItem(data.storageKey, mode);
  } catch {
    /* the choice is simply not remembered */
  }
}

// The side of the map in CSS pixels. On a touch layout the map must not reach down into the control band (joystick, buttons, weapon tiles):
// the room under its top edge is the screen height minus the band minus the map's top offset (a large map in portrait hangs below the menu
// button), and the map shrinks to fit, but never below `minSizePx`.
export function fitSize(mode, viewport, constrained, data = MAP) {
  const want = data.sizePx[mode];
  if (!want) return 0;
  if (!constrained) return want;
  const portrait = viewport.height >= viewport.width,
    shifted = portrait && mode === "large",
    top = data.topInsetPx + (shifted ? data.menuOffsetPx : 0),
    room = Math.floor(viewport.height - data.controlBandPx[portrait ? "portrait" : "landscape"] - top);
  return Math.max(data.minSizePx, Math.min(want, room));
}

// A ground offset (metres east and north of the player) as a point on the map: `centre` is the map's middle in pixels, `scale` pixels per
// metre, `reach` how far from the middle a mark may sit. Inside the reach the point is exact (out.inside true); outside it is slid along the
// same line to the rim (out.inside false). Fills and returns `out` so a redraw allocates nothing.
export function place(dx, dz, scale, centre, reach, out) {
  const px = dx * scale,
    py = -dz * scale, // north is up the screen
    length = Math.hypot(px, py);
  if (length <= reach) {
    out.x = centre + px;
    out.y = centre + py;
    out.inside = true;
  } else {
    const k = reach / length;
    out.x = centre + px * k;
    out.y = centre + py * k;
    out.inside = false;
  }
  return out;
}

// The `cap` nearest of the points offered, nearest first, in slots made once and reused: offer() allocates nothing. A point farther than every
// kept one is refused when the set is full.
export function createNearest(cap) {
  const slots = Array.from({ length: cap }, () => ({ x: 0, z: 0, d: 0 }));
  let size = 0;
  return {
    slots,
    get size() {
      return size;
    },
    clear() {
      size = 0;
    },
    offer(x, z, d) {
      let i;
      if (size < cap) i = size++;
      else if (d < slots[cap - 1].d) i = cap - 1;
      else return false;
      slots[i].x = x;
      slots[i].z = z;
      slots[i].d = d;
      for (; i > 0 && slots[i - 1].d > slots[i].d; i--) {
        const higher = slots[i - 1];
        slots[i - 1] = slots[i];
        slots[i] = higher;
      }
      return true;
    },
  };
}

// Fills the pools for one redraw. Hostiles (awake, not in a safehouse) within `radius` metres go to `hostiles`; bosses go to `bosses` at any
// distance (they are pinned to the rim); loot within `radius`: ground pickups not taken, coin drops, supply drops of this area. Returns nothing.
export function gather(g, areaId, radius, pools) {
  const from = g.player.pos,
    enemies = g.enemies ?? [];
  pools.hostiles.clear();
  pools.bosses.clear();
  pools.pickups.clear();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!(e.hp > 0) || e.hostile === false || e.safehouseSuppressed) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
    if (e.bossProfile) pools.bosses.offer(e.pos.x, e.pos.z, d);
    else if (d <= radius) pools.hostiles.offer(e.pos.x, e.pos.z, d);
  }
  const placed = placementsFor(areaId),
    taken = g.worldPickups?.until;
  for (let i = 0; i < placed.length; i++)
    if (taken?.[placed[i].id] === undefined) offerNear(pools.pickups, from, radius, placed[i].x, placed[i].z);
  const drops = g.killDrops?.list ?? [];
  for (let i = 0; i < drops.length; i++)
    if (drops[i].areaId === areaId) offerNear(pools.pickups, from, radius, drops[i].x, drops[i].z);
  const supplies = g.supplies?.pending ?? [];
  for (let i = 0; i < supplies.length; i++)
    if (supplies[i].areaId === areaId)
      offerNear(pools.pickups, from, radius, supplies[i].position.x, supplies[i].position.z);
}
function offerNear(set, from, radius, x, z) {
  const d = Math.hypot(x - from.x, z - from.z);
  if (d <= radius) set.offer(x, z, d);
}

// The one objective, into `out`: { kind: "point", x, z } for a place on the ground (the tutorial's kill, the extraction hold, the body bag,
// a landed airdrop), { kind: "exit", to } for the first exit on the way to the contract's area, or kind "none". `memo` remembers the route
// lookup for an (area, target) pair so a redraw does not search the area graph again.
export function resolveObjective(g, world, memo, out) {
  const hunt = huntTarget(g),
    drop = g.airdrop,
    crate = drop?.areaId === world.areaId && (drop.phase === "falling" || drop.phase === "landed") ? drop.crate : null,
    spot = hunt?.pos ?? extractionTarget(g)?.at ?? corpseTarget(g)?.at ?? crate ?? null;
  out.kind = "none";
  if (spot) {
    out.kind = "point";
    out.x = spot.x;
    out.z = spot.z;
    return out;
  }
  const target = expeditionObjective(g);
  if (!target || target === world.areaId) return out;
  if (memo.areaId !== world.areaId || memo.target !== target) {
    memo.areaId = world.areaId;
    memo.target = target;
    memo.to = world.registry?.nextExit?.(world.areaId, target)?.to ?? null;
  }
  if (memo.to) {
    out.kind = "exit";
    out.to = memo.to;
  }
  return out;
}

// The map's DOM: one button in #hud holding the canvas (and the word on the small "show" chip), so one tap target does all the toggling.
// s: the session (game, world, loaded, traveling, paused, contextLost, resetting). options: doc, win, data, search, now, objective (tests).
export function createMinimap(s, options = {}) {
  const doc = options.doc ?? globalThis.document,
    win = options.win ?? globalThis,
    data = options.data ?? MAP,
    hud = doc?.getElementById?.("hud");
  if (!hud || !minimapOn(data, options.search)) return { update() {}, dispose() {}, mode: () => "off" };
  const now = options.now ?? (() => win.performance?.now?.() ?? Date.now()),
    storage = storageOf(win),
    objectiveOf = options.objective ?? resolveObjective,
    button = doc.createElement("button"),
    canvas = doc.createElement("canvas"),
    chip = doc.createElement("span"),
    ctx = canvas.getContext?.("2d") ?? null,
    pools = {
      hostiles: createNearest(data.maxDots.hostile),
      bosses: createNearest(data.maxDots.boss),
      pickups: createNearest(data.maxDots.pickup),
    },
    spot = { x: 0, y: 0, inside: false },
    objective = { kind: "none", x: 0, z: 0, to: "" },
    memo = { areaId: "", target: "", to: null },
    interval = 1000 / data.hz;
  let mode = readMode(storage, data),
    side = 0,
    ratio = 0,
    last = -Infinity,
    shown = false,
    disposed = false;
  button.id = "minimap";
  button.type = "button";
  chip.className = "minimap-chip";
  chip.textContent = webText("minimap.chip");
  button.style.setProperty("--minimap-chip-back", data.colours.chipBack);
  button.style.setProperty("--minimap-chip-border", data.colours.chipBorder);
  button.append(canvas, chip);
  hud.append(button);
  const constrained = () =>
    !!doc.body?.classList?.contains("touch") || !!win.matchMedia?.("(pointer: coarse)")?.matches;
  // Mode and size: the button's data-mode, its label and its size follow the mode; the canvas is resized only when its pixels change.
  function layout() {
    const viewport = { width: win.innerWidth, height: win.innerHeight },
      px = mode === "hidden" ? data.chipPx : fitSize(mode, viewport, constrained(), data);
    ratio = Math.min(data.maxDpr, win.devicePixelRatio || 1);
    button.dataset.mode = mode;
    button.setAttribute("aria-label", tapText(mode));
    button.title = tapText(mode);
    button.style.setProperty("--minimap-size", `${px}px`);
    button.style.setProperty("--minimap-offset", `${data.menuOffsetPx}px`);
    if (mode !== "hidden" && (side !== px || canvas.width !== Math.round(px * ratio))) {
      side = px;
      canvas.width = canvas.height = Math.round(px * ratio);
    }
  }
  function draw(g) {
    if (!ctx || mode === "hidden" || !side) return;
    const world = s.world,
      radius = data.radiusMetres[mode],
      c = side * HALF,
      reach = c - data.rimPadPx,
      scale = reach / radius,
      from = g.player.pos,
      colours = data.colours,
      dot = data.dotPx;
    gather(g, world.areaId, radius, pools);
    objectiveOf(g, world, memo, objective);
    ctx.setTransform(canvas.width / side, 0, 0, canvas.width / side, 0, 0);
    ctx.clearRect(0, 0, side, side);
    ctx.beginPath();
    ctx.arc(c, c, c - data.lineWidthPx.border * HALF, 0, TURN);
    ctx.fillStyle = colours.back;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // The ground you can walk on: the road polygon with the blockers cut out of it (even-odd fill), moved so the player is at the centre.
    ctx.beginPath();
    const geo = world.geometry;
    if (geo?.road) trace(ctx, geo.road, from, c, scale);
    for (let i = 0; i < (geo?.blockers?.length ?? 0); i++) trace(ctx, geo.blockers[i], from, c, scale);
    ctx.fillStyle = colours.walkable;
    ctx.fill("evenodd");
    // Exits (pinned to the rim when beyond the radius), the objective exit drawn as the objective.
    const rings = world.exitRings?.rings ?? [];
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i],
        goal = objective.kind === "exit" && objective.to === ring.to;
      place(ring.at.x - from.x, ring.at.z - from.z, scale, c, reach, spot);
      if (!spot.inside && !data.pinExitsToRim) continue;
      const locked = bossExitGate(g, ring.to)?.allowed === false;
      mark(
        ctx,
        spot,
        goal ? dot.objective : dot.exit,
        goal ? colours.objective : locked ? colours.exitLocked : colours.exit,
        "square",
      );
      if (goal) ring2(ctx, spot, dot.objective, colours.objective, data.lineWidthPx.objectiveRing);
    }
    for (let i = 0; i < pools.pickups.size; i++) {
      const p = pools.pickups.slots[i];
      mark(ctx, place(p.x - from.x, p.z - from.z, scale, c, reach, spot), dot.pickup, colours.pickup, "square");
    }
    for (let i = 0; i < pools.hostiles.size; i++) {
      const p = pools.hostiles.slots[i];
      mark(ctx, place(p.x - from.x, p.z - from.z, scale, c, reach, spot), dot.hostile, colours.hostile, "round");
    }
    for (let i = 0; i < pools.bosses.size; i++) {
      const p = pools.bosses.slots[i];
      mark(ctx, place(p.x - from.x, p.z - from.z, scale, c, reach, spot), dot.boss, colours.boss, "round");
    }
    if (objective.kind === "point") {
      place(objective.x - from.x, objective.z - from.z, scale, c, reach, spot);
      mark(ctx, spot, dot.objective, colours.objective, "round");
      ring2(ctx, spot, dot.objective, colours.objective, data.lineWidthPx.objectiveRing);
    }
    spot.x = spot.y = c;
    mark(ctx, spot, dot.player, colours.player, "round");
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c, c, c - data.lineWidthPx.border * HALF, 0, TURN);
    ctx.lineWidth = data.lineWidthPx.border;
    ctx.strokeStyle = colours.border;
    ctx.stroke();
  }
  function setMode(next) {
    mode = next;
    writeMode(storage, mode, data);
    layout();
    last = -Infinity;
    const g = s.game;
    if (shown && g) draw(g);
  }
  const onTap = () => setMode(nextMode(mode, data)),
    onResize = () => layout();
  button.addEventListener("click", onTap);
  win.addEventListener?.("resize", onResize);
  layout();
  button.hidden = true;
  function update() {
    if (disposed) return;
    const g = s.game,
      active =
        !!g &&
        !!s.world &&
        s.loaded &&
        !s.traveling &&
        !s.paused &&
        !s.contextLost &&
        !s.resetting &&
        g.player.hp > 0 &&
        !g.finished &&
        !doc.body?.classList?.contains("menu-open");
    if (active !== shown) {
      shown = active;
      button.hidden = !active;
      last = -Infinity;
    }
    if (!active || mode === "hidden") return;
    const t = now();
    if (t - last < interval) return;
    last = t;
    draw(g);
  }
  return {
    update,
    mode: () => mode,
    dispose() {
      if (disposed) return;
      disposed = true;
      button.removeEventListener("click", onTap);
      win.removeEventListener?.("resize", onResize);
      button.remove();
    },
  };
}

// One closed polygon of ground points into the current path, the player's position `from` at the map's middle `c`.
function trace(ctx, poly, from, c, scale) {
  for (let i = 0; i < poly.length; i++) {
    const x = c + (poly[i].x - from.x) * scale,
      y = c - (poly[i].z - from.z) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
// One mark: a filled disc or a filled square of `size` px (its diameter / side) centred on `at`.
function mark(ctx, at, size, colour, shape) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  if (shape === "square") ctx.rect(at.x - size * HALF, at.y - size * HALF, size, size);
  else ctx.arc(at.x, at.y, size * HALF, 0, TURN);
  ctx.fill();
}
// A thin ring a little wider than a mark, so the objective stands out from the exits and loot around it.
function ring2(ctx, at, size, colour, width) {
  ctx.beginPath();
  ctx.arc(at.x, at.y, size, 0, TURN);
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.stroke();
}
