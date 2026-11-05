import { GAME_DATA } from "./game-data.js";
// Floating damage numbers and the hurt vignette (data/damageFeedback.json). Reads the game's existing "hit" events (effects.js hands them
// over), so it adds no combat logic: a hit on an enemy that the player dealt becomes a number that rises and fades; a hit on the player
// flashes a red edge vignette, and low health keeps a pulsing one on. All DOM is created here and removed by dispose().
// The host supplies the two pieces that depend on the 3D scene: aim(actor, event, game) -> {x, y, z} (a render-space point above the
// victim) and project(x, y, z, out) -> boolean (writes the screen pixel into out, false when the point is off screen).
// Every time is in seconds and moves only by the dt given to advance().

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// A number's size step: how many tenths of the target's health the hit took (sizeSteps tenths at most).
export const sizeSteps = (amount, maxHP, rules) =>
  maxHP > 0 ? clamp(Math.floor((rules.sizeSteps * amount) / maxHP), 0, rules.sizeSteps) : 0;

// Font size in pixels: the base for phone or desktop plus sizeStepPx for every step.
export const numberPx = (steps, rules, desktop) =>
  (desktop ? rules.basePx.desktop : rules.basePx.phone) + rules.sizeStepPx * steps;

// White through orange to red-orange: the ramp's colours spread evenly over the size steps.
export function rampColour(steps, rules) {
  const last = rules.colourRamp.length - 1,
    at = (clamp(steps, 0, rules.sizeSteps) / rules.sizeSteps) * last,
    i = Math.min(last - 1, Math.floor(at));
  return css(mix(rules.colourRamp[i], rules.colourRamp[i + 1], at - i));
}

// The big-hit pop: from `from` at birth up to `peak` and back to `end` across the first lifeShare of the life.
export function critScale(age, life, rules) {
  const span = life * rules.lifeShare;
  if (age >= span) return rules.end;
  const peakAt = span * rules.peakShare;
  return age < peakAt
    ? rules.from + ((rules.peak - rules.from) * age) / peakAt
    : rules.peak + ((rules.end - rules.peak) * (age - peakAt)) / (span - peakAt);
}

// The Quake damage blend: alpha grows with health lost (never less than minCount of the divided loss), up to maxAlpha.
export function flashAlpha(hpLost, rules, reduced = false) {
  const alpha = Math.min(
    rules.maxAlpha,
    (rules.gain * Math.max(rules.minCount, hpLost / rules.hpLostDivisor)) / rules.scale,
  );
  return alpha * (reduced ? rules.reducedScale : 1);
}

// Pulses per second below the low-health line: slow at the line, quicker as health falls. 0 when not low or dead.
export function lowHealthCycles(hp, maxHP, rules) {
  if (!(hp > 0) || !(maxHP > 0) || hp / maxHP >= rules.hpShare) return 0;
  return rules.cyclesGain * (rules.cyclesFrom - hp / maxHP);
}

// A hit is a big one when it reaches critMultiple times the smallest non-lethal hit this weapon has dealt, or when it kills with a
// finisher or a star. Combat has no crit roll, so "normal damage" is learned from the hits themselves (progression and relics included).
export function isBigHit(amount, baseline, killed, actor, rules) {
  if (killed && (actor.finisher || actor.star)) return true;
  return baseline > 0 && amount >= baseline * rules.critMultiple;
}

// Opacity to three decimals, so an unchanged level writes an identical string and the DOM is left alone.
const round = (v) => Math.round(v * 1000) / 1000;

