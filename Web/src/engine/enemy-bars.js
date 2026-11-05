import { Box3, Vector3 } from "three";
import { GAME_DATA } from "./game-data.js";
import { combatTargetHeight } from "../pistol-targeting.js";
// The health bar over a hostile (data/enemyBars.json): a small flat bar above the head, hidden at full health. An ordinary bar shows for
// `holdSeconds` after the last hit; the enemy the player is aiming at gets a thin bar the width of its body that clears `targetHoldSeconds`
// after its last hit; star variants, hunters and bosses always show. Behind the fill a pale segment trails the real health down (the hit
// reads as a bite), the fill turns amber under `lowFraction`, gold-white for stars and blue for a pack follower. The bar fades over the last
// `fadeSeconds` (a hard cut, and no trail, under prefers-reduced-motion), at most `maxVisible` at once. Every time is game seconds, so
// nothing depends on the frame rate. The bars are a fixed pool of DOM spans reused for every enemy and a style is written only when its
// value changes, so a steady frame allocates nothing. A hit is the enemy's hp falling between two frames, so every damage source counts.
const BARS = GAME_DATA.enemyBars;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const box = new Box3(),
  size = new Vector3();

// The URL parameter named in the data (offSwitch.param) set to offSwitch.value turns every bar off.
export const enemyBarsOn = (rules = BARS, search = globalThis.location?.search ?? "") =>
  rules.enabled && new URLSearchParams(search).get(rules.offSwitch.param) !== rules.offSwitch.value;

// Who keeps a bar when more than `maxVisible` want one: the aimed-at enemy, then bosses, then star variants, then the nearest.
const byPriority = (a, b) =>
  Number(b.targeted) - Number(a.targeted) ||
  Number(b.boss) - Number(a.boss) ||
  Number(b.starred) - Number(a.starred) ||
  a.distance - b.distance;

// Measures a drawn body once: how far its top stands above the ground and how wide it is, in metres. False until the view exists.
function measure(state, view) {
  if (!view?.root) return false;
  view.root.updateWorldMatrix(true, true);
  box.setFromObject(view.root);
  if (box.isEmpty()) return false;
  box.getSize(size);
  state.top = box.max.y - view.root.position.y;
  state.span = Math.max(size.x, size.z);
  return true;
}

