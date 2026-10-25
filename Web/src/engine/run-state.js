import { upgradeSupplies } from "../supply-ledger-v2.js";
import { GAME_DATA } from "./game-data.js";
import { initializeAreaResidents } from "../combat.js";
import { DRONE_KEYS } from "../drone-mechanics.js";
import {
  createSuppliesState,
  isSuppliesState,
  collectSupply,
  hasExtendedLoot,
  legacyIssuedCount,
  collectedGearSource,
} from "../supplies.js";
import { createVestState, isVestState, collectVest } from "../vest.js";
// Clear native circle movement/LOS from spawn;1.15m from the pistol stash.
export const VEST_BAG_POSITION = GAME_DATA.supplies.vestBagPosition; // data/supplies.json
// Only this pilot's ownership and finite ammunition; no inventory/run framework.
export const PISTOL_SAVE_KEY = "armagedom:pistol:v1";
export function encodePistol(state) {
  return JSON.stringify({
    version: 1,
    pickupId: "westminster-start-pistol-v1",
    collected: state.collected,
    equipped: state.equipped,
    magazine: state.magazine,
    reserve: state.reserve,
  });
}
export function restorePistol(state, raw) {
  if (raw == null) return state;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !saved ||
    saved.version !== 1 ||
    saved.pickupId !== "westminster-start-pistol-v1" ||
    typeof saved.collected !== "boolean" ||
    typeof saved.equipped !== "boolean" ||
    !Number.isInteger(saved.magazine) ||
    saved.magazine < 0 ||
    saved.magazine > 6 ||
    !Number.isInteger(saved.reserve) ||
    saved.reserve < 0 ||
    saved.reserve > 12 ||
    (!saved.collected && (saved.equipped || saved.magazine || saved.reserve))
  )
    return null;
  return {
    ...state,
    collected: saved.collected,
    equipped: saved.equipped,
    magazine: saved.magazine,
    reserve: saved.reserve,
    reloadingUntil: 0,
    nextFireAt: 0,
  };
}