export function createDamageFeedback({
  doc,
  aim,
  project,
  data = GAME_DATA.damageFeedback,
  reducedMotion = () => false,
  isDesktop = () => !!doc.body.classList?.contains?.("desktop-ui") && !doc.body.classList.contains("touch"),
}) {
  const rules = data.numbers,
    flash = data.vignette.flash,
    low = data.vignette.low,
    layer = doc.createElement("div"),
    hurt = doc.createElement("div"),
    pulse = doc.createElement("div"),
    slots = [],
    baselines = new Map(),
    point = { x: 0, y: 0 };
  let flashLevel = 0,
    phase = 0,
    cycles = 0,
    sequence = 0,
    flashWritten = -1,
    lowWritten = "";
  layer.className = "damage-layer";
  hurt.className = "hurt-vignette";
  pulse.className = "hurt-vignette";
  for (const el of [hurt, pulse]) el.hidden = true;
  hurt.style.color = css(flash.rgb);
  for (const el of [layer, hurt, pulse]) el.setAttribute("aria-hidden", "true");
  doc.body.append(layer, hurt, pulse);

  const live = (s, targetId) => s.active && s.targetId === targetId;
  // A free slot, a new one while under the cap, or else the number nearest the end of its life gives way.
  function claim() {
    const free = slots.find((s) => !s.active);
    if (free) return free;
    if (slots.length >= rules.cap) return slots.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
    const el = doc.createElement("span");
    el.className = "damage-number";
    el.hidden = true;
    layer.append(el);
    const slot = { el, active: false, text: "", transform: "", opacity: "", colour: "", size: "" };
    slots.push(slot);
    return slot;
  }

  function show(s, amount, big, maxHP) {
    s.amount += amount;
    s.big ||= big;
    const text = String(Math.max(rules.minimumShown, Math.round(s.amount))),
      steps = sizeSteps(s.amount, maxHP, rules);
    s.px = numberPx(steps, rules, isDesktop());
    const colour = s.big ? css(rules.critColour) : rampColour(steps, rules),
      size = `${s.px}px`;
    if (text !== s.text) s.el.textContent = s.text = text;
    if (colour !== s.colour) s.el.style.color = s.colour = colour;
    if (size !== s.size) s.el.style.fontSize = s.size = size;
  }

  function spawn(event, game) {
    const actor = event.actor,
      killed = actor.hp <= 0,
      key = event.weapon ?? "",
      known = baselines.get(key),
      big = isBigHit(event.amount, known, killed, actor, rules),
      maxHP = actor.maxHP > 0 ? actor.maxHP : actor.hp + event.amount;
    if (!killed && !(known <= event.amount)) baselines.set(key, event.amount);
    let s = slots.find((x) => live(x, actor.id) && x.age < rules.mergeSeconds);
    if (!s) {
      // A target already carrying its fill of numbers shows no more until one ends.
      if (slots.filter((x) => live(x, actor.id)).length >= rules.perTargetCap) return;
      s = claim();
      const where = aim(actor, event, game);
      s.targetId = actor.id;
      s.x = where.x;
      s.y = where.y;
      s.z = where.z;
      s.age = 0;
      s.amount = 0;
      s.big = false;
      s.px = 0;
      s.seq = sequence++;
      s.reduced = !!reducedMotion();
      s.life = s.reduced ? rules.reducedLifeSeconds : rules.lifeSeconds;
      s.active = true;
      s.el.hidden = false;
    }
    show(s, event.amount, big, maxHP);
  }

  function wound(hpLost, reduced) {
    const cap = flash.maxAlpha * (reduced ? flash.reducedScale : 1);
    flashLevel = Math.min(cap, flashLevel + flashAlpha(hpLost, flash, reduced));
  }

  const playerDealt = (event, game) =>
    event.actor &&
    event.actor !== game.player &&
    !event.blocked &&
    event.amount > 0 &&
    (event.attackerId ?? game.player.id) === game.player.id;

  return {
    // Reads this step's hit events.
    observe(game) {
      for (const event of game.events) {
        if (event.type !== "hit") continue;
        if (event.actor === game.player) {
          if (event.amount > 0) wound(event.amount, !!reducedMotion());
        } else if (playerDealt(event, game)) spawn(event, game);
      }
    },
    // Ages the numbers and moves the flash and the pulse on; a paused game does not move them.
    advance(dt, paused = false) {
      if (paused || !(dt > 0)) return;
      for (const s of slots)
        if (s.active) {
          s.age += dt;
          if (s.age >= s.life) {
            s.active = false;
            s.el.hidden = true;
          }
        }
      flashLevel = Math.max(0, flashLevel - (flash.decayCount / flash.scale) * dt);
      phase += cycles * dt;
    },
    // Writes the DOM: each live number's place, size pop, rise and fade, and the two vignettes.
    layout(player) {
      const reduced = !!reducedMotion();
      for (const s of slots) {
        if (!s.active) continue;
        const on = project(s.x, s.y, s.z, point);
        s.el.hidden = !on;
        if (!on) continue;
        // Newer numbers on the same target sit lower; each older one is pushed up by their heights and a gap.
        let stack = 0;
        for (const o of slots)
          if (o.active && o.targetId === s.targetId && o.seq > s.seq) stack += o.px + rules.stackGapPx;
        let scale = 1;
        if (!s.reduced)
          scale = s.big
            ? critScale(s.age, s.life, rules.critScale)
            : 1 + (rules.popPx * Math.max(0, 1 - s.age / rules.popSeconds)) / s.px;
        const rise = s.reduced ? 0 : rules.risePxPerSecond * s.age,
          fade = Math.min(1, (s.life - s.age) / Math.min(rules.fadeSeconds, s.life)),
          top = Math.round(point.y - rules.startLiftPx - rise - stack),
          transform = `translate(${Math.round(point.x)}px,${top}px) translate(-50%,-100%) scale(${round(scale)})`,
          opacity = String(round(rules.alpha * fade));
        if (transform !== s.transform) s.el.style.transform = s.transform = transform;
        if (opacity !== s.opacity) s.el.style.opacity = s.opacity = opacity;
      }
      if (flashLevel !== flashWritten) {
        flashWritten = flashLevel;
        hurt.hidden = !(flashLevel > 0);
        hurt.style.opacity = String(round(flashLevel));
      }
      cycles = lowHealthCycles(player.hp, player.maxHP, low);
      if (!(cycles > 0)) {
        if (lowWritten) pulse.hidden = true;
        lowWritten = "";
        return;
      }
      const wave = Math.sin(Math.PI * phase),
        colour = css(mix(low.dark, low.light, reduced ? low.staticMix : wave * wave));
      if (colour === lowWritten) return;
      lowWritten = colour;
      pulse.hidden = false;
      pulse.style.color = colour;
      pulse.style.opacity = String(low.opacity);
    },
    reset() {
      for (const s of slots) {
        s.active = false;
        s.el.hidden = true;
      }
      flashLevel = 0;
      flashWritten = -1;
    },
    dispose() {
      layer.remove();
      hurt.remove();
      pulse.remove();
      slots.length = 0;
      baselines.clear();
    },
    // What a test or a debug overlay can see without touching the DOM.
    snapshot() {
      return {
        numbers: slots
          .filter((s) => s.active)
          .map((s) => ({ targetId: s.targetId, text: s.text, big: s.big, age: s.age, life: s.life, px: s.px })),
        slots: slots.length,
        flash: flashLevel,
        cycles,
        phase,
      };
    },
  };
}
