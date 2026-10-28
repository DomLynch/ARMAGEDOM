import { stepBossRanged, stepBossRockets, stopBossRanged, clearBossRanged } from "./engine/boss-ranged.js";
import { stepPlayerHealth } from "./engine/player-health.js";
import { rigCapability, rigOfSpecies, rigText } from "./rig-capabilities.js";
import { stepMarkedHunters, clearMarkedHunters } from "./engine/marked-hunters.js";
import { stepCursedRelic, cursedDamage, clearCursed } from "./engine/cursed-relic.js";
import { stopRailgun } from "./engine/railgun.js";
import { stepReaper, stopReaper, REAPER_ITEM_ID } from "./engine/reaper.js";
import {
  BONE_SAW_RULES,
  boneSawIntent,
  stepBoneSaw,
  stopBoneSaw,
  stopAllBoneSaws,
  stepSurgeonSaw,
} from "./engine/bone-saw.js";
import { stepBossFlame, stopBossFlame, stopBossFlames } from "./engine/boss-flame.js";
import { applyTouchTarget } from "./engine/touch-target.js";
import {
  safehouseProtected,
  safehouseTouches,
  safehouseBlocksSegment,
  safehouseWeaponBlocked,
  prepareSafehouseStep,
} from "./engine/safehouse.js";
import { stepRockets } from "./engine/rocket-runtime.js";
import { stepTrapCrates } from "./engine/trap-crate.js";
import { bossEquipmentIntent, selectedBossRanged, stepBossGrenades } from "./engine/boss-weapon-runtime.js";
import { bossEquipmentClock } from "./engine/boss-equipment-data.js";
import { rifleActionState } from "./engine/rifle-runtime.js";
import { FINISHER_DATA } from "./engine/finisher-data.js";
import { FLAME_VISUAL_DATA } from "./engine/flame-data.js";
import { initializeFlame, flameIntent, stepFlame, stopFlame } from "./engine/flame-runtime.js";
import { wolfBiteDirection } from "./wolf-native.js";
import { SALAMANDER_BREATH } from "./salamander-native.js";
import { rigResponse } from "./rig-response.js";
import { CREATURE_MOVES } from "./creature-moves.js";
import { GAME_DATA, fillText } from "./engine/game-data.js";
import { populationPlacements, populationAllowsDrone } from "./engine/area-population.js";
import { recordResidentKill, reviveDue } from "./engine/respawn.js";
import { posedMeleeMove } from "./engine/melee-equipment-data.js";
import { applyBossProfile, bossMove, bossHazardPosition, resetBossPursuit } from "./engine/area-bosses.js";
import { createAreaHazard, applyAreaHazards } from "./engine/area-hazards.js";
import { stepAirdrop, airdropPull } from "./engine/airdrop.js";
import { selectedPistolProfile } from "./engine/expedition-core.js";
import { initializeProgression, effectiveWeaponDamage, stageProgressionDeath } from "./engine/progression-runtime.js";
import { PISTOL_ITEM_ID } from "./core/pistol-operation.js";
import {
  creatureCatalogue,
  animalFoundationParameters,
  ENGINE_CREATURE_CAPABILITIES,
} from "./engine/creature-catalogue.js";
import { ratMeleeDefinition } from "./rat-melee-definition.js";
import { resolveBoundAnimalRole, nativeAttackCompletion } from "./animal-role-bindings.js";
import { resolveRoachNestGuard, territoryHomeStep } from "./roach-territory.js";
import { gauntHumanRecipe } from "./gaunt-human-bindings.js";
import {
  resolveResidentIntent,
  canWakeResident,
  recoveryMovement,
  approachRhythm,
  observeResidentCompanions,
} from "./creature-behaviour-intents.js";
import { animalPlacement } from "./animal-cycle.js";
import { AREA_DRONE_SPAWNS } from "./area-drone-spawns.js";
import { DRONE_KEYS, DRONE_RULES, createDroneState, droneIntent, recordDroneDeath } from "./drone-mechanics.js";
import { createBridgeSteering } from "./bridge-steering.js";
import { createMobileAimState, stepMobileAim } from "./mobile-combat-aim.js";
import { selectFinisher } from "./finisher-selection.js";
import { allocateMobSizes } from "./mob-size-allocation.js";
import { mobSizeProfile } from "./mob-size.js";
import { createSuppliesState, issueSupply } from "./supplies.js";
import { createVestState, damageAfterVest } from "./vest.js";
import { AREA_MOB_SPAWNS, residentEncounterHealth } from "./area-mob-spawns.js";
import { selectCombatTarget, resolvePistolShot, resolveRangedAim, selectedRangedProfile } from "./pistol-targeting.js";
import { createPistolState, stepPistol, tracePistol } from "./pistol.js";
import { createHollowEncounter } from "./hollow-encounter.js";
import { KNIFE_RULES as R, KNIFE_MOVES, KNIFE_COOLDOWNS, KNIFE_STAMINA_COSTS, bladeContact } from "./donor/knife.js";
const HUD_TEXT = GAME_DATA.combatText.hud; // data/combatText.json: the HUD messages this module raises
// Port of the pinned Unity Westminster encounter. Domain x/z stays in Unity metres.
// Legacy (non-pilot) attacks: data/creatures.json `playerAttacks`.
export const attacks = GAME_DATA.creatures.playerAttacks;
// The rig ids of the kinds addressed by name below (creatures.json rigCapabilities species).
const DRONE_RIG = rigOfSpecies("drone"),
  RAT_RIG = rigOfSpecies("rat"),
  ROACH_RIG = rigOfSpecies("roach"),
  DOG_RIG = rigOfSpecies("dog");
const PACK_CHASER = resolveResidentIntent("dog-pack-chaser", {
  behaviourCapabilities: ["home", "lineOfSight", "eligibleCompanions", "collisionMove"],
});
// The bite and low-strike moves are rows of Web/src/data/creatures.json, resolved in creature-moves.js.
const RAT_LOW = CREATURE_MOVES.rat_low;
export const RAT_BITE = CREATURE_MOVES.rat_bite;
const RAT_BITE_LOW = CREATURE_MOVES.rat_bite_low;
const droneLow = (def) => ({
  ...RAT_LOW,
  clip: "DogMidSlash",
  moveId: "drone_low",
  damage: def.damage,
  stamina: def.stamina,
  staminaDamage: def.staminaDamage,
  stagger: def.stagger,
  cooldown: def.cooldown,
});
const ROACH_LOW = CREATURE_MOVES.roach_low;
export const ROACH_BITE = CREATURE_MOVES.roach_bite;
const ROACH_BITE_SCALED = CREATURE_MOVES.roach_bite_scaled;
const DOG_LOW = CREATURE_MOVES.dog_low;
const DOG_MID = CREATURE_MOVES.dog_mid;
export const DOG_BITE = CREATURE_MOVES.dog_bite;
const DOG_BITE_SCALED = CREATURE_MOVES.dog_bite_scaled;
const EPS = 1e-8,
  mag = (v) => Math.hypot(v.x, v.z),
  sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
// Numerical dead zones, not tuning: below these a direction, push or length counts as nothing.
const NEGLIGIBLE_DISTANCE = 0.001, // tuning-ok: numerical dead zone for a direction
  INPUT_DEADZONE = 0.01, // tuning-ok: numerical dead zone for a stick push
  MIN_SEGMENT = 0.0001; // tuning-ok: numerical dead zone for a segment length
export function normal(v, fallback = { x: 0, z: 1 }) {
  const n = mag(v);
  return n > NEGLIGIBLE_DISTANCE ? { x: v.x / n, z: v.z / n } : { ...fallback };
}
const validDirection = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.z) && mag(v) > NEGLIGIBLE_DISTANCE;
const dot = (a, b) => a.x * b.x + a.z * b.z;
const inside = (dir, delta, arc) =>
  mag(delta) < NEGLIGIBLE_DISTANCE || dot(normal(dir), normal(delta)) + EPS >= Math.cos((arc * Math.PI) / 360);
const rotate = (v, angle) => ({
  x: v.x * Math.cos(angle) + v.z * Math.sin(angle),
  z: v.z * Math.cos(angle) - v.x * Math.sin(angle),
});
let serial = 0;
// The original goblin game's numbers: data/combatRules.json `legacy`.
const RULES = GAME_DATA.combatRules,
  LEGACY = RULES.legacy,
  WAVES = LEGACY.waves,
  WARLORD = WAVES.warlordKind,
  RANGED = WAVES.rangedKind;
