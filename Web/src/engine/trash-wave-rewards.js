import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { healPlayer, refillAmmo } from "./world-pickups-core.js";
import { TRASH_WAVE, liveWaveMobs, wavesEnabled } from "./trash-wave-core.js";
import { perkDropRoll, perkOnClear } from "./perks.js";

// What a wave mob's death is worth (data/trashWave.json rewards and drops). All of it is in-run and client-only: a session score that is
// never cash and never saved, the wave-clear heal and ammo top-up, and at most `drops.maxPerWave` coin drops per wave (the elite and the
// last mob killed). Wave mobs have no placement key, so progression awards, the respawn record and the loot ledger never see them.
const notify = (g, text, rules) => {
  g.message = text;
  g.messageUntil = g.time + rules.messageSeconds;
};

// A wave's mobs still waiting in the spawn queue (a wave is only cleared once its last mob has been spawned and killed).
function queued(state, waveId) {
  for (let i = 0; i < state.queue.length; i++) if (state.queue[i].wave === waveId) return true;
  return false;
}

// The wave is cleared: heal the combatRules waveClearHeal amount, top the ammo up and add the clear score. Returns the HP given.
function payClear(g, state, waveId, rules) {
  const p = g.player,
    perked = perkOnClear(g); // the perks: bonus HP refills, the Field Medic perk multiplies the heal
  let hp = 0;
  if (p.hp > 0) {
    hp = Math.ceil(healPlayer(p, (GAME_DATA.combatRules.legacy.waveClearHeal / p.maxHP) * perked));
    if (rules.rewards.refillAmmo) refillAmmo(g);
  }
  state.score += rules.rewards.score.clearBase + rules.rewards.score.clearPerWave * waveId;
  state.cleared++;
  g.events.push({ type: "trash-wave-clear", wave: waveId, hp, score: state.score });
  notify(g, webText("wave.cleared", { wave: waveId, hp, score: state.score }), rules);
}

// Keeps the newest `corpseKeep` wave corpses: the pilot game never prunes its corpse list, and a long run of waves would grow it forever.
function trimCorpses(g, rules) {
  if (!g.corpses) return;
  let n = 0;
  for (let i = 0; i < g.corpses.length; i++) if (g.corpses[i].waveMob === true) n++;
  if (n <= rules.spawn.corpseKeep) return;
  let drop = n - rules.spawn.corpseKeep;
  g.corpses = g.corpses.filter((c) => !(c.waveMob === true && drop-- > 0));
}

// Called once for every wave mob that dies (from kill-drops.js leaveKillDrops, which reads the step's death events; the mob is already out
// of g.enemies). Adds the kill score, pays the clear reward when this was the wave's last mob, and returns true when the kill may leave
// a coin drop: the elite, or the last mob of its wave, at most maxPerWave per wave and minSecondsBetween apart so the server claim queue
// (about 12 claims a minute) cannot back up. Returns false and does nothing when waves are off.
export function onWaveKill(g, mob, rules = TRASH_WAVE, search = undefined) {
  const state = g.trashWave;
  if (!state || mob?.waveMob !== true || !wavesEnabled(rules, search)) return false;
  const tally = (state.tally[mob.waveId] ??= { paid: 0, cleared: false });
  state.score += mob.elite ? rules.rewards.score.perEliteKill : rules.rewards.score.perKill;
  state.kills++;
  const last = liveWaveMobs(g.enemies, mob.waveId) === 0 && !queued(state, mob.waveId);
  if (last && !tally.cleared) {
    tally.cleared = true;
    payClear(g, state, mob.waveId, rules);
  }
  trimCorpses(g, rules);
  const d = rules.drops;
  if (
    !d.enabled ||
    !(mob.elite || last || perkDropRoll(g)) ||
    tally.paid >= d.maxPerWave ||
    g.time - state.lastDropAt < d.minSecondsBetween
  )
    return false;
  tally.paid++;
  state.lastDropAt = g.time;
  return true;
}
