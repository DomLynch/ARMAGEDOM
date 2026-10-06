import {initializeAreaResidents} from './combat.js';
// Thin orchestration for the existing three-area pilot. World owns atomic loading.
export async function travelTo(game, request) {
  const previous = game.world.areaId,
    position = await game.world.loadArea(request.areaId, request.entryPoint);
  // Load succeeds before any source fight/player state is changed.
  game.areaFights ??= {};
  for (const e of game.enemies) e.swing = null;
  game.areaFights[previous] = {
    initialized: !!game.areaInitialized, cleared: !!game.encounterCleared,
    enemies: game.enemies, corpses: game.corpses, bolts: game.bolts, loot: game.loot,
    wave: game.wave, nextWave: game.nextWave, nextEnemyAttackAt: game.nextEnemyAttackAt,
    parkedAt: game.time,
  };
  const parked = game.areaFights[request.areaId];
  game.enemies = parked?.enemies ?? [];
  if (game.corpses) game.corpses = parked?.corpses ?? [];
  game.bolts = parked?.bolts ?? [];
  game.loot = parked?.loot ?? [];
  game.areaInitialized = parked?.initialized ?? false;
  game.encounterCleared = parked?.cleared ?? false;
  game.encounterActive = !game.encounterCleared && (game.areaResidents || request.areaId === 'westminster');
  game.wave = parked?.wave ?? (game.areaResidents ? 0 : game.wave);
  game.nextWave = parked?.nextWave ?? game.time + 2;
  game.nextEnemyAttackAt = parked?.nextEnemyAttackAt ?? game.time;
  if (parked) {
    const elapsed = game.time - parked.parkedAt;
    for (const field of ['nextWave', 'nextEnemyAttackAt'])
      if (Number.isFinite(game[field])) game[field] += elapsed;
    for (const e of [...game.enemies, ...(game.corpses ?? [])]) {
      for (const field of ['ready', 'recoverUntil', 'staggerUntil', 'guardRecoverAt', 'flashUntil'])
        if (Number.isFinite(e[field])) e[field] += elapsed;
      if (Number.isFinite(e.response?.start)) e.response.start += elapsed;
      if(e.droneState){e.droneState.readyAt+=elapsed;if(e.droneState.warning){e.droneState.warning.start+=elapsed;e.droneState.warning.releaseAt+=elapsed;}}
      e.swing = null;
    }
    for (const bolt of game.bolts) if (Number.isFinite(bolt.expires)) bolt.expires += elapsed;
  } else initializeAreaResidents(game);
  const p = game.player;
  p.pos = { ...position };
  p.velocity = { x: 0, z: 0 };
  p.swing = p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.dodgeUntil = p.invulnerableUntil = game.time;
  p.response = null;
  p.ready = Math.min(p.ready, game.time);
  game.message = `${request.areaId.toUpperCase()} · ${game.encounterCleared ? "Cleared · keep exploring." : "Explore London."}`;
  game.messageUntil = game.time + 4;
  return { ...position };
}

// Dismiss only a living player's victory; keep the cleared encounter parked.
export function continueExploring(game) {
  if (!game.finished || !game.won || game.player.hp <= 0) return false;
  game.finished = false;
  game.encounterCleared = true;
  game.encounterActive = false;
  game.player.swing = game.player.buffer = null;
  game.player.guarding = false;
  game.player.parryUntil = 0;
  game.events = [];
  return true;
}
