// Thin orchestration for the existing three-area pilot. World owns atomic loading.
export async function travelTo(game, request) {
  const previous = game.world.areaId,
    position = await game.world.loadArea(request.areaId, request.entryPoint);
  if (previous === "westminster" && request.areaId !== "westminster") {
    game.parkedFight = {
      enemies: game.enemies,
      corpses: game.corpses,
      bolts: game.bolts,
      loot: game.loot,
      time: game.time,
      nextWave: game.nextWave,
    };
    game.enemies = [];
    if (game.corpses) game.corpses = [];
    game.bolts = [];
    game.loot = [];
    game.encounterActive = false;
  } else if (request.areaId === "westminster") {
    const parked = game.parkedFight;
    if (parked) {
      const elapsed = game.time - parked.time;
      game.enemies = parked.enemies;
      if (parked.corpses) game.corpses = parked.corpses;
      game.bolts = parked.bolts;
      game.loot = parked.loot;
      game.nextWave = parked.nextWave + elapsed;
      if (Number.isFinite(game.nextEnemyAttackAt)) game.nextEnemyAttackAt += elapsed;
      for (const e of game.enemies) {
        e.ready += elapsed;
        e.recoverUntil += elapsed;
        e.staggerUntil += elapsed;
        if (Number.isFinite(e.guardRecoverAt)) e.guardRecoverAt += elapsed;
        e.swing = null;
      }
      for (const b of game.bolts) b.expires += elapsed;
      game.parkedFight = null;
    }
    game.encounterActive = !game.encounterCleared;
  }
  const p = game.player;
  p.pos = { ...position };
  p.velocity = { x: 0, z: 0 };
  p.swing = p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.dodgeUntil = p.invulnerableUntil = game.time;
  p.response = null;
  p.ready = Math.min(p.ready, game.time);
  game.message = `${request.areaId.toUpperCase()} · ${request.areaId === "westminster" ? "Encounter resumed." : "Westminster fight is parked."}`;
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
