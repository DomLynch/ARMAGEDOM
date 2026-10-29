import { rigCapability, rigOfSpecies } from "../rig-capabilities.js";
import { GAME_DATA } from "./game-data.js";
import { populationPlacements, populationAllowsDrone } from "./area-population.js";
import { reviveDue } from "./respawn.js";
import { applyBossProfile } from "./area-bosses.js";
import { creatureCatalogue, animalFoundationParameters, ENGINE_CREATURE_CAPABILITIES } from "./creature-catalogue.js";
import { resolveBoundAnimalRole } from "../animal-role-bindings.js";
import { resolveRoachNestGuard } from "../roach-territory.js";
import { gauntHumanRecipe } from "../gaunt-human-bindings.js";
import { resolveResidentIntent } from "../creature-behaviour-intents.js";
import { animalPlacement } from "../animal-cycle.js";
import { AREA_DRONE_SPAWNS } from "../area-drone-spawns.js";
import { DRONE_KEYS, createDroneState } from "../drone-mechanics.js";
import { allocateMobSizes } from "../mob-size-allocation.js";
import { mobSizeProfile } from "../mob-size.js";
import { applyStarVariant } from "./star-variants.js";
import { AREA_MOB_SPAWNS, residentEncounterHealth } from "../area-mob-spawns.js";
import { enemy } from "../combat.js";
import { knifeEnergy } from "./knife-stamina.js";
const RULES = GAME_DATA.combatRules;
// The rig ids of the kinds addressed by name below (creatures.json rigCapabilities species).
export const DRONE_RIG = rigOfSpecies("drone"),
  RAT_RIG = rigOfSpecies("rat"),
  ROACH_RIG = rigOfSpecies("roach"),
  DOG_RIG = rigOfSpecies("dog");
