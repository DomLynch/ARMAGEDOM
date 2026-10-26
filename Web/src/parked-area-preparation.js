import { publicAreaRegistry } from "./area-registry.js";
import { GAME_DATA } from "./engine/game-data.js";
// Prepare one authoritative dormant roster using the existing resident factory.
// No simulation, events, persistence or rewards run here; travel adopts this record.
export function prepareParkedResidents(game, areaWorld, initializeResidents) {
  const areaId = areaWorld?.areaId;
  if (
    !game?.areaResidents ||
    !(areaWorld?.registry ?? game?.world?.registry ?? publicAreaRegistry).has(areaId) ||
    areaId === game.world?.areaId ||
    !Number.isFinite(game.time) ||
    typeof initializeResidents !== "function"
  )
    throw new TypeError("Dormant preparation requires another existing resident area");
  const existing = game.areaFights?.[areaId];
  if (existing) return existing;
  const dormant = {
    ...game,
    world: areaWorld,
    player: { ...game.player },
    enemies: [],
    corpses: [],
    bolts: [],
    loot: [],
    events: [],
    areaInitialized: false,
    encounterCleared: false,
    wave: 0,
    nextWave: game.time + GAME_DATA.creatures.runTimings.firstWaveDelay,
    nextEnemyAttackAt: game.time,
  };
  initializeResidents(dormant);
  if (!dormant.areaInitialized) throw new Error("Dormant resident factory did not initialise the area");
  const record = {
    initialized: true,
    cleared: !!dormant.encounterCleared,
    enemies: dormant.enemies,
    corpses: dormant.corpses,
    bolts: dormant.bolts,
    loot: dormant.loot,
    wave: dormant.wave,
    nextWave: dormant.nextWave,
    nextEnemyAttackAt: dormant.nextEnemyAttackAt,
    parkedAt: game.time,
  };
  (game.areaFights ??= {})[areaId] = record;
  return record;
}