const legacyKind = (kind) => LEGACY.kinds[kind] ?? LEGACY.kinds[0];
export function enemy(kind, pos) {
  const hp = LEGACY.kinds[kind]?.hp;
  return {
    id: ++serial,
    kind,
    pos: { ...pos },
    facing: { x: 0, z: -1 },
    hp,
    maxHP: hp,
    radius: legacyKind(kind).radius,
    ready: 0,
    recoverUntil: 0,
    staggerUntil: 0,
    alerted: false,
    pattern: 0,
    swing: null,
    flashUntil: 0,
  };
}
export function createGame(world, options = {}) {
  if (options.encounter && (options.pilot !== "donor-knife" || options.encounter.id !== "hollow-scavengers"))
    throw Error("Unsupported combat encounter");
  const encounter = options.encounter ? createHollowEncounter(options.encounter.character, options.encounter) : null;
  const g = {
    world,
    time: 0,
    wave: 0,
    kills: 0,
    nextWave: WAVES.firstWaveSeconds,
    started: false,
    finished: false,
    won: false,
    events: [],
    enemies: [],
    bolts: [],
    loot: [],
    message: HUD_TEXT.enterCombat,
    messageUntil: WAVES.messageSeconds,
    player: {
      id: 0,
      kind: -1,
      pos: { ...(world.spawn ?? RULES.player.spawn) },
      facing: { x: 0, z: 1 },
      hp: 100,
      maxHP: 100,
      damage: RULES.player.damage,
      weaponLevel: 0,
      armourLevel: 0,
      radius: RULES.player.radius,
      guard: 100,
      guarding: false,
      parryUntil: 0,
      guardBrokenUntil: 0,
      guardRecoverAt: 0,
      ready: 0,
      heavyReady: 0,
      specialReady: 0,
      dodgeReady: 0,
      dodgeUntil: 0,
      invulnerableUntil: 0,
      swing: null,
      buffer: null,
      velocity: { x: 0, z: 0 },
      flashUntil: 0,
    },
  };
  if (options.pilot === "donor-knife") {
    g.pilot = "donor-knife";
    g.corpses = [];
    g.cooldowns = KNIFE_COOLDOWNS;
    g.staminaCosts = KNIFE_STAMINA_COSTS;
    g.tick = 0;
    knifeEnergy(g.player);
    Object.assign(g.player, {
      rig: "hero",
      weapon: "knife",
      combatScale: world.layout?.characterScale ?? GAME_DATA.areaRuntime.view.defaultCharacterScale,
      bodyScale: 1,
      hp: R.health,
      maxHP: R.health,
      lastMove: null,
      parryReady: 0,
      guardExposedUntil: 0,
      hurtUntil: 0,
      dodgeStart: -Infinity,
    });
    if (encounter) {
      g.encounter = encounter;
      g.nextEnemyAttackAt = 0;
      g.message = HUD_TEXT.hollowScavengers;
    }
  }
  if (options.healthRegen === true) g.healthRegen = true;
  if (options.rat) g.rat = true;
  if (options.dog) g.dog = true;
  if (options.roach) g.roach = true;
  if (options.drone) {
    g.drone = true;
    g.droneDeaths = [];
  }
  if (options.animalVariants) {
    g.animalVariants = true;
    g.animalCycle = options.animalCycle ?? "A";
    if (!["A", "B"].includes(g.animalCycle)) throw Error("Invalid animal cycle");
  }
  if (options.finishers && g.pilot)
    g.finishers = {
      maxHeads: options.finishers === "pistol-only" ? 0 : FINISHER_DATA.limits.partBudget,
      recentRecipeId: null,
    };
  if (options.mobileControls) g.mobileAim = createMobileAimState(Math.atan2(g.player.facing.x, g.player.facing.z));
  g.lootRules = options.lootRules ?? world.lootRules;
  if (options.supplies) g.supplies = createSuppliesState(g.lootRules);
  if (options.vest) g.vest = createVestState();
  initializeProgression(g);
  initializeFlame(g);
  if (options.areaResidents && encounter) {
    g.areaResidents = true;
    g.residentPlacements = options.residentPlacements;
    g.lootRules = options.lootRules ?? world.lootRules;
    g.areaFights = {};
    g.areaInitialized = false;
    g.openingGroup = world.populationData ? false : options.openingGroup !== false;
    if (!g.openingGroup) initializeAreaResidents(g);
  }
  if (options.pistol)
    g.pistol = createPistolState({ pickupPos: { ...RULES.startingPistol }, pickupAreaId: "westminster" });
  return g;
}
function notify(g, text) {
  g.message = text;
  g.messageUntil = g.time + WAVES.messageSeconds;
}
function event(g, type, data = {}) {
  g.events.push({ type, ...data });
}
export const cursedHit = (g, s, w, i, damage, c) => rangedHit(g, s, w, i, cursedDamage(g, damage), c);
export function rangedHit(g, shot, weapon, itemId, damage, attackClass = "bullet") {
  const target = g.enemies.find((t) => t.id === shot.targetId && t.hp > 0);
  if (!target || safehouseWeaponBlocked(g) || safehouseTouches(g, target.pos, target.radius)) return;
  const amount = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  target.flashUntil = g.time + RULES.hitFlashSeconds;
  if (target.home) alertResident(g, target);
  event(g, "hit", {
    actor: target,
    amount,
    position: { ...target.pos },
    weapon,
    attackClass,
    impactDirection: { ...shot.direction },
    parry: false,
  });
  if (weapon === "rifle") rifleActionState(g).lastDamageTick = g.tick;
  else if (["shotgun", "grenade", "rocket", "railgun"].includes(weapon))
    bossEquipmentClock(
      g,
      weapon === "rocket" ? "rocketLauncher" : weapon === "railgun" ? "commanderPistol" : weapon,
    ).lastDamageTick = g.tick;
  if (target.hp <= 0) {
    stopBoneSaw(g, target, "death");
    stageProgressionDeath(g, target, itemId, amount);
    target.swing = null;
    target.response = rigResponse(target.rig, 0, g.time);
    kill(g, target, { weapon, attackClass, impactDirection: { ...shot.direction } });
  }
}
function rifleIntent(g, intent, dispatch) {
  const p = g.player,
    profile = g.world.rifleData,
    rules = profile.rules,
    clock = rifleActionState(g),
    actions = intent.actions ?? [],
    canAct =
      p.hp > 0 &&
      !g.finished &&
      !intent.cancel &&
      !intent.dodge &&
      !p.swing &&
      g.time >= p.ready &&
      g.time >= p.hurtUntil &&
      g.time >= p.dodgeUntil;
  let state = g.rifle;
  const explicit = validDirection(intent.aim),
    moving = mag(intent.move ?? { x: 0, z: 0 }) > INPUT_DEADZONE,
    reference = g.mobileAiming
      ? { ...p.facing }
      : explicit
        ? normal(intent.aim)
        : moving
          ? normal(intent.move)
          : (g.rifleUserFacing ?? { ...p.facing });
  g.rifleUserFacing = { ...reference };
  g.pistolTargetId = null;
  g.pistolTargetFacing = null;
  if (!canAct) clock.reloadingUntil = 0;
  if (canAct && actions.includes("heavy")) {
    dispatch?.(g, { type: "equip", itemId: profile.itemId, equipped: false }, true);
    return { ...intent, actions: [], held: [], guard: false, guardPressed: false };
  }
  if (canAct && clock.reloadingUntil > 0 && g.time + EPS >= clock.reloadingUntil) {
    const result = dispatch?.(g, { type: "reload" }, true);
    if (!result?.ok) clock.reloadingUntil = 0;
    state = g.rifle;
  }
  if (
    canAct &&
    g.rifleAssetReady &&
    (actions.includes("stab") || state.magazine === 0) &&
    !clock.reloadingUntil &&
    state.magazine < rules.capacity &&
    state.reserve > 0 &&
    g.time + EPS >= clock.nextFireAt
  ) {
    clock.reloadingUntil = g.time + rules.reload;
    event(g, "reload-start", { until: clock.reloadingUntil, weapon: "rifle" });
  }
  const firing =
    actions.includes("fire") ||
    actions.includes("slash") ||
    (profile.fireMode === "held" && intent.held?.includes("fire"));
  let shotDirection = null;
  if (firing && canAct && g.rifleAssetReady && !clock.reloadingUntil && g.time + EPS >= clock.nextFireAt) {
    const visible = intent.combatVisibleIds ?? intent.pistolVisibleIds,
      targets = g.enemies.filter((e) => !visible || visible.includes(e.id));
    const shot = resolveRangedAim(g, reference, { visibleIds: visible })?.trace;
    if (shot) {
      const result = dispatch?.(g, { type: "fire" }, true);
      if (result?.ok) {
        shotDirection = shot.direction;
        event(g, "shot", { ...shot, damage: rules.damage, kind: "bullet", weapon: "rifle", actor: p });
        if (shot.targetId != null) rangedHit(g, shot, "rifle", profile.itemId, cursedDamage(g, rules.damage));
      }
    }
  }
  p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  return {
    ...intent,
    aim: shotDirection ?? (explicit || moving ? reference : null),
    guard: false,
    guardPressed: false,
    actions: [],
    held: [],
  };
}
function pistolIntent(g, intent, dispatchPistol, dispatchMarshalPistol) {
  if (!g.pistol) return intent;
  const p = g.player,
    wasEquipped = g.pistol.equipped,
    actions = intent.actions ?? [],
    canAct = p.hp > 0 && !g.finished && !intent.dodge && !p.swing && g.time >= p.hurtUntil && g.time >= p.dodgeUntil;
  const firing = wasEquipped && (actions.includes("fire") || intent.held?.includes("fire"));
  const explicit = validDirection(intent.aim);
  const moving = mag(intent.move ?? { x: 0, z: 0 }) > INPUT_DEADZONE;
  const reference = g.mobileAiming
    ? { ...p.facing }
    : explicit
      ? normal(intent.aim)
      : moving
        ? normal(intent.move)
        : (g.pistolUserFacing ?? { ...p.facing });
  // Preserve unassisted user intent between shots, never a resolved target bearing.
  if (wasEquipped) g.pistolUserFacing = { ...reference };
  g.pistolTargetId = null;
  g.pistolTargetFacing = null;
  let shotDirection = null;
  const routed = typeof dispatchPistol === "function",
    holster = wasEquipped && actions.includes("heavy"),
    eligible = canAct && !intent.cancel;
  let coreEvents = [];
  if (routed && eligible && (holster || actions.includes("pickup"))) {
    const command = holster
      ? { type: "equip", itemId: PISTOL_ITEM_ID, equipped: false }
      : g.pistol.collected
        ? { type: "equip", itemId: PISTOL_ITEM_ID, equipped: true }
        : { type: "claimPickup", pickupId: PISTOL_ITEM_ID };
    coreEvents = dispatchPistol(g, command, eligible).events;
  }
  // Holster has precedence over firing/reload even when its durable write fails.
  const result =
    routed && eligible && holster
      ? { state: g.pistol, events: coreEvents }
      : g.bossEquipment?.commanderPistol?.selected && dispatchMarshalPistol
        ? dispatchMarshalPistol(g, {
            aim: reference,
            fire: !!firing,
            reload: wasEquipped && actions.includes("stab"),
            cancel: !!intent.cancel,
            canAct: !!canAct,
          })
        : stepPistol(g.pistol, {
            profile: selectedPistolProfile(g),
            time: g.time,
            areaId: g.world.areaId ?? "westminster",
            position: p.pos,
            facing: p.facing,
            aim: reference,
            collect: !routed && actions.includes("pickup"),
            equip: !routed && actions.includes("pickup"),
            holster: !routed && holster,
            reload: wasEquipped && actions.includes("stab"),
            fire: firing,
            cancel: !!intent.cancel,
            canAct,
            targets: g.enemies,
            lineClear: (a, b) => g.world.lineClear(a, b),
          });
  if (!(routed && eligible && holster) && coreEvents.length) result.events.unshift(...coreEvents);
  g.pistol = result.state;
  p.weapon = g.pistol.equipped ? "pistol" : "knife";
  for (let e of result.events) {
    if (e.type === "shot") {
      e = {
        ...e,
        ...resolveRangedAim(g, reference, { visibleIds: intent.combatVisibleIds ?? intent.pistolVisibleIds })?.trace,
      };
      shotDirection = e.direction;
    }
    event(g, e.type, { ...e, actor: p });
    if (e.type === "pickup") notify(g, HUD_TEXT.pistolEquipped);
    if (e.type === "holster") notify(g, HUD_TEXT.knifeEquipped);
    if (e.type === "equip") notify(g, HUD_TEXT.pistolEquipped);
    if (e.type === "dry") notify(g, g.pistol.reserve ? HUD_TEXT.emptyReload : HUD_TEXT.outOfAmmo);
    if (e.type === "shot" && e.targetId !== null && e.targetId !== undefined) {
      const target = g.enemies.find((t) => t.id === e.targetId && t.hp > 0);
      if (!target) continue;
      rangedHit(
        g,
        e,
        "pistol",
        "westminster-start-pistol-v1",
        effectiveWeaponDamage(g, "westminster-start-pistol-v1", e.damage),
      );
    }
  }
  if (g.finished || !g.enemies.some((e) => e.id === g.pistolTargetId && e.hp > 0)) {
    g.pistolTargetId = null;
    g.pistolTargetFacing = null;
  }
  if (!wasEquipped && g.pistol.equipped) g.pistolUserFacing = { ...reference };
  if (!g.pistol.equipped) {
    g.pistolUserFacing = null;
  }
  if (wasEquipped || g.pistol.equipped) {
    p.buffer = null;
    p.guarding = false;
    p.parryUntil = 0;
    return {
      ...intent,
      aim: shotDirection ?? (explicit || moving ? reference : null),
      guard: false,
      guardPressed: false,
      actions: [],
      held: [],
    };
  }
  return { ...intent, actions: actions.filter((a) => a !== "pickup") };
}
function moveBody(g, body, d) {
  let next = g.world.move(body.pos, d, body.radius); // World owns static collision.
  for (const other of [g.player, ...g.enemies]) {
    if (other === body || other.hp <= 0) continue;
    const delta = sub(next, other.pos),
      n = mag(delta),
      r = body.radius + other.radius;
    if (n < r && n > NEGLIGIBLE_DISTANCE) {
      next = g.world.move(
        body.pos,
        { x: next.x - body.pos.x + (delta.x / n) * (r - n), z: next.z - body.pos.z + (delta.z / n) * (r - n) },
        body.radius,
      );
    }
  }
  if (body !== g.player && safehouseTouches(g, next, (body.radius ?? RULES.bodyRadius) + RULES.safehouseBodyPadding))
    next = body.pos;
  body.pos = next;
}
export function attack(g, action, direction = g.player.facing, visibleIds) {
  if (safehouseWeaponBlocked(g)) return false;
  const p = g.player;
  let def = g.pilot ? knifeMove(p, action) : attacks[action],
    lowTargetId = null,
    slashTarget = null;
  if (
    p.weapon === "pistol" ||
    !def ||
    (g.pilot && p.hurtUntil > g.time) ||
    p.hp <= 0 ||
    g.finished ||
    p.dodgeUntil > g.time ||
    p.guardBrokenUntil > g.time
  )
    return false;
  if ((action === "heavy" && p.heavyReady > g.time + EPS) || (action === "special" && p.specialReady > g.time + EPS))
    return false;
  if (g.pilot && !knifeAffordable(p, def.stamina)) {
    p.buffer = null;
    return false;
  }
  if (p.ready > g.time + EPS) {
    if (p.ready - g.time <= (g.pilot ? R.bufferWindow / 60 : LEGACY.player.bufferSeconds) + EPS)
      p.buffer = {
        action,
        dir: normal(direction),
        until: p.ready + (g.pilot ? R.bufferTtl / 60 : LEGACY.player.bufferSeconds),
      };
    return false;
  }
  if (g.pilot && ["slash", "stab", "heavy", "special"].includes(action)) {
    const weaponMove = def,
      ticks = def.windupTicks ?? Math.floor(def.windup * 60),
      normalReach = def.range * p.combatScale + (R.walkSpeed * def.stepIn * Math.max(0, ticks - R.stepInFrom - 1)) / 60,
      lowReach = RAT_LOW.range * p.combatScale;
    slashTarget = selectCombatTarget({
      nearest: p.meleeTargeting?.nearest ?? true,
      aim: direction,
      coneDegrees: p.meleeTargeting?.coneDegrees,
      position: p.pos,
      targets: g.enemies.filter((e) => !visibleIds || visibleIds.includes(e.id)),
      lineClear: (a, b) => g.world.lineClear(a, b),
      range: normalReach,
      rangeOffset: (target) =>
        p.meleeLowMoves?.[target.rig]
          ? lowReach + (p.meleeLowMoves[target.rig].includeRadius ? target.radius : 0) - normalReach
          : rigCapability(target.rig, "lowStrike")
            ? lowReach +
              (rigCapability(target.rig, "nativeSkeleton")
                ? target.contactGoalReach - g.player.radius
                : target.contactGoalReach || rigText(target.rig, "brain") === "drone"
                  ? target.radius
                  : 0) -
              normalReach
            : target.mobSize
              ? RULES.aim.mobSizeReachFactor * target.combatScale * (target.bodyScale ?? 1) * (1 - 1 / target.mobSize)
              : 0,
      areaId: g.world.areaId,
    });
    const rig = g.enemies.find((e) => e.id === slashTarget?.targetId)?.rig;
    if (p.meleeLowMoves?.[rig]) {
      def = posedMeleeMove(weaponMove, action, p.meleeLowMoves[rig]);
      lowTargetId = slashTarget.targetId;
    } else if (rigCapability(rig, "lowStrike")) {
      const drone = rigText(rig, "brain") === "drone",
        lowSwing = rigText(rig, "lowSwing"),
        low = drone
          ? droneLow(def)
          : rigCapability(rig, "nativeSkeleton")
            ? DOG_MID
            : lowSwing === "dog"
              ? g.enemies.find((e) => e.id === slashTarget.targetId).contactGoalReach
                ? DOG_MID
                : DOG_LOW
              : lowSwing === "roach"
                ? ROACH_LOW
                : RAT_LOW;
      def = drone || action === "slash" ? low : ratMeleeDefinition(action, def, low, { rig });
      lowTargetId = slashTarget.targetId;
      if (p.meleeMoves)
        def = {
          ...def,
          damage: weaponMove.damage,
          stamina: weaponMove.stamina,
          staminaDamage: weaponMove.staminaDamage,
        };
    }
  }
  if (g.pilot) knifeSpend(g, p, def.stamina);
  p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.guardRecoverAt = g.time + (g.pilot ? R.regenDelay / 60 : LEGACY.player.guardRecoverSeconds);
  p.facing = normal(direction, p.facing);
  const windupTicks = def.windupTicks ?? Math.floor(def.windup * 60),
    range =
      def.range * (g.pilot ? p.combatScale : 1) +
      (g.pilot ? (R.walkSpeed * def.stepIn * Math.max(0, windupTicks - R.stepInFrom - 1)) / 60 : 0);
  const nearest = ["slash", "stab", "heavy"].includes(action);
  const selected =
    g.mobileAssistEnabled === false
      ? null
      : g.pilot && ((p.meleeTargeting && nearest) || action === "slash" || def.moveId === "drone_low" || def.ratRetimed)
        ? slashTarget
        : selectCombatTarget({
            nearest,
            position: p.pos,
            aim: p.facing,
            targets: g.enemies.filter((e) => !visibleIds || visibleIds.includes(e.id)),
            lineClear: (a, b) => g.world.lineClear(a, b),
            range,
            rangeOffset: (target) =>
              target.mobSize
                ? RULES.aim.mobSizeReachFactor * target.combatScale * (target.bodyScale ?? 1) * (1 - 1 / target.mobSize)
                : 0,
            coneDegrees: RULES.aim.targetConeDegrees,
            areaId: g.world.areaId,
          });
  if (selected && nearest) p.facing = { ...selected.direction };
  p.swing = {
    action,
    def,
    dir: { ...p.facing },
    start: g.time,
    hitAt: g.time + def.windup,
    end: g.time + def.windup + def.recovery,
    resolved: false,
  };
  p.ready = p.swing.end;
  if (g.pilot) {
    Object.assign(p.swing, knifeSwing(g, p, action, def));
    p.ready = p.swing.end;
    if (lowTargetId !== null) p.swing.lowTargetId = lowTargetId;
  }
  if (selected && !nearest) {
    p.swing.turnTo = { ...selected.direction };
    p.swing.assistUntil = g.time + Math.min(def.windup - 1 / 60, RULES.reactions.swingAssistTicks / 60);
  }
  if (action === "heavy") p.heavyReady = g.time + def.cooldown;
  if (action === "special") p.specialReady = g.time + def.cooldown;
  g.started = true;
  event(g, "attack", {
    actor: p,
    action,
    ...(g.pilot
      ? { moveId: def.moveId, clip: def.clip, audioWeight: def.audioWeight, weapon: "knife", material: "iron" }
      : {}),
  });
  return true;
}
function dodge(g, move, aim) {
  if (g.pilot) {
    knifeDodge(g, move, aim);
    return;
  }
  const p = g.player;
  if (g.finished || p.hp <= 0 || p.dodgeReady > g.time + EPS) return;
  p.swing = null;
  p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.velocity = { x: 0, z: 0 };
  p.dodgeDirection = normal(move ?? p.facing, p.facing);
  p.facing = { ...p.dodgeDirection };
  p.dodgeUntil = g.time + LEGACY.player.dodge.seconds;
  p.invulnerableUntil = g.time + LEGACY.player.dodge.invulnerableSeconds;
  p.dodgeReady = g.time + LEGACY.player.dodge.cooldownSeconds;
  g.started = true;
  event(g, "dodge", { actor: p });
}
export function receiveHit(g, hit) {
  if (safehouseProtected(g) || safehouseBlocksSegment(g, hit.origin, g.player.pos)) return false;
  if (g.pilot) return g.finished ? false : knifeReceive(g, hit);
  const p = g.player,
    t = g.time;
  if (g.finished || p.hp <= 0 || t < p.invulnerableUntil) return false;
  let amount = hit.amount;
  if (p.guarding && hit.block && inside(p.facing, sub(hit.origin, p.pos), LEGACY.player.guard.arc)) {
    p.guardRecoverAt = t + LEGACY.player.guardRecoverSeconds;
    if (t < p.parryUntil && hit.parry && p.guard >= amount) {
      p.guard -= amount;
      p.parryUntil = 0;
      if (hit.attacker && hit.attacker.kind !== WARLORD) {
        hit.attacker.swing = null;
        hit.attacker.ready =
          hit.attacker.recoverUntil =
          hit.attacker.staggerUntil =
            t + LEGACY.player.guard.parryStunSeconds;
      }
      notify(g, HUD_TEXT.parry);
      event(g, "parry", { actor: p });
      return false;
    }
    const cost = amount * LEGACY.player.guard.blockCostFactor;
    if (p.guard >= cost) {
      p.guard -= cost;
      amount *= LEGACY.player.guard.blockedDamageFactor;
      event(g, "block", { actor: p });
    } else {
      p.guard = 0;
      p.guarding = false;
      p.parryUntil = 0;
      p.guardBrokenUntil = t + LEGACY.player.guard.brokenSeconds;
      notify(g, HUD_TEXT.guardBroken);
      event(g, "guard-break", { actor: p });
    }
  }
  p.hp = Math.max(0, p.hp - amount);
  p.flashUntil = t + RULES.hitFlashSeconds;
  event(g, "hit", { actor: p, amount });
  if (p.hp <= 0) {
    g.activeGrenades = [];
    g.finished = true;
    g.won = false;
    event(g, "death", { actor: p });
  }
  return true;
}
function flameHit(g, target, damage, { source }) {
  if (safehouseWeaponBlocked(g) || safehouseBlocksSegment(g, source.position, target.pos)) return;
  const amount = Math.min(target.hp, cursedDamage(g, damage));
  if (!(amount > 0)) return;
  target.hp = Math.max(0, target.hp - amount);
  target.flashUntil = g.time + RULES.hitFlashSeconds;
  target.flameBurnUntil = g.time + FLAME_VISUAL_DATA.burnSeconds;
  target.flameBurnFrom = { x: source.position.x, z: source.position.z };
  if (target.home) alertResident(g, target);
  const direction = normal({ x: source.direction.x, z: source.direction.z });
  event(g, "hit", {
    actor: target,
    amount,
    position: { ...target.pos },
    weapon: "flamethrower",
    attackClass: "fire",
    impactDirection: direction,
    material: "fire",
  });
  if (target.hp <= 0) {
    stopBoneSaw(g, target, "death");
    stageProgressionDeath(g, target, g.world.flameData.pickupId, amount);
    target.swing = null;
    target.response = rigResponse(target.rig, 0, g.time);
    kill(g, target, { weapon: "flamethrower", attackClass: "fire", impactDirection: direction });
  }
}
function kill(g, e, meta = {}) {
  stopBoneSaw(g, e, "death");
  if (!g.enemies.includes(e)) return;
  stopBossFlame(g, e, "death");
  stopBossRanged(g, e);
  resetBossPursuit(e);
  if (e.animalRole) {
    e.completedAttack = null;
    e.wokeAt = null;
  }
  if (rigText(e.rig, "brain") === "drone") {
    const death = recordDroneDeath(g.droneDeaths, { placementKey: e.placementKey, areaId: g.world.areaId, hp: e.hp });
    if (!death.grantKillCredit) return;
    g.droneDeaths = death.keys;
    e.response = { clip: RULES.reactions.droneDeath.clip, start: g.time, ticks: RULES.reactions.droneDeath.ticks };
  }
  if (g.finishers && !e.finisher && meta.attackClass !== "saw") {
    const active = (g.corpses ?? []).reduce(
      (cost, c) => cost + ((c.finisherPartsUntil ?? c.finisherHeadUntil) > g.time ? (c.finisher?.cost ?? 1) : 0),
      0,
    );
    e.finisher = selectFinisher(
      {
        victimId: e.id,
        victimKey: e.placementKey ?? e.id,
        areaId: g.world.areaId,
        lethal: e.hp <= 0,
        nativeDeath: {
          clip: e.response?.clip ?? "Death",
          seconds: (e.response?.ticks ?? GAME_DATA.creatures.defaultResponse.deathTicks) / 60,
        },
        ...meta,
      },
      {
        support: e.finisherSupport ?? [],
        budget: Math.max(0, g.finishers.maxHeads - active),
        ordinal: g.kills,
        recentRecipeId: g.finishers.recentRecipeId,
      },
    );
    if (e.finisher) {
      g.finishers.recentRecipeId = e.finisher.recipeId;
      g.finishers.lastVictimId = e.id;
      if (e.finisher.cost > 0) e.finisherPartsUntil = g.time + FINISHER_DATA.limits.partLifetime;
      if (e.finisher.parts.includes("head")) e.finisherHeadUntil = g.time + FINISHER_DATA.limits.partLifetime;
    }
  }
  if (g.supplies && !e.markedHunter)
    g.supplies = issueSupply(g.supplies, {
      areaId: g.world.areaId,
      placementKey: e.placementKey,
      position: e.pos,
      hp: e.hp,
      rules: g.lootRules,
      cycle: g.animalCycle,
    }).state;
  g.enemies = g.enemies.filter((x) => x !== e);
  g.kills++;
  recordResidentKill(g, e);
  event(g, "death", { actor: e, ...meta });
  if (g.pilot) {
    g.corpses.push(e);
    if (!g.enemies.length) {
      if (g.areaResidents) {
        g.encounterCleared = true;
        g.encounterActive = false;
      } else {
        g.finished = true;
        g.won = g.player.hp > 0;
      }
      notify(g, g.encounter ? HUD_TEXT.hollowCleared : HUD_TEXT.knifeCleared);
    }
    if (e.bossProfile) {
      notify(
        g,
        fillText(HUD_TEXT.bossDefeated, { name: e.bossName }) +
          (g.supplies?.pending.some((row) => row.placementKey === e.placementKey) ? HUD_TEXT.suppliesAwait : ""),
      );
      event(g, "boss-defeated", { actor: e, placementKey: e.placementKey, name: e.bossName });
    }
    return;
  }
  if (e.kind === WARLORD) {
    g.finished = true;
    g.won = true;
    return;
  }
  const drops = LEGACY.loot;
  if (g.kills % drops.every === 0)
    g.loot.push({
      id: ++serial,
      pos: { ...e.pos },
      kind: (g.kills / drops.every - 1) % drops.kinds,
      tier: Math.min(drops.maxTier, g.wave - 1),
    });
  if (!g.enemies.length) {
    g.player.hp = Math.min(g.player.maxHP, g.player.hp + LEGACY.waveClearHeal);
    g.nextWave = g.time + WAVES.clearDelaySeconds;
    notify(g, fillText(HUD_TEXT.waveCleared, { hp: LEGACY.waveClearHeal }));
  }
}
function strike(g, s) {
  if (safehouseWeaponBlocked(g)) return;
  const p = g.player,
    def = s.def;
  event(g, "strike", { actor: p, action: s.action, dir: s.dir, range: def.range });
  const candidates = g.enemies.filter(
    (e) =>
      e.hp > 0 &&
      mag(sub(e.pos, p.pos)) <= def.range + EPS &&
      inside(s.dir, sub(e.pos, p.pos), def.arc) &&
      g.world.lineClear(p.pos, e.pos),
  );
  if (def.single) candidates.sort((a, b) => mag(sub(a.pos, p.pos)) - mag(sub(b.pos, p.pos)));
  for (const e of def.single ? candidates.slice(0, 1) : candidates) {
    const delta = normal(sub(e.pos, p.pos));
    e.hp = Math.max(0, e.hp - p.damage * def.multiplier);
    e.flashUntil = g.time + RULES.hitFlashSeconds;
    event(g, "hit", { actor: e, amount: p.damage * def.multiplier });
    if (e.hp <= 0) kill(g, e);
    else if (e.kind !== WARLORD) {
      e.staggerUntil = g.time + def.stagger;
      moveBody(g, e, { x: delta.x * LEGACY.hitKnockback, z: delta.z * LEGACY.hitKnockback });
    }
  }
}
export function spawnWave(g) {
  if (g.encounter) return hollowSpawn(g);
  if (g.pilot) {
    const position = knifeSpawnPosition(g);
    if (!position) return false;
    g.wave = 1;
    g.enemies = [
      knifeEnergy(
        Object.assign(enemy(0, position), {
          rig: "goblin",
          weapon: "knife",
          combatScale: g.player.combatScale,
          bodyScale: R.goblinBodyScale,
          hp: R.goblinHealth,
          maxHP: R.goblinHealth,
          lastMove: null,
        }),
        R.goblinRegen,
      ),
    ];
    notify(g, HUD_TEXT.goblinEncounter);
    event(g, "wave");
    return;
  }
  g.wave++;
  const finalWave = g.wave === WAVES.finalWave,
    count = finalWave ? 1 : WAVES.baseCount + g.wave;
  g.enemies = Array.from({ length: count }, (_, i) =>
    enemy(finalWave ? WARLORD : i % WAVES.kindCycle, {
      x: count === 1 ? 0 : ((i % LEGACY.formation.columns) - LEGACY.formation.centerColumn) * LEGACY.formation.xSpacing,
      z: -1 + Math.floor(i / LEGACY.formation.columns) * LEGACY.formation.zSpacing,
    }),
  );
  notify(g, finalWave ? HUD_TEXT.warlord : fillText(HUD_TEXT.wave, { wave: g.wave, final: WAVES.finalWave }));
  event(g, "wave");
}
const wideSwing = (e) => e.kind === WARLORD && e.pattern === WAVES.widePattern;
const radius = (e) => (wideSwing(e) ? LEGACY.wideSwing.radius : legacyKind(e.kind).swingRadius);
const arc = (e) => (wideSwing(e) ? LEGACY.wideSwing.arc : legacyKind(e.kind).swingArc);
function bolt(g, pos, dir, amount) {
  g.bolts.push({ id: ++serial, pos: { ...pos }, dir: { ...dir }, amount, expires: g.time + WAVES.boltLifeSeconds });
}
function enemyTick(g, e, dt, services = {}) {
  if (e.hp > 0 && safehouseProtected(g)) {
    stopBossFlame(g, e);
    stopBossRanged(g, e);
    stopBoneSaw(g, e, "safehouse");
    e.sawPhase = null;
    e.swing = null;
    e.completedAttack = null;
    if (e.droneState && !e.safehouseSuppressed) e.droneState = createDroneState();
    e.safehouseSuppressed = true;
    if (e.residentIntent?.pursuitScope === "area" && e.alerted) {
      e.returning = false;
      return;
    }
    if (e.home) {
      e.alerted = false;
      e.returning = true;
      residentPatrol(g, e, dt);
    }
    return;
  }
  e.safehouseSuppressed = false;
  if (g.pilot) {
    knifeEnemy(g, e, dt, services);
    return;
  }
  if (e.hp <= 0) return;
  const t = g.time,
    offset = sub(g.player.pos, e.pos),
    distance = mag(offset),
    dir = normal(offset, e.facing);
  const row = legacyKind(e.kind);
  if (!e.alerted && distance > LEGACY.alertDistance) return;
  e.alerted = true;
  if (e.swing) {
    if (t + EPS >= e.swing.hitAt) {
      const s = e.swing;
      e.swing = null;
      const ranged = e.kind === RANGED || (e.kind === WARLORD && e.pattern === WAVES.rangedPattern),
        amount = row.damage;
      if (ranged) {
        bolt(g, s.pos, s.dir, amount);
        if (e.kind === WARLORD) {
          bolt(g, s.pos, rotate(s.dir, Math.PI / WAVES.boltSpreadPiDivisor), amount);
          bolt(g, s.pos, rotate(s.dir, -Math.PI / WAVES.boltSpreadPiDivisor), amount);
        }
      } else {
        const delta = sub(g.player.pos, s.pos);
        if (
          mag(delta) < radius(e) + LEGACY.reachSlack &&
          inside(s.dir, delta, arc(e)) &&
          g.world.lineClear(s.pos, g.player.pos)
        )
          receiveHit(g, { amount, origin: s.pos, attacker: e, block: e.kind !== WARLORD, parry: e.kind === 0 });
      }
      e.recoverUntil = Math.max(e.recoverUntil, t + row.recoverSeconds);
      e.ready = Math.max(e.ready, t + row.readySeconds);
      if (e.kind === WARLORD) e.pattern = (e.pattern + 1) % WAVES.patternCount;
    }
    return;
  }
  if (t < e.recoverUntil || t < e.staggerUntil) return;
  const ranged = e.kind === RANGED || (e.kind === WARLORD && e.pattern === WAVES.rangedPattern),
    reach = ranged ? LEGACY.rangedReach : radius(e) - LEGACY.reachSlack;
  if (distance > reach || !g.world.lineClear(e.pos, g.player.pos)) {
    enemyMove(g, e, dir, row.moveSpeed, dt);
    return;
  }
  if (e.kind === RANGED && distance < WAVES.retreatDistance && t < e.ready)
    enemyMove(g, e, { x: -dir.x, z: -dir.z }, WAVES.retreatSpeed, dt, true);
  else e.facing = turn(e.facing, dir, 360 * dt);
  if (t + EPS >= e.ready && dot(e.facing, dir) > LEGACY.aimDot) {
    const delay = row.windupSeconds;
    e.swing = { dir, pos: { ...e.pos }, start: t, hitAt: t + delay, end: t + delay + LEGACY.swingSeconds };
    event(g, "enemy-attack", { actor: e, dir, range: radius(e), arc: arc(e) });
  }
}
function turn(a, b, degrees) {
  const cross = a.x * b.z - a.z * b.x,
    d = dot(a, b);
  const angle = Math.atan2(cross, d),
    limit = (degrees * Math.PI) / 180;
  const theta = Math.sign(angle) * Math.min(Math.abs(angle), limit);
  return normal({ x: a.x * Math.cos(theta) - a.z * Math.sin(theta), z: a.x * Math.sin(theta) + a.z * Math.cos(theta) });
}
function enemyMove(g, e, dir, speed, dt, backward = false) {
  if (g.areaResidents && e.home && e.alerted && !backward) {
    const goal = g.player.pos,
      target = (g.bridgeSteering ??= createBridgeSteering()).steer({
        world: g.world,
        actor: e,
        goal,
        time: g.time,
        ...(e.markedHunter || (rigCapability(e.rig, "areaPursuit") && e.residentIntent?.pursuitScope === "area")
          ? { leash: Infinity }
          : {}),
      });
    if (target !== goal) dir = normal(sub(target, e.pos), dir);
  } else g.bridgeSteering?.reset(e);
  let delta = { x: dir.x * speed * dt, z: dir.z * speed * dt },
    next = g.world.move(e.pos, delta, e.radius);
  if (mag(sub(next, e.pos)) < speed * dt * RULES.movement.sidestepFraction) {
    const side = { x: -dir.z, z: dir.x };
    delta = { x: side.x * speed * dt, z: side.z * speed * dt };
    next = g.world.move(e.pos, delta, e.radius);
    if (mag(sub(next, e.pos)) < speed * dt * RULES.movement.sidestepFraction) delta = { x: -delta.x, z: -delta.z };
    dir = normal(delta);
  }
  e.facing = turn(e.facing, backward ? { x: -dir.x, z: -dir.z } : dir, 360 * dt);
  const align = Math.max(0, dot(e.facing, backward ? { x: -dir.x, z: -dir.z } : dir));
  moveBody(g, e, { x: dir.x * speed * dt * align, z: dir.z * speed * dt * align });
}
function projectiles(g, dt) {
  for (const b of g.bolts) {
    if (b.source === "reaper") continue;
    if (g.time >= b.expires) {
      b.dead = true;
      continue;
    }
    const next = { x: b.pos.x + b.dir.x * LEGACY.boltSpeed * dt, z: b.pos.z + b.dir.z * LEGACY.boltSpeed * dt };
    if (!g.world.lineClear(b.pos, next)) {
      b.dead = true;
      continue;
    }
    const seg = sub(next, b.pos),
      delta = sub(g.player.pos, b.pos),
      length = dot(seg, seg),
      t = Math.max(0, Math.min(1, dot(delta, seg) / Math.max(MIN_SEGMENT, length)));
    if (mag(sub(g.player.pos, { x: b.pos.x + seg.x * t, z: b.pos.z + seg.z * t })) < LEGACY.boltHitRadius) {
      receiveHit(g, { amount: b.amount, origin: b.pos });
      b.dead = true;
    } else b.pos = next;
  }
  g.bolts = g.bolts.filter((b) => !b.dead);
}
function collect(g) {
  const p = g.player;
  for (const l of g.loot) {
    if (mag(sub(l.pos, p.pos)) >= LEGACY.loot.pickupRadius) continue;
    l.collected = true;
    if (l.kind === 0) {
      const pct = LEGACY.loot.blade.base + l.tier * LEGACY.loot.blade.step;
      p.damage *= 1 + pct;
      p.weaponLevel++;
      notify(g, fillText(HUD_TEXT.blade, { pct: Math.round(pct * 100) }));
    } else if (l.kind === 1) {
      const hp = LEGACY.loot.armour.base + l.tier * LEGACY.loot.armour.step;
      p.maxHP += hp;
      p.hp = Math.min(p.maxHP, p.hp + hp);
      p.armourLevel++;
      notify(g, fillText(HUD_TEXT.armour, { hp }));
    } else {
      const hp = LEGACY.loot.tonic.base + l.tier * LEGACY.loot.tonic.step;
      p.hp = Math.min(p.maxHP, p.hp + hp);
      notify(g, fillText(HUD_TEXT.tonic, { hp }));
    }
    event(g, "loot", { actor: p });
  }
  g.loot = g.loot.filter((l) => !l.collected);
}
export function resetMobileControls(g) {
  if (g) {
    stopBoneSaw(g, g.player, "input-clear");
    g.touchTarget = null;
    g.touchTargetReady = false;
  }
  if (!g?.mobileAim) return;
  g.mobileAim = createMobileAimState(Math.atan2(g.player.facing.x, g.player.facing.z));
  g.mobileAiming = false;
  g.player.velocity = { x: 0, z: 0 };
}
function mobileControl(g, intent, dt, services) {
  if (!g.mobileAim) return intent;
  const p = g.player,
    heading = Math.atan2(p.facing.x, p.facing.z);
  if (intent.mobile && !intent.moveHeld) p.velocity = { x: 0, z: 0 };
  const flame = !!g.flame?.equipped,
    manualFlame = flame && intent.manualFlameAim && validDirection(intent.aim);
  if ((!intent.mobile && !flame) || intent.cancel || (validDirection(intent.aim) && !manualFlame)) {
    g.mobileAim = createMobileAimState(heading);
    g.mobileAiming = false;
    if (intent.cancel) p.velocity = { x: 0, z: 0 };
    return intent;
  }
  const areaId = g.world.areaId,
    visible = intent.combatVisibleIds ?? intent.pistolVisibleIds;
  const ranged = !!selectedBossRanged(g) || !!g.pistol?.equipped || !!g.rifle?.selected || !!g.flame?.equipped,
    busy = !!p.swing || g.time < p.dodgeUntil || g.time < p.hurtUntil || (!!intent.guard && !ranged);
  if (busy) g.mobileAim = { ...g.mobileAim, heading };
  const result = stepMobileAim(g.mobileAim, {
    dt,
    move: intent.move ?? { x: 0, z: 0 },
    position: p.pos,
    targets: g.enemies.map((e) => ({
      id: e.placementKey,
      pos: e.pos,
      hp: e.hp,
      hostile: e.hostile !== false,
      visible: e.visible !== false && (!visible || visible.includes(e.id)),
      areaId: e.areaId ?? areaId,
      radius: e.radius,
    })),
    areaId,
    lineClear: (a, b) => g.world.lineClear(a, b),
    mobile: !!intent.mobile,
    moveHeld: !!intent.moveHeld,
    alive: p.hp > 0,
    assistEnabled: g.mobileAssistEnabled,
    pistolEquipped: ranged,
    rangedRange: !flame ? selectedRangedProfile(g)?.rules.range : null,
    flameRange: flame ? g.world.flameData?.contact.range : null,
    fireHeld:
      ranged &&
      selectedBossRanged(g) !== "grenade" &&
      ((intent.held ?? []).includes("fire") || (intent.actions ?? []).includes("fire")),
    manualHeading: manualFlame ? Math.atan2(intent.aim.x, intent.aim.z) : null,
    flameEligible: services.flameAimEligible
      ? (key) =>
          services.flameAimEligible(
            g,
            g.enemies.find((e) => e.placementKey === key),
          )
      : undefined,
  });
  g.mobileAim = result.state;
  g.mobileAiming = !!intent.mobile;
  if (intent.mobile && !intent.moveHeld) p.velocity = { x: 0, z: 0 };
  if (!busy) p.facing = { ...result.direction };
  return { ...intent, move: result.move, aim: busy ? null : { ...p.facing } };
}
function resetDeadPlayerBossPursuit(g) {
  if (g.player.hp > 0) return;
  for (const e of g.enemies) {
    stopBossFlame(g, e, "player-death");
    resetBossPursuit(e);
  }
}
// Creature half of a step, shared with engine/creature-sim.js; `only` limits it to some creatures.
export function stepCreatureAI(g, dt, services = {}, only = null) {
  stepBossRockets(g, { trace: services.bossRangedTrace, receive: knifeReceive });
  if (!g.finished)
    for (const e of [...(only ?? g.enemies)]) {
      enemyTick(g, e, dt, services);
      if (g.finished) break;
    }
}
export function resolveCreatureContacts(g, before, ratBefore) {
  if (g.pilot) knifeContacts(g, before, ratBefore);
  if (g.areaHazards) applyAreaHazards(g, knifeReceive);
}
export function stepGame(g, intent = {}, dt = 1 / 60, services = {}) {
  intent = prepareSafehouseStep(g, intent);
  if (g.pilot && (!Number.isFinite(dt) || Math.abs(dt - 1 / 60) > EPS))
    throw Error("Knife pilot requires fixed 60 Hz simulation ticks");
  g.events = [];
  g.bossRangedInputCancelled = !!intent.cancel;
  if (intent.cancel || intent.paused || g.finished) clearBossRanged(g);
  if (g.pilot) g.player.running = false;
  if (intent.paused || g.finished) stopReaper(g, "pause");
  if (intent.cancel || intent.paused || g.finished || g.weaponsLowered) stopRailgun(g, "interrupted");
  if (intent.cancel || intent.paused || g.finished) {
    stopBoneSaw(g, g.player, "cancel");
    for (const e of g.enemies)
      if (e.saw || e.sawPhase) {
        stopBoneSaw(g, e, "cancel");
        e.sawPhase = null;
      }
  }
  if (g.pilot && (intent.cancel || intent.paused)) {
    if (g.player.swing) g.player.swing.turnTo = null;
    g.player.buffer = null;
    g.player.guarding = false;
    g.player.parryUntil = 0;
    g.player.parryReleased = true;
  }
  if (g.flame && (g.finished || intent.cancel || intent.paused)) stopFlame(g);
  if (g.finished) {
    if (g.player.hp <= 0) clearMarkedHunters(g, { death: true }), clearCursed(g, "death");
    stopRailgun(g, "terminal");
    stopReaper(g, "terminal");
    stopAllBoneSaws(g, "terminal");
    resetDeadPlayerBossPursuit(g);
    stopBossFlames(g, "finished");
    g.activeGrenades = [];
    g.activeRockets = [];
    return;
  }
  if (intent.paused) {
    stopBossFlames(g, "pause");
    return;
  }
  const ratBefore =
    g.ratContact &&
    g.enemies.some(
      (e) =>
        rigCapability(e.rig, "lowStrike") &&
        (e.alerted || e.swing || mag(sub(e.pos, g.player.pos)) <= RULES.awareness.ratContactDistance),
    )
      ? g.ratContact.capture(g)
      : null;
  const before = g.pilot ? new Map([g.player, ...g.enemies].map((e) => [e.id, snapshot(e)])) : null;
  g.time += dt;
  if (g.pilot) g.tick++;
  const p = g.player,
    t = g.time;
  stepAirdrop(g, dt);
  stepBossGrenades(g, (...args) => cursedHit(g, ...args), services);
  stepRockets(g, (...args) => cursedHit(g, ...args), services);
  stepTrapCrates(g, receiveHit, services);
  intent = mobileControl(g, intent, dt, services);
  intent = applyTouchTarget(g, intent, services);
  if (g.rifleAction && (intent.cancel || g.flame?.equipped)) g.rifleAction.reloadingUntil = 0;
  intent = g.weaponsLowered
    ? intent
    : g.flame?.equipped
      ? flameIntent(g, intent)
      : selectedBossRanged(g)
        ? bossEquipmentIntent(g, intent, services.dispatchBossEquipment, (...args) => cursedHit(g, ...args), services)
        : g.rifle?.selected
          ? rifleIntent(g, intent, services.dispatchRifle)
          : pistolIntent(g, intent, services.dispatchPistol, services.dispatchMarshalPistol);
  if (!validDirection(intent.aim)) intent = { ...intent, aim: null };
  intent = boneSawIntent(g, intent);
  const move = intent.move ?? { x: 0, z: 0 };
  if (intent.dodge) {
    const until = p.dodgeUntil;
    dodge(g, move, intent.aim);
    if (g.pistol?.equipped && p.dodgeUntil !== until) g.pistolUserFacing = { ...p.facing };
  }
  const swinging = p.swing && t < p.swing.end - EPS,
    dodging = t < p.dodgeUntil - EPS;
  p.guarding = !!intent.guard && !dodging && !swinging && t >= p.guardBrokenUntil && p.guard > 0;
  if (g.pilot) knifeGuard(g, intent, swinging, dodging);
  else if (p.guarding && intent.guardPressed) p.parryUntil = t + LEGACY.player.guard.parryWindowSeconds;
  if (!g.pilot && !p.guarding) p.parryUntil = 0;
  const sprintCandidate = !!(
    g.pilot &&
    intent.run &&
    !p.guarding &&
    !p.exhausted &&
    p.stamina > EPS &&
    !swinging &&
    !dodging &&
    t >= p.hurtUntil &&
    mag(move) > INPUT_DEADZONE
  );
  if (g.pilot) {
    if (!sprintCandidate) knifeRegen(g, p, dt, swinging || dodging || t < p.hurtUntil || p.saw?.active);
  } else if (!intent.guard && t >= p.guardRecoverAt && t >= p.guardBrokenUntil)
    p.guard = Math.min(100, p.guard + LEGACY.player.guard.regenPerSecond * dt);
  if (intent.aim && mag(intent.aim) > NEGLIGIBLE_DISTANCE && !swinging && !dodging) p.facing = normal(intent.aim);
  if (p.buffer && t > p.buffer.until) p.buffer = null;
  const attackDirection = validDirection(intent.aim)
    ? normal(intent.aim)
    : mag(move) > INPUT_DEADZONE
      ? normal(move)
      : p.facing;
  const visibleIds = intent.combatVisibleIds ?? intent.pistolVisibleIds;
  const priority = ["special", "heavy", "stab", "slash"],
    fresh = [...(intent.cancel ? [] : (intent.actions ?? []))].sort(
      (a, b) => priority.indexOf(a) - priority.indexOf(b),
    );
  for (const action of fresh) {
    const buffer = p.buffer;
    if (attack(g, action, attackDirection, visibleIds) || p.buffer !== buffer) break;
  }
  if (!dodging && p.buffer && t + EPS >= p.ready) {
    const buffer = p.buffer;
    p.buffer = null;
    attack(g, buffer.action, attackDirection, visibleIds);
  }
  if (!intent.cancel && !fresh.length)
    for (const a of ["stab", "slash"]) if (intent.held?.includes(a) && attack(g, a, attackDirection, visibleIds)) break;
  if (p.swing?.turnTo) {
    p.facing = turn(p.facing, p.swing.turnTo, 360 * dt);
    p.swing.dir = { ...p.facing };
    if (t + EPS >= p.swing.assistUntil) p.swing.turnTo = null;
  }
  if (!g.pilot && p.swing && !p.swing.resolved && t + EPS >= p.swing.hitAt) {
    p.swing.resolved = true;
    strike(g, p.swing);
  }
  if (!g.pilot && p.swing && t + EPS >= p.swing.end) p.swing = null;
  if (!g.finished) {
    if (dodging)
      moveBody(g, p, {
        x: p.dodgeDirection.x * (g.pilot ? R.rollSpeed : LEGACY.player.dodge.speed) * dt,
        z: p.dodgeDirection.z * (g.pilot ? R.rollSpeed : LEGACY.player.dodge.speed) * dt,
      });
    else if (!p.swing && (!g.pilot || t >= p.hurtUntil)) {
      const m = mag(move) > 1 ? normal(move) : move;
      const speed = g.pilot
        ? sprintCandidate
          ? R.runSpeed
          : R.walkSpeed * (p.exhausted ? R.exhaustWalk : 1)
        : LEGACY.player.walkSpeed;
      const scale =
        (p.guarding ? (g.pilot ? R.guardSpeed : LEGACY.player.guardMoveScale) : 1) *
        (p.saw?.active ? BONE_SAW_RULES.moveScale : 1);
      const vel = { x: m.x * speed * scale, z: m.z * speed * scale },
        difference = sub(vel, p.velocity),
        n = mag(difference),
        step = (mag(m) > INPUT_DEADZONE ? LEGACY.player.accelerate : LEGACY.player.decelerate) * dt;
      p.velocity =
        n <= step ? vel : { x: p.velocity.x + (difference.x / n) * step, z: p.velocity.z + (difference.z / n) * step };
      const start = { ...p.pos };
      moveBody(g, p, { x: p.velocity.x * dt, z: p.velocity.z * dt });
      if (sprintCandidate && mag(sub(p.pos, start)) > EPS) {
        p.running = true;
        p.guard = p.stamina - R.runDrain * dt; // No action recovery delay.
      }
      if (!intent.aim && mag(m) > INPUT_DEADZONE && !p.guarding)
        p.facing = turn(p.facing, m, LEGACY.player.turnRate * dt);
    } else {
      p.velocity = { x: 0, z: 0 };
      if (g.pilot) knifeStepIn(g, p, dt);
    }
    // Defer only a possible sprint tick until collision has proved displacement.
    // Unchanged non-sprint input retains the existing action/regen ordering.
    if (sprintCandidate && !p.running) knifeRegen(g, p, dt, !!p.swing || dodging || t < p.hurtUntil);
    intent = prepareSafehouseStep(g, intent);
    if (p.saw?.active) {
      if (safehouseWeaponBlocked(g)) stopBoneSaw(g, p, "safehouse");
      else {
        knifeSpend(g, p, Math.min(p.stamina ?? p.guard, BONE_SAW_RULES.staminaPerSecond * dt));
        stepBoneSaw(g, p, g.enemies, {
          contact: (a, e) => services.sawContact?.(g, a, e) === true,
          protectedTarget: (e) => safehouseTouches(g, e.pos, e.radius),
          damage: effectiveWeaponDamage(g, "knife", BONE_SAW_RULES.damage),
          hit: (e, amount, direction) => rangedHit(g, { targetId: e.id, direction }, "knife", "knife", amount, "saw"),
        });
      }
    }
    stepFlame(g, dt, services, (target, amount, hit) => flameHit(g, target, amount, hit));
    if (mag(sub(p.pos, g.world.spawn ?? RULES.player.spawn)) >= 1) g.started = true;
    if (g.encounterActive !== false && g.started && !g.enemies.length && t + EPS >= g.nextWave) {
      if (g.wave >= WAVES.finalWave) {
        g.finished = true;
        g.won = true;
      } else spawnWave(g);
    }
    stepMarkedHunters(g, (p, c) => markedHunter(g, p, c));
    stepCursedRelic(g, (p, c) => markedHunter(g, p, c));
    if (g.respawn) reviveAreaResidents(g);
    stepCreatureAI(g, dt, services);
    if (p.hp <= 0 || g.finished || g.time < p.hurtUntil || g.time < p.dodgeUntil) stopRailgun(g, "interrupted");
    if (p.hp <= 0 || g.finished || g.time < p.hurtUntil || g.time < p.dodgeUntil) stopBoneSaw(g, p, "interrupted");
    resolveCreatureContacts(g, before, ratBefore);
    if (!g.finished) {
      stepReaper(g, dt, {
        source: services.reaperSource,
        trace: services.grenadeTrace,
        aimHeight: services.rocketAimHeight,
        emitBolt: (b) => g.bolts.push({ id: ++serial, ...b }),
        hit: (shot, amount) => cursedHit(g, shot, "reaper", REAPER_ITEM_ID, amount, "bullet"),
      });
      projectiles(g, dt);
      collect(g);
    }
  }
  if (g.finished) {
    clearBossRanged(g);
    if (g.player.hp <= 0) clearMarkedHunters(g, { death: true });
    stopRailgun(g, "terminal");
    stopReaper(g, "terminal");
    stopAllBoneSaws(g, "terminal");
    resetDeadPlayerBossPursuit(g);
    stopBossFlames(g, "finished");
    g.activeGrenades = [];
    stopFlame(g);
    if (g.areaHazards) g.areaHazards = [];
  }
  if (g.healthRegen && !g.finished) stepPlayerHealth(g.player, dt);
  if (g.mobileAim) {
    if (g.finished) resetMobileControls(g);
    else if (!g.enemies.some((e) => e.placementKey === g.mobileAim.targetId && e.hp > 0))
      g.mobileAim = { ...g.mobileAim, targetId: null, bearing: null };
  }
}