const PACK_CHASER = resolveResidentIntent("dog-pack-chaser", {
  behaviourCapabilities: ["home", "lineOfSight", "eligibleCompanions", "collisionMove"],
});
// The opening group and placed residents share the same Hollow factory/rules.
export function hollowActor(g, position, index = 0, mobSize = 1) {
  const profile = g.encounter,
    c = profile.character,
    foundation = creatureCatalogue.get("hollow-scavenger");
  return knifeEnergy(
    Object.assign(enemy(0, position), {
      rig: foundation.runtimeIdentity,
      contactRig: c.contactRig,
      weapon: c.weapon,
      ...mobSizeProfile(
        { bodyScale: c.bodyScale, combatScale: g.player.combatScale, radius: RULES.bodyRadius * c.bodyScale },
        mobSize,
      ),
      mobSize,
      hp: profile.health,
      maxHP: profile.health,
      lastMove: null,
      moveSpeed: profile.moveSpeed,
      recoveryDelay: profile.recovery,
      ready: g.time + index * profile.aggression,
    }),
    profile.regen,
  );
}
function droneResident(g, placement) {
  const foundation = creatureCatalogue.get(DRONE_RIG);
  return Object.assign(enemy(0, placement.pos), {
    rig: foundation.runtimeIdentity,
    areaId: g.world.areaId,
    weapon: foundation.stats.weapon,
    radius: foundation.stats.radius,
    hp: foundation.stats.health,
    maxHP: foundation.stats.health,
    moveSpeed: foundation.stats.moveSpeed,
    combatScale: g.player.combatScale,
    droneState: createDroneState(),
  });
}
export function markedHunter(g, position, config) {
  const e = hollowActor(g, position);
  return Object.assign(e, {
    markedHunter: true,
    placementKey: "marked-hunter-" + e.id,
    areaId: g.world.areaId,
    hp: config.hunterHealth,
    maxHP: config.hunterHealth,
    moveSpeed: config.hunterSpeed,
    home: { ...position },
    patrol: [{ ...position }, { ...position }],
    patrolIndex: 0,
    alerted: true,
    returning: false,
    residentIntent: Object.freeze({
      pursuitScope: "area",
      wakeDistance: 1000,
      homeLeash: 1000,
      holdUntilWake: false,
      retreatSeconds: 0,
      companionDistance: 0,
      isolationDistance: 0,
      burstSeconds: 0,
      pauseSeconds: 0,
    }),
  });
}
function declaredResident(g, placement, mobSize) {
  const foundation = placement.foundationRef ? creatureCatalogue.get(placement.foundationRef) : null;
  if (foundation?.runtimeIdentity === DRONE_RIG) {
    if (DRONE_KEYS[placement.key] !== g.world.areaId) throw Error("Unsupported declared drone death placement");
    return droneResident(g, placement);
  }
  const actor = hollowActor(g, placement.pos, 0, foundation ? 1 : mobSize);
  if (foundation && foundation.runtimeIdentity !== "hollow-scavenger")
    Object.assign(actor, animalFoundationParameters(foundation.runtimeIdentity, g.player.combatScale), {
      animalRecipe: placement.recipeRef,
    });
  else if (placement.recipeRef === "human-gaunt-skulker") actor.humanBodyRecipe = placement.recipeRef;
  if (placement.appearanceRef !== undefined) actor.appearanceRef = placement.appearanceRef;
  const health = residentEncounterHealth(placement, actor.maxHP);
  actor.hp = actor.maxHP = health;
  return applyBossProfile(actor, placement, g.world.bossData);
}
function bindAnimalRole(g, areaId, e) {
  const role = resolveBoundAnimalRole(e, {
    areaId,
    animalCycle: g.animalCycle,
    behaviourCapabilities: ENGINE_CREATURE_CAPABILITIES,
  });
  if (!role) return;
  e.animalRole = role;
  e.residentIntent = role.intent;
  Object.assign(e, role.parameters);
  e.completedAttack = null;
  e.wokeAt = null;
}
// `revived` holds placements whose respawn time has passed: they come back although the permanent ledgers say dead.
// `onlyRevived` builds just those (re-entering an area that was already set up); drones are never revived.
function buildResidents(g, area, revived, onlyRevived) {
  const dead = new Set(g.progressionModel?.deadPlacements(g.progression, area) ?? []);
  const policy = g.world.populationData,
    canonical = g.residentPlacements?.[area] ?? AREA_MOB_SPAWNS[area] ?? [];
  const placements = populationPlacements(policy, area, g.animalCycle, canonical),
    sizes = allocateMobSizes(
      area,
      canonical.map((placement) => placement.key),
    );
  const residents = placements
    .filter(
      (p) =>
        revived.has(p.key) ||
        (!onlyRevived &&
          !dead.has(p.key) &&
          (!(area === "westminster" || (g.supplies?.version === 2 && g.lootRules?.[p.key]?.areaId === area)) || // tuning-ok: supplies save version
            !g.supplies?.issued.includes(p.key)) &&
          (p.foundationRef !== DRONE_RIG || !(g.droneDeaths ?? []).includes(p.key))),
    )
    .map((placement) =>
      Object.assign(declaredResident(g, placement, sizes.get(placement.key)), {
        placementKey: placement.key,
        home: { ...placement.pos },
        patrol: placement.patrol,
        patrolIndex: 1,
        returning: false,
      }),
    );
  if (!policy?.areas[area] && g.rat) {
    const rat = residents.find((e) =>
      ["westminster-roamer-4", "east-roamer-7", "south-roamer-3"].includes(e.placementKey),
    );
    if (rat) Object.assign(rat, animalFoundationParameters(RAT_RIG, g.player.combatScale));
  }
  if (!policy?.areas[area] && g.roach) {
    const roach = residents.find((e) => e.placementKey === "westminster-roamer-2");
    if (roach) Object.assign(roach, animalFoundationParameters(ROACH_RIG, g.player.combatScale));
  }
  if (!policy?.areas[area] && g.dog) {
    const dog = residents.find((e) =>
      ["westminster-roamer-6", "east-roamer-4", "south-roamer-8"].includes(e.placementKey),
    );
    if (dog) Object.assign(dog, animalFoundationParameters(DOG_RIG, g.player.combatScale));
  }
  if (!policy?.areas[area] && g.animalVariants)
    for (const e of residents) {
      const assignment = animalPlacement(g.animalCycle, e.placementKey);
      if (!assignment) continue;
      const { recipe, rig, offset } = assignment;
      Object.assign(e, { animalRecipe: recipe, ...animalFoundationParameters(rig, g.player.combatScale) });
      if (
        g.animalCycle === "A" &&
        area === "east" &&
        e.placementKey === "east-roamer-4" &&
        recipe === "dog-pack-chaser" &&
        rig === DOG_RIG
      )
        e.residentIntent = PACK_CHASER;
      e.pos = { x: e.pos.x + offset.x, z: e.pos.z + offset.z };
      e.home = { ...e.pos };
      e.patrol = e.patrol.map((p) => ({ x: p.x + offset.x, z: p.z + offset.z }));
      const territory = resolveRoachNestGuard(e, { areaId: area, animalCycle: g.animalCycle });
      if (territory) e.residentIntent = territory;
      bindAnimalRole(g, area, e);
    }
  for (const e of residents) if (rigCapability(e.rig, "nativeSkeleton")) bindAnimalRole(g, area, e);
  for (const e of residents) {
    const recipe = gauntHumanRecipe(g.animalCycle, area, e);
    if (recipe) e.humanBodyRecipe = recipe;
    if (g.starVariants) applyStarVariant(e, area, g.animalCycle);
  }
  if (g.drone && !onlyRevived)
    for (const placement of AREA_DRONE_SPAWNS[area] ?? [])
      if (
        populationAllowsDrone(policy, area, placement.key) &&
        !dead.has(placement.key) &&
        !g.droneDeaths.includes(placement.key) &&
        !placements.some((p) => p.foundationRef === DRONE_RIG && p.key === placement.key)
      )
        residents.push(
          Object.assign(droneResident(g, placement), {
            placementKey: placement.key,
            home: { ...placement.pos },
            patrol: placement.patrol,
            patrolIndex: 1,
            returning: false,
          }),
        );
  return residents;
}
export function initializeAreaResidents(g) {
  if (!g.areaResidents || g.areaInitialized) return;
  const area = g.world.areaId ?? "westminster";
  // Legacy opening groups remain atomic; resident-only starts initialize directly.
  if (area === "westminster" && !g.wave && g.openingGroup !== false) return;
  g.enemies.push(...buildResidents(g, area, new Set(), false));
  g.areaInitialized = true;
  g.encounterActive = g.enemies.length > 0;
  g.encounterCleared = !g.enemies.length;
  if (area !== "westminster" || g.openingGroup === false) {
    g.wave = 1;
    g.nextWave = Infinity;
    g.nextEnemyAttackAt = g.time;
  }
}
export const reviveAreaResidents = (g) => reviveDue(g, buildResidents, AREA_MOB_SPAWNS);