// One authoritative successor record: ammunition, health and Area1 reward ledger.
export const RUN_SAVE_KEY = "armagedom:area1-run:v1";
export function encodeRun(g) {
  return JSON.stringify({
    version: g.supplies?.version === 2 ? 3 : 2,
    pistol: JSON.parse(encodePistol(g.pistol)),
    hp: g.player.hp,
    supplies: g.supplies,
    vest: g.vest ?? createVestState(),
    droneDeaths: g.droneDeaths ?? [],
    animalCycle: g.animalCycle ?? "A",
  });
}
export function restoreRun(g, raw, legacyRaw) {
  if (raw == null) {
    const pistol = restorePistol(g.pistol, legacyRaw);
    return pistol
      ? {
          pistol,
          hp: g.player.hp,
          supplies: createSuppliesState(g.lootRules),
          vest: createVestState(),
          droneDeaths: [],
          animalCycle: "A",
        }
      : null;
  }
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    ![1, 2, 3].includes(saved?.version) ||
    !saved.pistol ||
    typeof saved.pistol !== "object" ||
    !Number.isFinite(saved.hp) ||
    saved.hp < 0 ||
    saved.hp > g.player.maxHP
  )
    return null;
  const extended = hasExtendedLoot(g.lootRules);
  if (
    saved.version < 3
      ? saved.supplies?.version !== 1 || !isSuppliesState(saved.supplies)
      : saved.supplies?.version !== 2 || !extended || !isSuppliesState(saved.supplies, g.lootRules)
  )
    return null;
  const supplies = saved.version < 3 && extended ? upgradeSupplies(saved.supplies, g.lootRules) : saved.supplies;
  if (!supplies || !isSuppliesState(supplies, g.lootRules)) return null;
  const vest = saved.version === 1 && !("vest" in saved) ? createVestState() : saved.version >= 2 ? saved.vest : null;
  if (
    !isVestState(vest) ||
    (vest.equipped && legacyIssuedCount(supplies) < 2 && !collectedGearSource(supplies, g.lootRules, vest.itemId))
  )
    return null;
  const animalCycle = Object.hasOwn(saved, "animalCycle") ? saved.animalCycle : "A";
  if (!["A", "B"].includes(animalCycle)) return null;
  const droneDeaths = Object.hasOwn(saved, "droneDeaths") ? saved.droneDeaths : [];
  if (
    !Array.isArray(droneDeaths) ||
    droneDeaths.some((k) => !Object.hasOwn(DRONE_KEYS, k)) ||
    new Set(droneDeaths).size !== droneDeaths.length
  )
    return null;
  const pistol = restorePistol(g.pistol, JSON.stringify(saved.pistol));
  if (
    (pistol && collectedGearSource(supplies, g.lootRules, "westminster-start-pistol-v1") && !pistol.collected) ||
    (collectedGearSource(supplies, g.lootRules, "westminster-worn-vest-v1") && !vest.equipped)
  )
    return null;
  return pistol ? { pistol, hp: saved.hp, supplies, vest, droneDeaths, animalCycle } : null;
}
export function applySavedRun(g, saved) {
  g.pistol = saved.pistol;
  g.player.hp = saved.hp;
  g.supplies = saved.supplies;
  g.vest = saved.vest;
  g.droneDeaths = saved.droneDeaths ?? [];
  g.player.weapon = g.pistol.equipped ? "pistol" : "knife";
  if (g.animalVariants && g.areaResidents) {
    g.animalCycle = saved.animalCycle ?? "A";
    g.enemies = [];
    g.areaInitialized = false;
    initializeAreaResidents(g);
  }
  if (g.areaResidents && (g.world.areaId === "westminster" || g.supplies.version === 2)) {
    const issued = g.supplies.issued.filter(
      (key) => g.supplies.version === 1 || g.lootRules[key]?.areaId === g.world.areaId,
    );
    g.enemies = g.enemies.filter((e) => !issued.includes(e.placementKey));
    g.kills = issued.length;
    g.encounterCleared = !g.enemies.length;
    g.encounterActive = !g.encounterCleared;
  }
  if (g.areaResidents) {
    g.enemies = g.enemies.filter((e) => !g.droneDeaths.includes(e.placementKey));
    g.kills += g.droneDeaths.length;
    g.encounterCleared = !g.enemies.length;
    g.encounterActive = !g.encounterCleared;
  }
  if (!g.player.hp) {
    g.finished = true;
    g.won = false;
  }
}
export function commitFreshRun(previous, proposed, save) {
  return save(proposed) ? proposed : previous;
}
// Main supplies the sole synchronous writer. Commit rewards only AFTER durable write.
export function collectNearbySupplies(g, save) {
  if (!g.supplies || g.runSaveInvalid || g.finished) return;
  for (const drop of g.supplies.pending.slice()) {
    const result = collectSupply(g.supplies, {
      dropId: drop.id,
      areaId: g.world.areaId,
      position: g.player.pos,
      rules: g.lootRules,
      resources: { hp: g.player.hp, maxHP: g.player.maxHP, pistolOwned: g.pistol.collected, reserve: g.pistol.reserve },
      lineClear: (a, b) => g.world.lineClear(a, b),
    });
    if (result.award) {
      const proposed = {
        ...g,
        player: { ...g.player, hp: result.resources.hp },
        pistol: { ...g.pistol, reserve: result.resources.reserve },
        supplies: result.state,
      };
      if (!save(proposed)) continue;
      g.player.hp = result.resources.hp;
      g.pistol.reserve = result.resources.reserve;
      g.supplies = result.state;
      g.events.push({ type: "supply-pickup", ...result.award });
      g.message =
        result.award.kind === "rounds"
          ? `Scavenged ${result.award.amount} spare rounds.`
          : `Dressing restored ${Math.ceil(result.award.amount)} health.`;
      g.messageUntil = g.time + 3;
    } else if (["pistol-required", "reserve-full", "health-full"].includes(result.reason)) {
      const notice = drop.id + result.reason;
      if (g.supplyNotice === notice && g.time < g.supplyNoticeUntil) continue;
      g.supplyNotice = notice;
      g.supplyNoticeUntil = g.time + 4;
      g.message = {
        "pistol-required": "Collect the pistol first. Rounds kept.",
        "reserve-full": "Spare rounds full. Supply kept.",
        "health-full": "Health full. Dressing kept.",
      }[result.reason];
      g.messageUntil = g.time + 2;
    }
  }
}

// Equipment participates in the same authoritative atomic resource/reward record.
export function collectNearbyVest(g, save) {
  if (!g.vest || g.runSaveInvalid || g.finished) return;
  const result = collectVest(g.vest, {
    supplies: g.supplies,
    supplyRules: g.lootRules,
    areaId: g.world.areaId,
    position: g.player.pos,
    bagPosition: VEST_BAG_POSITION,
    hp: g.player.hp,
    lineClear: (a, b) => g.world.lineClear(a, b),
  });
  if (!result.equipped || !save({ ...g, vest: result.state })) return;
  g.vest = result.state;
  g.events.push({ type: "vest-pickup", actor: g.player, itemId: result.state.itemId });
  g.message = "Worn vest equipped · 10% protection from unblocked hits.";
  g.messageUntil = g.time + 4;
}