// s: the session (game, camera, canvas, actors, world, loaded, contextLost, traveling). options: doc, rules, matchMedia, search (tests).
export function createEnemyBars(s, options = {}) {
  const rules = options.rules ?? BARS,
    doc = options.doc ?? globalThis.document,
    hud = doc?.getElementById?.("hud");
  if (!(hud?.before || doc?.body?.append) || !enemyBarsOn(rules, options.search)) return { update() {}, dispose() {} };
  const query = options.matchMedia ?? globalThis.matchMedia?.bind(globalThis),
    motion = query?.(REDUCED_MOTION),
    layer = doc.createElement("div"),
    states = new Map(),
    candidates = [],
    free = [],
    made = [],
    point = new Vector3(),
    edge = new Vector3();
  layer.className = "enemy-bars";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "fixed", inset: "0", overflow: "hidden", pointerEvents: "none" });
  // Beside #hud, not inside it: the desktop layout zooms #hud (--ui-scale), which would shift every pixel position written here.
  // Placed just before it, so the HUD still draws over the bars.
  if (hud?.before) hud.before(layer);
  else doc.body.append(layer);
  let frame = 0,
    lastTime = NaN,
    disposed = false;

  function create() {
    const el = doc.createElement("span"),
      trail = doc.createElement("span"),
      fill = doc.createElement("span");
    el.className = "enemy-bar";
    el.hidden = true;
    Object.assign(el.style, { position: "absolute", left: "0", top: "0", background: rules.colours.back, pointerEvents: "none" });
    for (const part of [trail, fill]) Object.assign(part.style, { position: "absolute", left: "0", top: "0", height: "100%" });
    trail.style.background = rules.colours.decay;
    el.append(trail, fill);
    layer.append(el);
    const bar = { el, trail, fill, hidden: true, widthPx: -1, heightPx: -1, colour: "", percent: -1, trailPercent: -1 };
    Object.assign(bar, { x: NaN, y: NaN, alpha: NaN });
    made.push(bar);
    return bar;
  }
  const acquire = () => free.pop() ?? (made.length < rules.maxVisible ? create() : null);
  function release(state) {
    const bar = state.bar;
    if (!bar) return;
    state.bar = null;
    bar.el.hidden = true;
    bar.hidden = true;
    free.push(bar);
  }
  function releaseAll() {
    for (const state of states.values()) release(state);
    states.clear();
    lastTime = NaN;
  }

  function draw(state) {
    const bar = (state.bar ??= acquire());
    if (!bar) return;
    if (bar.widthPx !== state.widthPx) {
      bar.widthPx = state.widthPx;
      bar.el.style.width = `${state.widthPx}px`;
    }
    if (bar.heightPx !== state.heightPx) {
      bar.heightPx = state.heightPx;
      bar.el.style.height = `${state.heightPx}px`;
    }
    if (bar.colour !== state.colour) {
      bar.colour = state.colour;
      bar.fill.style.background = rules.colours[state.colour];
    }
    if (bar.percent !== state.percent) {
      bar.percent = state.percent;
      bar.fill.style.width = `${state.percent}%`;
    }
    if (bar.trailPercent !== state.trailPercent) {
      bar.trailPercent = state.trailPercent;
      bar.trail.style.width = `${state.trailPercent}%`;
    }
    if (bar.x !== state.x || bar.y !== state.y) {
      bar.x = state.x;
      bar.y = state.y;
      bar.el.style.transform = `translate(${state.x}px,${state.y}px) translate(-50%,-100%)`;
    }
    if (bar.alpha !== state.alpha) {
      bar.alpha = state.alpha;
      bar.el.style.opacity = String(state.alpha);
    }
    if (bar.hidden) {
      bar.hidden = false;
      bar.el.hidden = false;
    }
  }

  function update() {
    if (disposed) return;
    const g = s.game;
    if (!g || !s.camera || !s.loaded || s.contextLost || s.traveling || g.finished || g.player.hp <= 0) {
      releaseAll();
      return;
    }
    frame++;
    const time = g.time,
      dt = Number.isFinite(lastTime) ? Math.max(0, time - lastTime) : 0,
      width = s.canvas?.clientWidth || globalThis.innerWidth,
      height = s.canvas?.clientHeight || globalThis.innerHeight,
      body = doc.body?.classList,
      desktop = !!body?.contains("desktop-ui") && !body.contains("touch"),
      still = !!motion?.matches || rules.fadeSeconds <= 0,
      right = s.world?.cameraRight ?? { x: 1, z: 0 };
    lastTime = time;
    candidates.length = 0;
    for (const e of g.enemies) {
      if (!(e.hp > 0)) continue;
      const fraction = Math.min(1, Math.max(0, e.hp / e.maxHP));
      let state = states.get(e.id);
      if (!state) states.set(e.id, (state = { bar: null, seen: 0, hp: e.hp, trail: fraction, trailFrom: 0, lastHit: -Infinity }));
      if (e.hp < state.hp) {
        state.lastHit = time;
        state.trailFrom = time + rules.decay.delaySeconds;
      }
      state.hp = e.hp;
      state.seen = frame;
      // The pale segment waits `delaySeconds` after a hit, then closes on the real health at `perSecond` of the bar a second. Only the
      // seconds of this frame that fall after the wait count, so one long frame and many short ones close it by the same amount.
      if (still || fraction > state.trail) state.trail = fraction;
      else state.trail = Math.max(fraction, state.trail - rules.decay.perSecond * Math.max(0, time - Math.max(time - dt, state.trailFrom)));
      const boss = !!e.bossProfile,
        starred = !!(e.star || e.markedHunter),
        targeted = e.id === g.touchTarget?.id || e.id === g.pistolTargetId,
        sinceHit = time - state.lastHit,
        recent = e.hp < e.maxHP && sinceHit < rules.holdSeconds,
        aimed = targeted && !boss && (state.lastHit === -Infinity || sinceHit < rules.targetHoldSeconds),
        row = boss ? rules.classes.boss : starred ? rules.classes.elite : rules.classes.normal;
      if (!row.always && !aimed && !recent) {
        release(state);
        continue;
      }
      const view = s.actors?.views?.get(e.id);
      if (state.top === undefined) measure(state, view);
      const top = state.top === undefined ? combatTargetHeight(e, time) : state.top + (view?.root.position.y ?? 0);
      point.set(e.pos.x, top, -e.pos.z).project(s.camera);
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) {
        release(state);
        continue;
      }
      const thin = aimed && !row.always;
      state.widthPx = desktop ? row.widthPx.desktop : row.widthPx.phone;
      if (thin) {
        // The aimed-at bar is as wide as the body is on screen (one body width along the camera's right), kept between the data's limits.
        const metres = state.span ?? 0,
          reach = edge.set(e.pos.x + right.x * metres, top, -(e.pos.z + right.z * metres)).project(s.camera).x,
          pixels = Math.round(Math.abs(reach - point.x) * width * rules.half);
        state.widthPx = Math.min(rules.target.maxWidthPx, Math.max(rules.target.minWidthPx, pixels));
      }
      state.heightPx = thin ? rules.target.heightPx : row.heightPx;
      state.boss = boss;
      state.starred = starred;
      state.targeted = targeted;
      state.distance = Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z);
      state.colour = starred
        ? "elite"
        : e.residentIntent?.companionDistance > 0
          ? "follower"
          : fraction < rules.lowFraction
            ? "low"
            : "fill";
      state.percent = Math.round(fraction * 100);
      state.trailPercent = Math.round(Math.max(fraction, state.trail) * 100);
      state.x = Math.round((point.x + 1) * width * rules.half);
      state.y = Math.round((1 - point.y) * height * rules.half) - rules.liftPx;
      // Full opacity until the last `fadeSeconds` of the window that is keeping the bar; an always-on or never-hit bar has no window.
      const keep = aimed ? rules.targetHoldSeconds : rules.holdSeconds,
        fading = !row.always && Number.isFinite(sinceHit) && !still;
      state.alpha = fading ? Math.round(Math.min(1, (keep - sinceHit) / rules.fadeSeconds) * 100) / 100 : 1;
      candidates.push(state);
    }
    for (const [id, state] of states)
      if (state.seen !== frame) {
        release(state);
        states.delete(id);
      }
    if (candidates.length > rules.maxVisible) {
      candidates.sort(byPriority);
      for (let i = rules.maxVisible; i < candidates.length; i++) release(candidates[i]);
      candidates.length = rules.maxVisible;
    }
    for (const state of candidates) draw(state);
  }

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      states.clear();
      candidates.length = 0;
      free.length = 0;
      made.length = 0;
      layer.remove();
    },
  };
}
