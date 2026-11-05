import { GAME_DATA } from "./game-data.js";
// Game feel (data/gameFeel.json): a brief hit-stop on heavy events, a trauma-style camera shake, and the View zoom preset.
// Hit-stop: the loop multiplies the frame's seconds by tick(), once, next to the death-cam scale. Simulation steps stay a fixed 1/60 and
// only stop being fed, so no step, seed or saved number changes; a scripted loop.step() is never frozen. Overlaps take the longest, not the sum.
// Shake: linear decay to 0 from the event's magnitude; overlaps keep the larger current amplitude. Effects.render adds the offset to the
// world camera only (the HUD is DOM). Feedback High/Low/Off (the menu select) scales both, Off and prefers-reduced-motion zero them.
// The zoom preset is stored per device (localStorage, every access in try/catch) and the loop writes it to world.viewZoomMultiplier.
const TAU = Math.PI + Math.PI;
const flagged = (entity, flags) => !!entity && flags.some((f) => !!entity[f]);

export function createGameFeel({
  data = GAME_DATA.gameFeel,
  doc = globalThis.document,
  win = globalThis,
  listen,
  mode,
  reduced,
} = {}) {
  const presets = new Map(data.view.presets.map((p) => [p.id, p.multiplier])),
    cooldowns = new Map(),
    out = { x: 0, y: 0 },
    offs = [],
    attach = listen ?? ((target, type, handler) => target.addEventListener(type, handler));
  const readMode = () => {
    const value = mode ? mode() : (doc?.getElementById?.("feedback-mode")?.value ?? "high");
    return Object.hasOwn(data.modeScale, value) ? value : "low"; // an unknown value falls to Low, as effects.configureFeedback does
  };
  const isReduced = () => !!(reduced ? reduced() : win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  // 0 when feedback is Off or motion is reduced, so every output below is exactly zero then.
  const scale = () => (isReduced() ? 0 : data.modeScale[readMode()]);
  let preset = readPreset(),
    clock = 0,
    stopLeft = 0,
    magnitude = 0,
    seconds = 1,
    age = 0;

  function readPreset() {
    try {
      const saved = win.localStorage?.getItem(data.view.storageKey);
      return presets.has(saved) ? saved : data.view.default;
    } catch {
      return data.view.default;
    }
  }
  function savePreset() {
    try {
      win.localStorage?.setItem(data.view.storageKey, preset);
    } catch {}
  }
  const amplitude = () => (magnitude > 0 ? magnitude * Math.max(0, 1 - age / seconds) : 0);
  function clear() {
    stopLeft = magnitude = age = 0;
  }
  function matches(rule, event, game) {
    if (!rule.on.includes(event?.type)) return false;
    const player = game?.player,
      mine = !!player && event.actor === player;
    if (rule.victim === "player" ? !mine : rule.victim === "enemy" ? mine || !event.actor : false) return false;
    if (rule.blocked !== undefined && !!event.blocked !== rule.blocked) return false;
    if (rule.minAmount !== undefined && !((event.amount ?? 0) > rule.minAmount)) return false;
    if (
      rule.overHpShare !== undefined &&
      !(event.actor?.maxHP > 0 && event.amount > rule.overHpShare * event.actor.maxHP)
    )
      return false;
    if (rule.flags && !flagged(event.actor, rule.flags)) return false;
    if (
      rule.attackerFlags &&
      !flagged(
        game?.enemies?.find((e) => e.id === event.attackerId),
        rule.attackerFlags,
      )
    )
      return false;
    if (rule.excludeWeapons?.includes(event.weapon)) return false;
    if (rule.range !== undefined && event.position && player?.pos)
      if (Math.hypot(event.position.x - player.pos.x, event.position.z - player.pos.z) > rule.range) return false;
    return true;
  }
  function select() {
    const el = doc?.getElementById?.("view-preset");
    if (el) el.value = preset;
  }
  function bind() {
    const el = doc?.getElementById?.("view-preset"),
      label = doc?.getElementById?.("view-preset-label");
    if (!el) return;
    if (label) label.textContent = data.text.viewLabel;
    if (el.options && win.Option && !el.options.length)
      for (const p of data.view.presets) el.add(new win.Option(data.text.presets[p.id], p.id));
    const onChange = () => api.setPreset(el.value);
    attach(el, "change", onChange);
    offs.push(() => el.removeEventListener?.("change", onChange));
    select();
  }
  const api = {
    // Looks at one step's events. Returns true when anything was started. Nothing is recorded while feedback is Off or motion is reduced.
    observe(events, game) {
      const level = scale();
      if (!level || !events?.length) return false;
      let started = false;
      for (const event of events)
        for (const rule of data.rules) {
          if (!matches(rule, event, game)) continue;
          if (rule.cooldown && clock - (cooldowns.get(rule.id) ?? -Infinity) < rule.cooldown) continue;
          if (rule.cooldown) cooldowns.set(rule.id, clock);
          if (rule.hitStop) stopLeft = Math.max(stopLeft, Math.min(rule.hitStop, data.hitStopCapSeconds) * level);
          if (rule.shake && rule.shake.magnitude >= amplitude()) {
            magnitude = rule.shake.magnitude;
            seconds = rule.shake.seconds;
            age = 0;
          }
          started = true;
        }
      return started;
    },
    // Real seconds of one frame -> the share of it that runs (1 = full speed). A menu, travel or a scripted step clears everything.
    tick(realSeconds, { paused = false, scripted = false } = {}) {
      const dt = Number.isFinite(realSeconds) ? Math.max(0, realSeconds) : 0;
      if (paused) {
        clear();
        return 1;
      }
      clock += dt;
      age += dt;
      if (!scale() || scripted) stopLeft = 0;
      if (!(stopLeft > 0) || !(dt > 0)) return 1;
      const frozen = Math.min(stopLeft, dt);
      stopLeft -= frozen;
      return 1 - frozen / dt;
    },
    // Camera offset in screen pixels for this frame (a shared object: copy it if it must outlive the call).
    shake() {
      const level = scale() * amplitude() * data.shake.pixelsPerUnit;
      if (!level) {
        out.x = out.y = 0;
        return out;
      }
      out.x = level * Math.sin(TAU * data.shake.frequencyX * clock);
      out.y = level * Math.cos(TAU * data.shake.frequencyY * clock);
      return out;
    },
    // Never below 1: the world floors its zoom at 1 so the finite painting keeps covering the screen.
    viewZoom: () => Math.max(1, presets.get(preset)),
    get preset() {
      return preset;
    },
    get hitStopSeconds() {
      return stopLeft;
    },
    get shakeAmplitude() {
      return amplitude() * scale();
    },
    setPreset(next) {
      if (!presets.has(next)) return false;
      preset = next;
      savePreset();
      select();
      return true;
    },
    reset() {
      clear();
      cooldowns.clear();
    },
    dispose() {
      for (const off of offs.splice(0)) off();
      api.reset();
    },
  };
  bind();
  return api;
}