// One pool for action costs and defence. The legacy guard field is an alias,
// so existing HUD/hit callers cannot create a second independent resource.
function knifeEnergy(entity, regen = 1) {
  if (entity.maxStamina !== undefined) return entity;
  entity.stamina = R.maxStamina;
  entity.maxStamina = R.maxStamina;
  entity.exhausted = false;
  entity.staminaRegen = regen;
  entity.guardRecoverAt = 0;
  Object.defineProperty(entity, "guard", {
    enumerable: true,
    configurable: true,
    get() {
      return this.stamina;
    },
    set(value) {
      this.stamina = Math.max(0, Math.min(this.maxStamina, value));
      if (this.stamina <= EPS) this.exhausted = true;
    },
  });
  return entity;
}
function knifeAffordable(entity, cost) {
  if (entity.stamina <= EPS) entity.exhausted = true;
  return !entity.exhausted && entity.stamina + EPS >= cost;
}
function knifeSpend(g, entity, cost) {
  entity.guard = Math.max(0, entity.stamina - cost);
  entity.guardRecoverAt = g.time + R.regenDelay / 60;
  if (entity.exhausted) {
    entity.guarding = false;
    entity.parryUntil = 0;
  }
}
function knifeRegen(g, entity, dt, committed) {
  if (entity.stamina <= EPS) entity.exhausted = true;
  if (!committed && g.time + EPS >= entity.guardRecoverAt && g.time + EPS >= (entity.guardBrokenUntil ?? 0))
    entity.guard = entity.stamina + R.regen * (entity.staminaRegen ?? 1) * (entity.guarding ? R.guardRegen : 1) * dt;
  if (entity.exhausted && entity.stamina + EPS >= R.exhaustRecover) entity.exhausted = false;
}
function hollowSpawn(g) {
  if (g.enemies.length || g.finished || g.wave) return false;
  const profile = g.encounter,
    c = profile.character,
    radius = RULES.bodyRadius * c.bodyScale,
    p = g.player,
    forward = normal(p.facing);
  const sectors = [
    forward,
    { x: forward.z, z: -forward.x },
    { x: -forward.z, z: forward.x },
    { x: -forward.x, z: -forward.z },
  ];
  // Keep the whole group in one sector, leaving an open side. Plan every circle
  // before changing the wave or allocating IDs; a tight road retries atomically.
  for (const direction of sectors) {
    const positions = [];
    for (const distance of RULES.spawning.distances)
      for (const lateral of RULES.spawning.laterals) {
        if (positions.length === profile.count) continue;
        const position = g.world.move(
          p.pos,
          { x: direction.x * distance - direction.z * lateral, z: direction.z * distance + direction.x * lateral },
          radius,
        );
        const delta = sub(position, p.pos),
          circleClear =
            g.world.geometry?.clear?.(position, radius) ??
            g.world.clear?.(position, radius) ??
            g.world.lineClear(position, position);
        if (
          !circleClear ||
          !g.world.lineClear(p.pos, position) ||
          dot(delta, direction) < RULES.spawning.minForward ||
          mag(delta) < Math.max(RULES.spawning.minDistance, p.radius + radius + RULES.spawning.clearance)
        )
          continue;
        if (positions.some((other) => mag(sub(position, other)) < radius * 2 + RULES.spawning.clearance)) continue; // tuning-ok: radius to diameter
        positions.push(position);
        if (positions.length === profile.count) break;
      }
    if (positions.length !== profile.count) continue;
    g.wave = 1;
    g.enemies = positions.map((position, index) => hollowActor(g, position, index));
    if (g.areaResidents) initializeAreaResidents(g);
    notify(g, HUD_TEXT.hollowEncounter);
    event(g, "wave", { count: profile.count, encounter: profile.id });
    return true;
  }
  return false;
}
// The opening group and placed residents share the same Hollow factory/rules.
function hollowActor(g, position, index = 0, mobSize = 1) {
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
function markedHunter(g, position, config) {
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
      const role = resolveBoundAnimalRole(e, {
        areaId: area,
        animalCycle: g.animalCycle,
        behaviourCapabilities: ENGINE_CREATURE_CAPABILITIES,
      });
      if (role) {
        e.animalRole = role;
        e.residentIntent = role.intent;
        Object.assign(e, role.parameters);
        e.completedAttack = null;
        e.wokeAt = null;
      }
    }
  for (const e of residents)
    if (rigCapability(e.rig, "nativeSkeleton")) {
      const role = resolveBoundAnimalRole(e, {
        areaId: area,
        animalCycle: g.animalCycle,
        behaviourCapabilities: ENGINE_CREATURE_CAPABILITIES,
      });
      if (role) {
        e.animalRole = role;
        e.residentIntent = role.intent;
        Object.assign(e, role.parameters);
        e.completedAttack = null;
        e.wokeAt = null;
      }
    }
  for (const e of residents) {
    const recipe = gauntHumanRecipe(g.animalCycle, area, e);
    if (recipe) e.humanBodyRecipe = recipe;
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
function alertResident(g, e) {
  if (!e.alerted && e.animalRole) e.wokeAt = g.time;
  e.alerted = true;
  e.returning = false;
}
function residentPatrol(g, e, dt) {
  if (airdropPull(g, e, dt, enemyMove)) return true;
  const playerHome = mag(sub(g.player.pos, e.home));
  if (e.residentIntent?.companionDistance === 0) {
    const home = territoryHomeStep(e.residentIntent, {
      alive: e.hp > 0,
      alerted: e.alerted,
      returning: e.returning,
      swingActive: !!e.swing,
      hurt: g.time < e.recoverUntil || g.time < e.staggerUntil,
      playerHomeDistance: playerHome,
      homeDistance: mag(sub(e.pos, e.home)),
      returnPathClear: g.world.lineClear(e.pos, e.home),
    });
    e.alerted = home.alerted;
    e.returning = home.returning;
    if (home.action === "hold") return true;
  } else {
    if (e.alerted && playerHome > (e.residentIntent?.homeLeash ?? RULES.movement.homeLeash)) {
      e.alerted = false;
      e.returning = true;
    }
    if (e.returning && mag(sub(e.pos, e.home)) < RULES.movement.returnArrive) e.returning = false;
  }
  if (e.residentIntent?.companionDistance > 0)
    e.packCompanions = observeResidentCompanions(
      e.residentIntent,
      e,
      g.enemies.filter((other) => other.placementKey === "east-roamer-9" && other.rig === DOG_RIG),
      { areaId: g.world.areaId, lineClear: (a, b) => g.world.lineClear(a, b) },
    );
  const playerDistance = mag(sub(g.player.pos, e.pos)),
    lineClear = g.world.lineClear(e.pos, g.player.pos);
  const wake =
    !safehouseProtected(g) &&
    (e.residentIntent
      ? canWakeResident(e.residentIntent, {
          alive: e.hp > 0,
          playerAlive: g.player.hp > 0,
          sameArea: (e.areaId ?? g.world.areaId) === g.world.areaId,
          lineClear,
          distance: playerDistance,
          playerHomeDistance: playerHome,
          ...e.packCompanions,
        })
      : playerDistance <= RULES.awareness.sightDistance && lineClear);
  if (e.animalRole && e.returning) {
    e.completedAttack = null;
    e.wokeAt = null;
  }
  if (!e.returning && !e.alerted && wake) alertResident(g, e);
  if (e.alerted) return false;
  let goal = e.returning ? e.home : e.patrol[e.patrolIndex],
    delta = sub(goal, e.pos),
    distance = mag(delta);
  if (distance < RULES.movement.patrolArrive && !e.returning) {
    e.patrolIndex = 1 - e.patrolIndex;
    goal = e.patrol[e.patrolIndex];
    delta = sub(goal, e.pos);
    distance = mag(delta);
  }
  if (distance > RULES.movement.patrolMove)
    enemyMove(g, e, normal(delta), e.moveSpeed, Math.min(dt, distance / e.moveSpeed));
  return true;
}
function knifeSpawnPosition(g) {
  const radius = RULES.bodyRadius,
    player = g.player;
  // Each projection uses the actual world collision radius. Never assume that a
  // requested offset survives sliding: it may collapse back to the start point.
  const offsets = RULES.spawning.knifeOffsets.map(([x, z]) => ({ x, z }));
  for (const offset of offsets) {
    const position = g.world.move(player.pos, offset, radius);
    const circleClear =
      g.world.geometry?.clear?.(position, radius) ??
      g.world.clear?.(position, radius) ??
      g.world.lineClear(position, position);
    if (!circleClear || !g.world.lineClear(player.pos, position)) continue;
    if ([player, ...g.enemies].some((e) => e.hp > 0 && mag(sub(position, e.pos)) < radius + e.radius)) continue;
    return position;
  }
  return null;
}
// The pilot uses the same entity/world loop, with a focused move/contact profile.
// Explicit activation lets Lead integrate the matching assets atomically.
function knifeMove(entity, action) {
  const selected = bossMove(entity, action);
  if (selected) return selected;
  const id =
    action === "slash"
      ? entity.lastMove === "light_right"
        ? "light_left"
        : "light_right"
      : { stab: "thrust", heavy: "heavy_overhead", special: "skill_pommel" }[action];
  return entity.kind < 0 && entity.meleeMoves ? (entity.meleeMoves[id] ?? KNIFE_MOVES[id]) : KNIFE_MOVES[id];
}
function knifeSwing(g, entity, action, def) {
  entity.lastMove = def.moveId;
  return {
    action,
    def,
    moveId: def.moveId,
    clip: def.clip,
    path: def.path,
    sourceContact: def.sourceContact,
    native: !!def.native,
    timing: { windup: def.windupTicks, active: def.activeTicks, recovery: def.recoveryTicks },
    ageTicks: 0,
    start: g.time,
    hitAt: g.time + def.windup,
    end: g.time + def.windup + def.active + def.recovery,
    dir: { ...entity.facing },
    hitIds: new Set(),
    resolved: false,
    activeEmitted: false,
  };
}
const contactSnapshot = (e) => (e.contactRig ? { ...e, rig: e.contactRig } : e);
const snapshot = (e) => ({ ...e, pos: { ...e.pos }, facing: { ...e.facing } });
function knifeDodge(g, move, aim) {
  const p = g.player,
    t = g.time;
  if (g.finished || p.hp <= 0 || p.dodgeReady > t + EPS || p.swing || p.hurtUntil > t || p.guardBrokenUntil > t) return;
  if (!knifeAffordable(p, R.rollCost)) {
    p.buffer = null;
    return;
  }
  knifeSpend(g, p, R.rollCost);
  p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.velocity = { x: 0, z: 0 };
  const facing =
    aim && Number.isFinite(aim.x) && Number.isFinite(aim.z) && mag(aim) > NEGLIGIBLE_DISTANCE ? normal(aim) : p.facing;
  p.dodgeDirection = normal(move, { x: -facing.x, z: -facing.z });
  p.facing = { ...p.dodgeDirection };
  p.dodgeStart = t;
  p.dodgeUntil = t + R.roll / 60;
  p.dodgeReady = p.dodgeUntil;
  // Safety is a middle interval, not instant invulnerability on press.
  p.invulnerableUntil = 0;
  g.started = true;
  event(g, "dodge", { actor: p, clip: "Roll", ticks: R.roll });
}
function knifeGuard(g, intent, swinging, dodging) {
  const p = g.player,
    t = g.time;
  p.guarding =
    !!intent.guard &&
    !swinging &&
    !dodging &&
    t >= p.hurtUntil &&
    t >= p.guardBrokenUntil &&
    t >= p.guardExposedUntil &&
    p.guard > 0 &&
    !p.exhausted;
  if (p.guarding) {
    if (intent.guardPressed && t + EPS >= p.parryReady) {
      p.guardStart = t;
      p.parryUntil = t + R.parry / 60;
      p.parryReady = t + R.parryCooldown / 60;
      p.parryReleased = false;
    }
    if (!Number.isFinite(p.guardStart)) p.guardStart = t - R.parry / 60;
  } else if (p.parryUntil > t && !intent.cancel) {
    p.parryReleased = true;
  }
  if (p.parryReleased && t + EPS >= p.parryUntil && p.parryUntil > 0) {
    p.parryUntil = 0;
    p.guardExposedUntil = t + R.parryRecovery / 60;
    p.parryReleased = false;
  }
}
function hitMetadata(attacker, victim, def) {
  return {
    attackerId: attacker?.id ?? null,
    victimId: victim.id,
    position: { ...victim.pos },
    moveId: def?.moveId ?? null,
    audioWeight: def?.audioWeight,
    weapon: def?.weapon ?? (rigCapability(attacker?.rig, "animal") ? "teeth" : "knife"),
    material: rigCapability(attacker?.rig, "animal") ? "flesh" : "iron",
  };
}
function knifeReceive(g, hit) {
  if (safehouseProtected(g) || safehouseBlocksSegment(g, hit.origin, g.player.pos)) return false;
  const p = g.player,
    t = g.time,
    age = (t - p.dodgeStart) * 60,
    def =
      hit.def ??
      (hit.moveId === "rat_bite"
        ? RAT_BITE
        : hit.moveId === "dog_bite"
          ? DOG_BITE
          : hit.moveId === "roach_bite"
            ? ROACH_BITE
            : KNIFE_MOVES[hit.moveId]);
  if (p.hp <= 0 || (age + EPS >= R.safeStart && age <= R.safeEnd + EPS && t < p.dodgeUntil)) {
    event(g, "evade", { actor: p, ...hitMetadata(hit.attacker, p, def) });
    return false;
  }
  const meta = hitMetadata(hit.attacker, p, def);
  let amount = hit.amount,
    blocked = false;
  if (p.guarding && hit.block && inside(p.facing, sub(hit.origin, p.pos), R.guardArc)) {
    p.guardRecoverAt = t + R.regenDelay / 60;
    if (t < p.parryUntil - EPS && hit.parry) {
      p.parryUntil = 0;
      p.parryReleased = false;
      if (hit.attacker) {
        const e = hit.attacker;
        e.swing = null;
        e.ready = e.recoverUntil = e.staggerUntil = t + R.parryStun / 60;
        if (e.animalRole) e.completedAttack = null;
        e.response = { clip: "Deflected", start: t, ticks: R.parryStun };
      }
      p.response = { clip: "Parry", start: t, ticks: R.parry };
      notify(g, HUD_TEXT.parry);
      event(g, "parry", { actor: p, ...meta });
      return false;
    }
    const guardAge = (t - (p.guardStart ?? -Infinity)) * 60 - R.parry;
    const perfect = guardAge >= -EPS && guardAge < R.perfectBlock - EPS,
      cost = (def?.staminaDamage ?? amount) * (perfect ? R.perfectBlockCost : 1);
    if (p.guard + EPS >= cost) {
      blocked = true;
      knifeSpend(g, p, cost);
      amount = perfect ? 0 : Math.round(amount * (def?.chip ?? 0));
      p.response = { clip: "BlockImpact", start: t, ticks: RULES.reactions.blockImpactTicks };
      event(g, "block", { actor: p, amount, perfect, cost, ...meta });
    } else {
      knifeSpend(g, p, R.breakCost);
      p.guarding = false;
      p.parryUntil = 0;
      p.guardBrokenUntil = t + (def?.stagger ?? RULES.reactions.defaultStaggerSeconds);
      event(g, "guard-break", { actor: p, ...meta });
    }
  }
  if (amount <= 0) return false;
  amount = damageAfterVest(amount, g.vest, { blocked });
  p.hp = Math.max(0, p.hp - amount);
  p.flashUntil = t + RULES.hitFlashSeconds;
  if (blocked && p.hp > 0) {
    event(g, "hit", { actor: p, amount, blocked: true, ...meta });
    return true;
  }
  p.hurtUntil = t + (def?.stagger ?? RULES.reactions.defaultStaggerSeconds);
  p.swing = null;
  p.buffer = null;
  p.dodgeUntil = t;
  p.ready = p.hurtUntil;
  p.response = {
    clip: p.hp ? "Hit" : "Death",
    start: t,
    ticks: p.hp
      ? Math.round((def?.stagger ?? RULES.reactions.defaultStaggerSeconds) * 60)
      : GAME_DATA.creatures.defaultResponse.deathTicks,
  };
  if (def?.knockback) {
    const dir = normal(sub(p.pos, hit.origin));
    moveBody(g, p, { x: (dir.x * R.walkSpeed * def.knockback) / 60, z: (dir.z * R.walkSpeed * def.knockback) / 60 });
  }
  event(g, "hit", { actor: p, amount, impactDirection: normal(sub(p.pos, hit.origin)), ...meta });
  if (p.hp <= 0) {
    g.activeGrenades = [];
    g.finished = true;
    g.won = false;
    event(g, "death", { actor: p, ...meta });
  }
  return true;
}
function knifeStepIn(g, e, dt) {
  const s = e.swing;
  if (!s) return;
  const age = Math.floor((g.time - s.start) * 60 + EPS);
  s.ageTicks = age;
  if (age > R.stepInFrom && age < s.def.windupTicks)
    moveBody(g, e, {
      x:
        s.dir.x *
        R.walkSpeed *
        s.def.stepIn *
        (e.moveSpeed !== undefined
          ? e.moveSpeed / R.walkSpeed
          : e.rig === "goblin"
            ? RULES.enemyAI.goblinSpeedFactor
            : 1) *
        dt,
      z:
        s.dir.z *
        R.walkSpeed *
        s.def.stepIn *
        (e.moveSpeed !== undefined
          ? e.moveSpeed / R.walkSpeed
          : e.rig === "goblin"
            ? RULES.enemyAI.goblinSpeedFactor
            : 1) *
        dt,
    });
}
function knifeEnemy(g, e, dt, services) {
  if (
    stepBossRanged(g, e, dt, {
      patrol: residentPatrol,
      move: enemyMove,
      receive: knifeReceive,
      source: services.bossRangedSource,
      trace: services.bossRangedTrace,
    })
  )
    return;
  if (
    stepSurgeonSaw(g, e, dt, {
      patrol: residentPatrol,
      move: enemyMove,
      receive: knifeReceive,
      contact: (a, v) => services.sawContact?.(g, a, v) === true,
    })
  )
    return;
  if (e.hp <= 0) {
    stopBossFlame(g, e);
    return;
  }
  if (
    stepBossFlame(g, e, dt, {
      patrol: residentPatrol,
      move: enemyMove,
      source: services?.bossFlameSource,
      receive: knifeReceive,
      emit: event,
      ...(rigCapability(e.rig, "fireBreath")
        ? {
            profile: SALAMANDER_BREATH,
            onStart: (g, e) => {
              e.response = { clip: "Bite", start: g.time, ticks: RULES.reactions.breathStartTicks };
            },
          }
        : {}),
    })
  )
    return;
  const brain = rigText(e.rig, "brain");
  if (brain === "drone") {
    droneEnemy(g, e, dt);
    return;
  }
  if (brain === "rat") {
    ratEnemy(g, e, dt);
    return;
  }
  if (brain === "dog") {
    dogEnemy(g, e, dt);
    return;
  }
  knifeEnergy(e, g.encounter?.regen ?? R.goblinRegen);
  knifeRegen(g, e, dt, !!e.swing || g.time < e.recoverUntil || g.time < e.staggerUntil);
  if (e.swing) {
    knifeStepIn(g, e, dt);
    return;
  }
  if (g.time < e.recoverUntil || g.time < e.staggerUntil) return;
  if (e.home && residentPatrol(g, e, dt)) return;
  const delta = sub(g.player.pos, e.pos),
    distance = mag(delta),
    dir = normal(delta, e.facing);
  const pattern = e.bossProfile?.attackPattern ?? ["slash", "stab", "slash", "heavy"],
    action = pattern[e.pattern % pattern.length],
    def = knifeMove(e, action);
  // Native long weapons keep their measured inner reach through ordinary movement.
  const minimum = (e.bossProfile?.minimumAttackDistance ?? 0) * e.combatScale;
  const spacing =
    minimum > 0 &&
    (distance < minimum || (!!e.attackSpacing && distance < minimum + RULES.enemyAI.attackSpacing * e.combatScale));
  if (minimum > 0) e.attackSpacing = spacing;
  if (spacing) {
    e.facing = turn(e.facing, dir, 360 * dt);
    const away = { x: -dir.x, z: -dir.z },
      next = g.world.move(e.pos, { x: away.x * e.moveSpeed * dt, z: away.z * e.moveSpeed * dt }, e.radius),
      delta = sub(next, e.pos);
    if (
      dot(delta, away) > EPS &&
      g.world.lineClear(e.pos, next) &&
      !g.world.travelAt?.(next) &&
      (!e.home || mag(sub(next, e.home)) <= e.bossProfile.homeLeash) &&
      ![g.player, ...g.enemies].some(
        (other) => other !== e && other.hp > 0 && mag(sub(next, other.pos)) < e.radius + other.radius,
      )
    )
      moveBody(g, e, delta);
    return;
  }
  if (distance > def.range * e.combatScale || !g.world.lineClear(e.pos, g.player.pos)) {
    enemyMove(g, e, dir, e.moveSpeed ?? R.walkSpeed * RULES.enemyAI.goblinSpeedFactor, dt);
    return;
  }
  e.facing = turn(e.facing, dir, 360 * dt);
  if (
    g.time + EPS >= e.ready &&
    (!g.encounter || g.time + EPS >= g.nextEnemyAttackAt) &&
    dot(e.facing, dir) > RULES.enemyAI.knifeAimDot &&
    knifeAffordable(e, def.stamina)
  ) {
    knifeSpend(g, e, def.stamina);
    e.swing = knifeSwing(g, e, action, def);
    e.ready = e.swing.end + (e.recoveryDelay ?? 0);
    e.pattern++;
    if (e.bossProfile?.hazard) {
      const position = bossHazardPosition(g, e);
      if (position) {
        const patch = createAreaHazard(
          { ownerId: e.id, areaId: g.world.areaId, position, time: g.time, config: e.bossProfile.hazard },
          g.areaHazards ?? [],
        );
        if (patch) (g.areaHazards ??= []).push(patch);
      }
    }
    if (g.encounter) g.nextEnemyAttackAt = g.time + g.encounter.aggression;
    event(g, "enemy-attack", {
      actor: e,
      dir: { ...e.facing },
      range: def.range * e.combatScale,
      arc: def.arc,
      moveId: def.moveId,
      clip: def.clip,
    });
  }
}
function droneEnemy(g, e, dt) {
  const hurt = g.time < e.recoverUntil || g.time < e.staggerUntil;
  const patrolling = !hurt && residentPatrol(g, e, dt);
  const next = droneIntent(e.droneState, {
    time: g.time,
    areaId: g.world.areaId,
    actor: e,
    player: g.player,
    lineClear: (a, b) => g.world.lineClear(a, b),
    hurt,
  });
  e.droneState = next.state;
  if (patrolling || hurt) return;
  if (next.action === "approach") enemyMove(g, e, next.direction, e.moveSpeed, dt);
  else if (next.direction) e.facing = { ...next.direction };
  if (next.bolt) {
    g.bolts.push({ id: ++serial, ...next.bolt });
    event(g, "enemy-attack", {
      actor: e,
      dir: { ...next.bolt.dir },
      range: DRONE_RULES.boltRange,
      moveId: "drone_bolt",
      weapon: "bolt",
    });
  }
}
function animalRoleMovement(g, e, dt) {
  if (!e.animalRole) return false;
  const p = e.animalRole.intent;
  if (p.retreatSeconds && e.completedAttack) {
    const away = normal(sub(e.pos, g.player.pos), e.facing),
      next = g.world.move(e.pos, { x: away.x * e.moveSpeed * dt, z: away.z * e.moveSpeed * dt }, e.radius),
      delta = sub(next, e.pos);
    const movement = recoveryMovement(p, {
      alive: e.hp > 0,
      alerted: e.alerted,
      swingActive: !!e.swing,
      hurt: g.time < e.recoverUntil || g.time < e.staggerUntil,
      distance: mag(sub(g.player.pos, e.pos)),
      time: g.time,
      completedAttack: e.completedAttack,
      retreatPathClear: mag(delta) > EPS && dot(delta, away) > 0 && g.world.lineClear(e.pos, next),
    });
    if (movement === "withdraw") {
      enemyMove(g, e, away, e.moveSpeed, dt, true);
      return true;
    }
    if (movement === "hold") return true;
  }
  return (
    p.burstSeconds > 0 &&
    approachRhythm(p, {
      alive: e.hp > 0,
      alerted: e.alerted,
      swingActive: !!e.swing,
      hurt: g.time < e.recoverUntil || g.time < e.staggerUntil,
      time: g.time,
      wokeAt: e.wokeAt,
    }) === "hold"
  );
}
function ratEnemy(g, e, dt) {
  if (e.swing) {
    knifeStepIn(g, e, dt);
    return;
  }
  if (g.time < e.recoverUntil || g.time < e.staggerUntil) return;
  if (e.home && residentPatrol(g, e, dt)) return;
  if (animalRoleMovement(g, e, dt)) return;
  const foot = e.contactGoalReach ? g.ratContact?.calf(g, e) : g.ratContact?.foot(g, e);
  if (!foot) return;
  const offset = sub(foot, e.pos),
    distance = mag(sub(g.player.pos, e.pos)),
    dir = normal(offset, e.facing);
  if (
    distance > (e.contactGoalReach ? e.radius + g.player.radius : RULES.enemyAI.animalBiteReach) + EPS ||
    mag(offset) > (e.contactGoalReach ?? RULES.enemyAI.animalContactReach) + EPS ||
    !g.world.lineClear(e.pos, g.player.pos)
  ) {
    enemyMove(g, e, dir, e.animalRole ? e.moveSpeed : RULES.enemyAI.ratMoveSpeed, dt);
    return;
  }
  e.facing = turn(e.facing, dir, 360 * dt);
  if (g.time + EPS >= e.ready && dot(e.facing, dir) > RULES.enemyAI.animalBiteAimDot) {
    const def = Number.isFinite(foot.y) && foot.y <= RULES.enemyAI.ratLowFootHeight ? RAT_BITE_LOW : RAT_BITE;
    e.swing = knifeSwing(g, e, "bite", def);
    e.swing.footGoalY = foot.y;
    if (e.animalRole) e.completedAttack = null;
    e.ready = e.swing.end + (e.animalRole ? e.recoveryDelay : 0);
    event(g, "enemy-attack", {
      actor: e,
      dir: { ...e.facing },
      range: e.contactGoalReach ? e.radius + g.player.radius : RULES.enemyAI.animalBiteReach,
      arc: 90,
      moveId: "rat_bite",
      clip: def.clip,
    });
  }
}
function dogEnemy(g, e, dt) {
  if (e.residentIntent?.companionDistance > 0) e.packMovement = "native";
  if (e.swing) {
    knifeStepIn(g, e, dt);
    return;
  }
  if (g.time < e.recoverUntil || g.time < e.staggerUntil) return;
  if (e.home && residentPatrol(g, e, dt)) return;
  if (animalRoleMovement(g, e, dt)) return;
  const offset = sub(g.player.pos, e.pos),
    distance = mag(offset),
    footGoal = rigCapability(e.rig, "calfContact") || e.contactGoalReach ? g.ratContact?.calf(g, e) : null;
  if (e.residentIntent?.companionDistance > 0) {
    const away = normal(sub(e.pos, g.player.pos), e.facing),
      next = g.world.move(e.pos, { x: away.x * e.moveSpeed * dt, z: away.z * e.moveSpeed * dt }, e.radius),
      delta = sub(next, e.pos);
    e.packMovement = recoveryMovement(e.residentIntent, {
      alive: e.hp > 0,
      alerted: e.alerted,
      distance,
      hasEligibleCompanion: e.packCompanions.hasEligibleCompanion,
      retreatPathClear: mag(delta) > EPS && dot(delta, away) > 0 && g.world.lineClear(e.pos, next),
    });
    if (e.packMovement === "withdraw") {
      enemyMove(g, e, away, e.moveSpeed, dt, true);
      return;
    }
    if (e.packMovement === "hold") return;
  }
  // Reuse the existing backward mover to recover native mouth standoff when the player crowds the body.
  const ownGoalDistance = rigCapability(e.rig, "nativeSkeleton") && footGoal ? mag(sub(footGoal, e.pos)) : null;
  if (ownGoalDistance !== null && ownGoalDistance < e.contactGoalReach - NEGLIGIBLE_DISTANCE) {
    enemyMove(
      g,
      e,
      normal(sub(e.pos, footGoal)),
      e.moveSpeed,
      Math.min(dt, (e.contactGoalReach - ownGoalDistance) / e.moveSpeed),
      true,
    );
    return;
  }
  // The long native salamander bites ahead of its body capsule; bridge clearance must not set attack standoff.
  const outsideReach =
    ownGoalDistance !== null ? ownGoalDistance > e.contactGoalReach + EPS : distance > e.radius + g.player.radius + EPS;
  if (outsideReach || !g.world.lineClear(e.pos, g.player.pos)) {
    const approachDt =
      ownGoalDistance !== null && outsideReach
        ? Math.min(dt, (ownGoalDistance - e.contactGoalReach) / e.moveSpeed)
        : dt;
    enemyMove(g, e, normal(footGoal ? sub(footGoal, e.pos) : offset), e.moveSpeed, approachDt);
    return;
  }
  const calf = rigCapability(e.rig, "calfContact") || e.contactGoalReach ? footGoal : g.ratContact?.calf(g, e);
  if (!calf || (e.contactGoalReach && mag(sub(calf, e.pos)) > e.contactGoalReach + EPS)) return;
  const direct = normal(sub(calf, e.pos), e.facing),
    dir = rigCapability(e.rig, "mouthAim") ? wolfBiteDirection(direct) : direct;
  e.facing = turn(e.facing, dir, 360 * dt);
  if (g.time + EPS >= e.ready && dot(e.facing, dir) > RULES.enemyAI.animalBiteAimDot) {
    e.facing = { ...dir };
    e.swing = knifeSwing(
      g,
      e,
      "bite",
      // A rig's biteMove names its attack row (wolf_attack, salamander_attack, elephant_attack in creatures.json moves).
      CREATURE_MOVES[`${rigText(e.rig, "biteMove")}_attack`] ??
        (rigText(e.rig, "biteMove") === "roach"
          ? e.contactGoalReach
            ? ROACH_BITE_SCALED
            : ROACH_BITE
          : e.contactGoalReach
            ? DOG_BITE_SCALED
            : DOG_BITE),
    );
    e.swing.calfGoal = { ...calf };
    if (e.animalRole) e.completedAttack = null;
    e.ready = e.swing.end + (e.animalRole ? e.recoveryDelay : 0);
    event(g, "enemy-attack", {
      actor: e,
      dir: { ...dir },
      range: e.swing.def.range,
      arc: 90,
      moveId: e.swing.moveId,
      clip: e.swing.clip,
    });
  }
}
function knifeContacts(g, before, ratBefore) {
  const entities = [g.player, ...g.enemies],
    after = new Map(entities.map((e) => [e.id, snapshot(e)])),
    contacts = [],
    completed = [];
  for (const a of entities) if (a.swing) a.swing.ageTicks = Math.floor((g.time - a.swing.start) * 60 + EPS);
  const ratAfter = ratBefore ? g.ratContact.capture(g) : null;
  for (const a of entities) {
    const s = a.swing;
    if (!s) continue;
    const age = Math.floor((g.time - s.start) * 60 + EPS);
    s.ageTicks = age;
    if (age >= s.def.windupTicks && age < s.def.windupTicks + s.def.activeTicks) {
      if (!s.activeEmitted) {
        s.activeEmitted = true;
        event(g, "strike", { actor: a, action: s.action, dir: s.dir, range: s.def.range, moveId: s.moveId });
      }
      const targets =
        a === g.player
          ? [...g.enemies].sort((a1, b1) => mag(sub(a1.pos, a.pos)) - mag(sub(b1.pos, a.pos)) || a1.id - b1.id)
          : [g.player];
      for (const d of targets) {
        if (s.def.ratLow && (!rigCapability(d.rig, "lowStrike") || d.id !== s.lowTargetId)) continue;
        if (
          d.hp <= 0 ||
          s.hitIds.has(d.id) ||
          (s.action === "stab" && s.hitIds.size) ||
          !g.world.lineClear(a.pos, d.pos)
        )
          continue;
        const hit =
          rigCapability(a.rig, "animal") || rigCapability(d.rig, "lowStrike")
            ? !!(ratBefore && g.ratContact.hit(a, d, s, ratBefore, ratAfter))
            : s.path
              ? bladeContact(
                  contactSnapshot(before.get(a.id) ?? after.get(a.id)),
                  contactSnapshot(after.get(a.id)),
                  before.get(d.id) ?? after.get(d.id),
                  after.get(d.id),
                  s.path,
                  age - 1,
                  age,
                )
              : age === s.def.windupTicks &&
                mag(sub(d.pos, a.pos)) <= s.def.range * a.combatScale + EPS &&
                inside(s.dir, sub(d.pos, a.pos), 90);
        if (hit) {
          s.hitIds.add(d.id);
          contacts.push({ a, d, def: s.def, s });
        }
      }
    }
    if (g.time + EPS >= s.end) {
      if (a.animalRole?.intent.retreatSeconds > 0) completed.push({ a, s });
      a.swing = null;
    }
  }
  // Decide contacts from a shared pre-resolution snapshot. Trades do not depend
  // on which attacker was enumerated first; a dead enemy cannot cancel its hit.
  contacts.sort((a, b) => a.a.id - b.a.id || a.d.id - b.d.id);
  for (const { a, d, def } of contacts) {
    if ((a === g.player && safehouseWeaponBlocked(g)) || safehouseBlocksSegment(g, a.pos, d.pos)) continue;
    if (d === g.player)
      knifeReceive(g, {
        amount: def.damage,
        origin: after.get(a.id).pos,
        attacker: a,
        block: true,
        parry: def.parryable,
        moveId: def.moveId,
        ...(a.bossProfile || rigCapability(a.rig, "nativeSkeleton") ? { def } : {}),
      });
    else {
      const damage = effectiveWeaponDamage(g, "knife", def.damage),
        amount = Math.min(d.hp, damage);
      d.hp = Math.max(0, d.hp - damage);
      if (d.hp <= 0) stageProgressionDeath(g, d, "knife", amount);
      d.flashUntil = g.time + RULES.hitFlashSeconds;
      if (d.home) alertResident(g, d);
      d.recoverUntil = d.staggerUntil = g.time + def.stagger;
      d.ready = d.recoverUntil + (d.recoveryDelay ?? 0);
      d.swing = null;
      if (d.animalRole) d.completedAttack = null;
      d.response = rigResponse(d.rig, d.hp, g.time, def.stagger);
      event(g, "hit", {
        actor: d,
        amount,
        impactDirection: normal(sub(after.get(d.id).pos, after.get(a.id).pos)),
        ...hitMetadata(a, d, def),
      });
      if (def.knockback) {
        const dir = normal(sub(d.pos, a.pos));
        moveBody(g, d, {
          x: (dir.x * R.walkSpeed * def.knockback) / 60,
          z: (dir.z * R.walkSpeed * def.knockback) / 60,
        });
      }
      if (d.hp <= 0)
        kill(g, d, { ...hitMetadata(a, d, def), impactDirection: sub(after.get(d.id).pos, after.get(a.id).pos) });
    }
  }
  for (const { a, s } of completed)
    if (!a.swing)
      a.completedAttack = nativeAttackCompletion(s, {
        reason: "normal",
        time: g.time,
        alive: a.hp > 0,
        hurt: g.time < a.recoverUntil || g.time < a.staggerUntil,
      });
  if (g.player.hp <= 0) {
    g.finished = true;
    g.won = false;
    stopFlame(g);
  }
}
