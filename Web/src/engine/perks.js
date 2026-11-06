import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { TRASH_WAVE, wavesEnabled } from "./trash-wave-core.js";
import { activeDay, seededRandom } from "./spawn-variation.js";
import { claimContractBonus, contractBonusReady } from "./daily-contract.js";

// WAVE PERKS (data/perks.json). Opt-in with the waves: with ?waves=1 off (the default) nothing here creates state or touches a stat.
// On: every everyWaves-th wave clear offers a few different perks; one is taken by tap, click or the 1-2-3 keys (the first is taken when
// the offer is ignored for autoPickSeconds) and the game never stops. Perks are session-only run modifiers held on the live game (g.perks):
// never saved, never sent. The effects go through the stat paths that already exist; each hook below is read where that stat is used and
// returns its input unchanged until a perk of that kind is taken. A max-HP perk is bonus HP (`shield`) because the run save checks the
// player's maxHP against the progression model.
export const PERKS = GAME_DATA.perks;
const EPS = 1e-8;
const neutral = (rules, stat) => (rules.stats[stat].mode === "mul" ? 1 : 0);

// The page switch is the waves' (trashWave.json startSwitch). `search` is for tests.
export const perksEnabled = (search = undefined) => wavesEnabled(TRASH_WAVE, search);

function newState(rules) {
  const mods = {};
  for (const stat of Object.keys(rules.stats)) mods[stat] = neutral(rules, stat);
  return { picks: {}, granted: 0, offer: null, mods, shield: 0, credit: 0, dropRand: null };
}

const pickTotal = (state) => Object.values(state.picks).reduce((n, v) => n + v, 0);

// Up to `choices` different perks that can still stack, drawn by a day-seeded shuffle (offer number n always draws the same on a given day).
// The Contract bonus offer (daily-contract.js) is drawn the same way with the number of picks so far added to the seed.
function draw(state, rules, bonus = false) {
  const ids = rules.perks.filter((p) => (state.picks[p.id] ?? 0) < p.maxStacks).map((p) => p.id),
    take = Math.min(rules.choices, ids.length),
    parts = [activeDay() ?? rules.seed.fallbackDay, rules.seed.salt, state.granted],
    random = seededRandom((bonus ? [...parts, pickTotal(state)] : parts).join(rules.seed.separator));
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return take ? { ids: ids.slice(0, take), left: rules.autoPickSeconds, total: rules.autoPickSeconds, bonus } : null;
}

// Takes `id` from the open offer. Returns false (and changes nothing) when there is no offer or it is not one of the offered, so a tap,
// a key and the timer can all arrive and the perk still counts once.
export function pickPerk(g, id, rules = PERKS) {
  const state = g.perks,
    offer = state?.offer,
    perk = offer?.ids.includes(id) ? rules.perks.find((p) => p.id === id) : null;
  if (!perk) return false;
  state.offer = null;
  state.picks[id] = (state.picks[id] ?? 0) + 1;
  const mods = state.mods,
    p = g.player;
  mods[perk.stat] = rules.stats[perk.stat].mode === "mul" ? mods[perk.stat] * perk.value : mods[perk.stat] + perk.value;
  if (perk.stat === "shield") {
    state.shield = mods.shield; // the bonus HP starts full
    if (p.hp > 0) p.hp = Math.min(p.maxHP, p.hp + perk.value);
  }
  if (perk.stat === "staminaRegen") p.staminaRegen = (p.staminaRegen ?? 1) * perk.value; // the player's own multiplier, once per pick
  g.message = webText("perk.picked", { name: perk.name });
  g.messageUntil = g.time + rules.messageSeconds;
  // The Contract bonus (all three daily goals cleared this session): the first pick after it is earned is followed by one free extra offer.
  const extra = !offer.bonus && contractBonusReady() ? draw(state, rules, true) : null;
  if (extra && claimContractBonus()) state.offer = extra;
  return true;
}

// One step, called once a frame with the session's waves cleared so far and the frame's seconds (0 while the game is held).
// An offer opens for each everyWaves waves cleared, one at a time. Returns the perk state (null while there is none).
export function stepPerks(g, cleared, dt, rules = PERKS, search = undefined) {
  if (!perksEnabled(search)) return null;
  let state = g.perks ?? null;
  if (g.finished || g.player.hp <= 0) {
    if (state) state.offer = null;
    return state;
  }
  const due = Math.floor(cleared / rules.everyWaves);
  if (!state && due === 0) return null;
  state ??= g.perks = newState(rules);
  if (!state.offer && due > state.granted) {
    state.granted++;
    state.offer = draw(state, rules);
  }
  if (state.offer) {
    state.offer.left -= dt;
    if (state.offer.left <= 0) pickPerk(g, state.offer.ids[0], rules);
  }
  return state;
}

// Hooks. Each reads g.perks only; with no perk taken every one returns its input.
export const perkDamage = (g, amount) => (g.perks ? amount * g.perks.mods.damage : amount); // cursed-relic.js cursedDamage: every player hit
export const perkMove = (g) => g.perks?.mods.moveSpeed ?? 1; // combat.js: the walking and sprinting speed scale
export const perkReload = (g, seconds) => (g.perks ? seconds * g.perks.mods.reload : seconds); // combat.js: the rifle's reload seconds

