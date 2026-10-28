import { GAME_DATA } from "./game-data.js";
// Phone vibration for the moments that matter (data/haptics.json: event rules -> millisecond patterns, the rate limit, strength levels,
// the menu text). Presentation only: it reads events and writes no game state, so it cannot change a fight, a save or the server.
// The loop calls observe(events, game) just before and just after each step (same seam as the pickup flash, because stepGame resets
// g.events), so it never polls the game itself. navigator.vibrate exists on Android browsers only; where it is missing (iOS Safari,
// some desktops) every call is a no-op and the menu controls stay hidden. Never buzzes in a hidden tab or when the user prefers
// reduced motion. ?<offParam>=0 switches it off for a session. Settings live in one localStorage key, every access in try/catch.
export function createHaptics({
  data = GAME_DATA.haptics,
  nav = globalThis.navigator,
  doc = globalThis.document,
  win = globalThis,
  listen,
} = {}) {
  const supported = typeof nav?.vibrate === "function",
    seen = new WeakMap(), // events array -> how many of its events were already looked at
    levels = new Map(data.intensityLevels.map((l) => [l.id, l.scale])),
    forcedOff = new URLSearchParams(win.location?.search ?? "").get(data.offParam) === "0",
    saved = readSaved();
  let enabled = saved.enabled ?? data.enabledDefault,
    intensity = levels.has(saved.intensity) ? saved.intensity : data.intensityDefault,
    lastAt = -Infinity,
    lastHeart = -Infinity,
    busyUntil = 0,
    busyPriority = -Infinity;
  const offs = [],
    attach = listen ?? ((target, type, handler) => target.addEventListener(type, handler));
  function cancel() {
    try {
      if (supported) nav.vibrate(0);
    } catch {}
  }

  function readSaved() {
    try {
      const raw = win.localStorage?.getItem(data.storageKey);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }
  function save() {
    try {
      win.localStorage?.setItem(data.storageKey, JSON.stringify({ enabled, intensity }));
    } catch {}
  }
  const allowed = () =>
    supported &&
    enabled &&
    !forcedOff &&
    !doc?.hidden &&
    !win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  // Vibrate durations (even positions) scale with the strength level; the gaps between them stay as written.
  function scaled(pattern) {
    const scale = levels.get(intensity);
    let buzz = true;
    return pattern.map((ms) => {
      const value = buzz ? Math.ceil(ms * scale) : ms;
      buzz = !buzz;
      return value;
    });
  }
  function fire(pattern, priority, now, { bypassGap = false } = {}) {
    if (!allowed()) return false;
    if (!bypassGap && now - lastAt < data.minGapMs) return false;
    if (now < busyUntil && priority <= busyPriority) return false; // a stronger pattern is still playing
    const out = scaled(pattern);
    try {
      nav.vibrate(out);
    } catch {
      return false;
    }
    lastAt = now;
    busyUntil = now + out.reduce((sum, ms) => sum + ms, 0);
    busyPriority = priority;
    return true;
  }
  function matches(rule, event, player) {
    if (!rule.on.includes(event?.type)) return false;
    const mine = event.actor === player;
    if (rule.actor === "player" ? !mine : rule.actor === "enemy" ? mine || !event.actor : false) return false;
    if (!!rule.blocked !== !!event.blocked) return false;
    if (rule.finisher && !event.actor?.finisher) return false;
    return rule.minAmount === undefined || (event.amount ?? 0) >= rule.minAmount;
  }
  function render() {
    const button = doc?.getElementById?.("haptics"),
      select = doc?.getElementById?.("haptics-intensity");
    if (button) {
      button.textContent = enabled ? data.text.on : data.text.off;
      button.setAttribute("aria-pressed", String(enabled));
    }
    if (select) select.value = intensity;
  }
  function bind() {
    const button = doc?.getElementById?.("haptics"),
      select = doc?.getElementById?.("haptics-intensity");
    if (!button) return;
    const label = doc.getElementById("haptics-label");
    if (label) label.textContent = data.text.intensityLabel;
    for (const node of [button, select, label]) if (node) node.hidden = !supported || forcedOff;
    if (select && !select.options.length)
      for (const l of data.intensityLevels) select.add(new win.Option(data.text.levels[l.id], l.id));
    const on = (node, type, handler) => {
      attach(node, type, handler);
      offs.push(() => node.removeEventListener(type, handler));
    };
    on(button, "click", () => api.setEnabled(!enabled, performance.now()));
    if (select) on(select, "change", () => api.setIntensity(select.value, performance.now()));
    render();
  }
  const api = {
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    },
    get intensity() {
      return intensity;
    },
    setEnabled(value, now = performance.now()) {
      enabled = !!value;
      save();
      render();
      if (enabled) fire(data.previewPattern, Infinity, now, { bypassGap: true });
      else cancel();
    },
    setIntensity(id, now = performance.now()) {
      if (!levels.has(id)) return;
      intensity = id;
      save();
      render();
      fire(data.previewPattern, Infinity, now, { bypassGap: true });
    },
    // Looks only at events it has not seen in that array yet; the strongest matching rule of the batch vibrates once.
    observe(events, game, now = performance.now()) {
      if (!supported || !events) return false;
      const fresh = events.slice(seen.get(events) ?? 0);
      seen.set(events, events.length);
      let best = null;
      for (const event of fresh)
        for (const rule of data.rules)
          if ((!best || rule.priority > best.priority) && matches(rule, event, game?.player)) best = rule;
      if (best) return fire(best.pattern, best.priority, now, { bypassGap: best.bypassGap });
      const low = data.lowHealth,
        p = game?.player;
      if (low.enabled && p && p.hp > 0 && p.hp / p.maxHP <= low.fraction && now - lastHeart >= low.intervalMs) {
        lastHeart = now;
        return fire(low.pattern, 0, now);
      }
      return false;
    },
    dispose() {
      for (const off of offs.splice(0)) off();
      cancel();
    },
  };
  if (doc?.addEventListener) {
    const stop = () => {
      if (doc.hidden) cancel();
    };
    attach(doc, "visibilitychange", stop);
    offs.push(() => doc.removeEventListener("visibilitychange", stop));
  }
  bind();
  return api;
}