// The pistol profile (selectedPistolProfile) with its reload scaled; the same object while no reload perk is taken, and one copy per mod.
const scaled = new WeakMap();
export function perkPistol(g, profile) {
  const mod = g.perks?.mods.reload ?? 1;
  if (mod === 1) return profile;
  const hit = scaled.get(profile);
  if (hit?.mod === mod) return hit.profile;
  const copy = { ...profile, reload: profile.reload * mod };
  scaled.set(profile, { mod, profile: copy });
  return copy;
}

// A hit on the player (combat.js knifeReceive): the bonus HP takes it first. Returns what is left for health.
export function perkAbsorb(g, amount) {
  const state = g.perks;
  if (!state || state.shield <= 0 || !(amount > 0)) return amount;
  const taken = Math.min(state.shield, amount);
  state.shield -= taken;
  return amount - taken;
}

// The pistol fired (combat.js, after stepPistol): a magazine perk gives a share of a round back with every shot, so the magazine lasts
// that much longer. `before` is the magazine count before the step; it never ends higher than that, so the saved pistol state still
// passes its own capacity check.
export function perkShot(g, before, result) {
  const state = g.perks,
    extra = state?.mods.magazine;
  if (!extra || !result.events.some((e) => e.type === "shot")) return;
  state.credit += extra / (1 + extra);
  if (state.credit + EPS < 1) return;
  state.credit -= 1;
  result.state.magazine = Math.min(before, result.state.magazine + 1);
}

// A wave was cleared (trash-wave-rewards.js payClear): the bonus HP refills; returns the multiplier for the wave-clear heal.
export function perkOnClear(g) {
  const state = g.perks;
  if (!state) return 1;
  state.shield = state.mods.shield;
  return state.mods.waveHeal;
}

// An ordinary wave kill (not the elite or the last of its wave): true by the dropChance perk's chance. Its own seeded stream, so it never
// disturbs the wave's spawn stream. The caller still applies the per-wave cap and spacing.
export function perkDropRoll(g, rules = PERKS) {
  const state = g.perks,
    chance = state?.mods.dropChance;
  if (!chance) return false;
  state.dropRand ??= seededRandom(
    [activeDay() ?? rules.seed.fallbackDay, rules.seed.salt, rules.seed.dropSalt].join(rules.seed.separator),
  );
  return state.dropRand() < chance;
}

const inert = { frame() {}, dispose() {} };

// The pick overlay (index.html #perk-pick, #perk-status): a few cards built once and reused for every offer. Cards are buttons; the 1-2-3
// keys take the card of that number (captured before the weapon keys while an offer is open). `listen` is the session's owner registry.
export function createPerkPicker({ doc = globalThis.document, listen, rules = PERKS } = {}) {
  const el = (id) => (typeof doc?.getElementById === "function" ? doc.getElementById(id) : null),
    root = el("perk-pick"),
    heading = el("perk-heading"),
    row = el("perk-cards"),
    bar = el("perk-bar"),
    status = el("perk-status");
  if (!root || !heading || !row || !bar || !status) return inert;
  let game = null,
    shown = null,
    lastStatus = "",
    lastLeft = -1;
  const cards = Array.from({ length: rules.choices }, (_, i) => {
    const card = doc.createElement("button"),
      key = doc.createElement("b"),
      name = doc.createElement("span"),
      text = doc.createElement("small");
    card.type = "button";
    card.className = "perk-card";
    key.className = "perk-key";
    key.textContent = String(i + 1);
    name.className = "perk-name";
    text.className = "perk-text";
    card.append(key, name, text);
    card.onclick = () => take(i);
    row.append(card);
    return { card, name, text };
  });
  function take(index) {
    const id = game?.perks?.offer?.ids[index];
    if (id) pickPerk(game, id, rules);
  }
  function onKey(event) {
    if (!shown || event.ctrlKey || event.metaKey || event.altKey) return;
    const index = cards.findIndex((_, i) => event.key === String(i + 1));
    if (index < 0 || !game?.perks?.offer?.ids[index]) return;
    event.preventDefault();
    event.stopImmediatePropagation(); // the same digits switch weapons: while an offer is open they pick
    if (!event.repeat) take(index);
  }
  listen?.(globalThis.window ?? doc, "keydown", onKey, { capture: true });
  function show(offer) {
    heading.textContent = webText(offer.bonus ? "perk.headingBonus" : "perk.heading");
    cards.forEach((c, i) => {
      const perk = rules.perks.find((p) => p.id === offer.ids[i]);
      c.card.hidden = !perk;
      c.name.textContent = perk?.name ?? "";
      c.text.textContent = perk?.text ?? "";
    });
    root.hidden = false;
    shown = offer;
  }
  return {
    // Every frame, with the live game: shows the open offer (and its countdown) or hides the card, and keeps the perks line.
    frame(g) {
      game = g;
      const offer = g.perks?.offer ?? null;
      if (offer && shown !== offer) show(offer);
      else if (!offer && shown) {
        root.hidden = true;
        shown = null;
        lastLeft = -1;
      }
      if (offer) {
        const left = Math.max(0, offer.left / offer.total);
        if (left !== lastLeft) bar.style.setProperty("--left", String(left));
        lastLeft = left;
      }
      const s = g.perks,
        count = s ? Object.values(s.picks).reduce((n, v) => n + v, 0) : 0,
        line = !count
          ? ""
          : webText(s.mods.shield > 0 ? "perk.statusShield" : "perk.status", { count, shield: Math.ceil(s.shield) });
      if (line !== lastStatus) {
        status.textContent = line;
        status.hidden = !line;
        lastStatus = line;
      }
    },
    dispose() {
      root.hidden = true;
    },
  };
}
