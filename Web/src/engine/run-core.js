import { createMarkedComponent } from "./marked-core.js";
import { createHubComponent } from "./hub-core.js";
import { createRailgunComponent } from "./railgun-core.js";
import { createReaperComponent } from "./reaper-core.js";
import { createOpeningStoryComponent } from "./opening-story-core.js";
import { createLockerComponent, lockerStored } from "./locker-core.js";
import { safehouseWeaponBlocked } from "./safehouse.js";
import { stepPistol } from "../pistol.js";
import { selectedPistolProfile } from "./expedition-core.js";
import { createBossEquipmentComponent } from "./boss-equipment-core.js";
import { bossEquipmentClock, selectedFlameProfile } from "./boss-equipment-data.js";
import { createRifleComponent } from "./rifle-core.js";
import { createRifleModel } from "./rifle-state.js";
import { rifleActionState } from "./rifle-runtime.js";
import { closedData } from "./progression-state.js";
import { deathWeaponDescriptor } from "./weapon-credit-policy.js";
import { FLAME_SAVE_KEY, createFlameComponent } from "./flame-core.js";
import { createFlameFuelModel } from "./flame-fuel-state.js";
import { syncMeleeEquipment } from "../melee-equipment.js";
import { createUniqueRewardModel } from "./unique-reward-state.js";
import { UNIQUE_REWARD_SAVE_KEY, createUniqueRewardComponent } from "./unique-reward-core.js";
import { uniqueRewardSourceDead, uniqueRewardDropPosition } from "./unique-reward-runtime.js";
import { EXPEDITION_SAVE_KEY, AREA_BOSS_SAVE_KEY, createExpeditionComponent } from "./expedition-core.js";
import { captureRunState, isRunStateUnchanged } from "./run-save-state.js";
import { PROGRESSION_SAVE_KEY, createProgressionComponent } from "./progression-core.js";
import { progressionOptions } from "./progression-runtime.js";
import { createCore } from "../core/index.js";
import { createRunStorage } from "../core/io/local-run-storage.js";
import { createPickupOperation } from "../core/pickup-operation.js";
import { createRunOperation } from "../core/run-operation.js";
import { createPistolOperation, PISTOL_ITEM_ID } from "../core/pistol-operation.js";
import * as codec from "./run-state.js";
import { collectSupply, hasExtendedLoot, collectGearSupply, GEAR_ITEMS } from "../supplies.js";
import { collectVest, VEST_RULES, grantVest } from "../vest.js";
import { collectPistol, equipPistol, grantPistol } from "../pistol.js";
import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";

const NOTICES = GAME_DATA.runNotices; // data/runNotices.json: how long each run message stays up

// One session writer; render/input code supplies live-run access and fresh construction.
export function createRunPersistence({ getRun, setRun, createFreshRun, storage }) {
  const extendedKey = "armagedom:area-run:v3";
  const selectedCodec = {
    ...codec,
    captureRunState,
    isRunStateUnchanged,
    get RUN_SAVE_KEY() {
      return hasExtendedLoot(getRun()?.lootRules) ? extendedKey : codec.RUN_SAVE_KEY;
    },
  };
  // Evaluate context at IO time: browser persistence is created before the game loads.
  const selectedStorage = !storage
    ? storage
    : {
        getItem(name) {
          const raw = storage.getItem(name);
          return name === extendedKey && raw == null ? storage.getItem(codec.RUN_SAVE_KEY) : raw;
        },
        setItem(name, raw) {
          storage.setItem(name, raw);
        },
      };
  let markedComponent = null,
    markedDomain = null,
    markedScope = null;
  let storyComponent = null,
    storyDomain = null,
    reaperComponent = null,
    reaperDomain = null,
    railgunComponent = null,
    railgunDomain = null,
    hubComponent = null,
    hubDomain = null;
  let lockerComponent = null,
    lockerDomain = null,
    lockerScope = null;
  let bossEquipmentComponent = null,
    bossEquipmentDomain = null,
    bossEquipmentScope = null;
  let rifleComponent = null,
    rifleDomain = null,
    rifleScope = null;
  let flameComponent = null,
    flameDomain = null,
    flameScope = null,
    lastFuelOwner = null,
    lastFuelTick = -1;
  let component = null,
    wrappedDomain = null,
    expeditionComponent = null,
    expeditionDomain = null,
    expeditionScope = null,
    uniqueComponent = null,
    uniqueDomain = null,
    uniqueScope = null;
  function progression() {
    const g = getRun();
    if (!g?.progressionModel) return null;
    if (!component) {
      component = createProgressionComponent({ baseCodec: selectedCodec, getRun, ...progressionOptions(g) });
      wrappedDomain = component.wrapDomain(executeDomain);
    }
    for (const packet of g.pendingProgressionDeaths ?? []) component.recordDeath(g, packet);
    g.pendingProgressionDeaths = [];
    return component;
  }
  function expedition() {
    const g = getRun();
    if (!g?.world.expeditionData) return null;
    const p = progression();
    if (!p) throw TypeError("Expedition requires registered progression");
    if (!expeditionComponent) {
      const options = progressionOptions(g),
        bossKeys = new Set(
          Object.values(g.world.residentPlacements ?? {})
            .flat()
            .filter((row) => row.bossRef)
            .map((row) => row.key),
        );
      expeditionComponent = createExpeditionComponent({
        baseCodec: p.codec,
        getRun,
        data: g.world.expeditionData,
        registry: g.world.registry,
        saveVersion: g.world.bossData ? 6 : 5, // tuning-ok: the run save format versions with and without boss data
        previousPlacementIds: g.world.bossData
          ? Object.values(options.placements)
              .flat()
              .map((row) => row.key)
              .filter((key) => !bossKeys.has(key))
          : null,
        applyBaseSaved: (run, saved) => p.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => p.storageAdapter(storage),
        canDispatch: (run) => expeditionScope?.run === run && expeditionScope.allowed,
      });
      expeditionDomain = expeditionComponent.wrapDomain(wrappedDomain);
    }
    return expeditionComponent;
  }
  function uniqueReward() {
    const g = getRun(),
      data = g?.world.uniqueRewardData;
    if (!data) return null;
    const base = expedition();
    if (!base || !g.world.bossData) throw TypeError("Unique equipment requires registered v6 run");
    if (!uniqueComponent) {
      const model = createUniqueRewardModel(data);
      uniqueComponent = createUniqueRewardComponent({
        baseCodec: base.codec,
        getRun,
        model,
        ...data,
        applyBaseSaved: (run, saved) => base.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => base.storageAdapter(storage),
        canDispatch: (run) => uniqueScope?.run === run && uniqueScope.allowed,
        validatedDropPosition: uniqueRewardDropPosition,
        sourceDead: (saved) => uniqueRewardSourceDead(saved, data),
      });
      uniqueDomain = uniqueComponent.wrapDomain(expeditionDomain);
    }
    return uniqueComponent;
  }
  function flame() {
    const g = getRun(),
      data = g?.world.flameData;
    if (!data) return null;
    const base = uniqueReward();
    if (!base) throw TypeError("Flame requires registered v7 run");
    if (!flameComponent) {
      flameComponent = createFlameComponent({
        baseCodec: base.codec,
        getRun,
        model: createFlameFuelModel(data),
        unitsPerSecond: data.unitsPerSecond,
        getUnitsPerSecond: (run) => selectedFlameProfile(run).unitsPerSecond,
        getSaveCoalesceSeconds: (run) => selectedFlameProfile(run).saveCoalesceSeconds ?? 0,
        applyBaseSaved: (run, saved) => base.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => base.storageAdapter(storage),
        canPickup: (run) => {
          const p = run.player;
          return (
            data.groundPickupEnabled === true &&
            flameScope?.run === run &&
            flameScope.allowed &&
            p.hp > 0 &&
            !run.finished &&
            !run.runSaveInvalid &&
            !p.swing &&
            run.time >= p.hurtUntil &&
            run.time >= p.dodgeUntil &&
            run.world.areaId === data.areaId &&
            Math.hypot(p.pos.x - data.position.x, p.pos.z - data.position.z) <= data.pickupRadius + 1e-8 &&
            run.world.lineClear(p.pos, data.position)
          );
        },
        getConsumption: (run) => (flameScope?.run === run && flameScope.allowed ? flameScope.request : null),
      });
      flameDomain = flameComponent.wrapDomain(uniqueDomain);
    }
    return flameComponent;
  }
  function rifle() {
    const g = getRun(),
      data = g?.world.rifleData;
    if (!data) return null;
    const base = flame();
    if (!base) throw TypeError("Rifle requires the existing v8 run");
    if (!rifleComponent) {
      rifleComponent = createRifleComponent({
        baseCodec: base.codec,
        getRun,
        model: createRifleModel(data),
        profile: data,
        applyBaseSaved: (run, saved) => base.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => base.storageAdapter(storage),
        canDispatch: (run) => rifleScope?.run === run && rifleScope.allowed,
        getAction: (run) => (rifleScope?.run === run ? rifleScope.action : null),
        validatedDropPosition: (run, corpse) => uniqueRewardDropPosition(run, corpse, data.source),
        sourceDead: (saved) => uniqueRewardSourceDead(saved, data.source),
      });
      rifleDomain = rifleComponent.wrapDomain(flameDomain);
    }
    return rifleComponent;
  }
  function bossEquipment() {
    const g = getRun(),
      profiles = g?.world.bossEquipmentData;
    if (!profiles) return null;
    const base = rifle();
    if (!base) throw TypeError("Boss equipment requires existing v9 run");
    if (!bossEquipmentComponent) {
      bossEquipmentComponent = createBossEquipmentComponent({
        baseCodec: base.codec,
        getRun,
        profiles,
        applyBaseSaved: (run, saved) => base.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => base.storageAdapter(storage),
        canDispatch: (run) => bossEquipmentScope?.run === run && bossEquipmentScope.allowed,
        getAction: (run) => (bossEquipmentScope?.run === run ? bossEquipmentScope.action : null),
        validatedDropPosition: uniqueRewardDropPosition,
        sourceDead: uniqueRewardSourceDead,
      });
      bossEquipmentDomain = bossEquipmentComponent.wrapDomain(rifleDomain);
    }
    return bossEquipmentComponent;
  }
  function locker() {
    const g = getRun();
    if (!g?.world.safehouseData) return null;
    const base = bossEquipment();
    if (!base) throw TypeError("Locker requires current v11 run");
    if (!lockerComponent) {
      lockerComponent = createLockerComponent({
        baseCodec: base.codec,
        getRun,
        applyBaseSaved: (run, saved) => base.applySavedRun(run, saved),
        baseStorageAdapter: (storage) => base.storageAdapter(storage),
        canDispatch: (run) => lockerScope?.run === run && lockerScope.allowed,
        getAction: (run) => (lockerScope?.run === run ? lockerScope.action : null),
      });
      lockerDomain = lockerComponent.wrapDomain(bossEquipmentDomain);
    }
    return lockerComponent;
  }
  function story() {
    const base = locker();
    if (!base) return null;
    if (!storyComponent) {
      storyComponent = createOpeningStoryComponent({ base, getRun });
      storyDomain = storyComponent.wrapDomain(lockerDomain);
    }
    return storyComponent;
  }
  function reaper() {
    if (!getRun()?.world.reaperData) return null;
    const base = story();
    if (!base) return null;
    if (!reaperComponent) {
      reaperComponent = createReaperComponent({ base, getRun });
      reaperDomain = reaperComponent.wrapDomain(storyDomain);
    }
    return reaperComponent;
  }
  function railgun() {
    if (getRun()?.world.bossEquipmentData?.commanderPistol?.weaponKey !== "railgun") return null;
    const base = reaper() ?? story() ?? locker() ?? bossEquipment();
    if (!base) return null;
    if (!railgunComponent) {
      railgunComponent = createRailgunComponent({ base, getRun });
      railgunDomain = railgunComponent.wrapDomain(reaperDomain ?? storyDomain ?? lockerDomain ?? bossEquipmentDomain);
    }
    return railgunComponent;
  }
  function hub() {
    if (!getRun()?.world.registry?.has?.("central-hub")) return null;
    const base = railgun();
    if (!base) return null;
    if (!hubComponent) {
      hubComponent = createHubComponent({ base });
      hubDomain = hubComponent.wrapDomain(railgunDomain);
    }
    return hubComponent;
  }
  function marked() {
    if (!getRun()?.world.markedData) return null;
    const base = hub();
    if (!base) return null;
    if (!markedComponent) {
      markedComponent = createMarkedComponent({
        base,
        getRun,
        getAction: () => markedScope?.action ?? null,
        canDispatch: (g) => markedScope?.run === g && markedScope.allowed,
      });
      markedDomain = markedComponent.wrapDomain(hubDomain);
    }
    return markedComponent;
  }
  const stateComponent = () =>
    marked() ??
    hub() ??
    railgun() ??
    reaper() ??
    story() ??
    locker() ??
    bossEquipment() ??
    rifle() ??
    flame() ??
    uniqueReward() ??
    expedition() ??
    progression();
  const activeCodec = {
    ...selectedCodec,
    captureRunState(g) {
      return (stateComponent()?.codec ?? selectedCodec).captureRunState(g);
    },
    isRunStateUnchanged(g, snapshot) {
      return (stateComponent()?.codec ?? selectedCodec).isRunStateUnchanged(g, snapshot);
    },
    get RUN_SAVE_KEY() {
      return stateComponent()?.codec.RUN_SAVE_KEY ?? selectedCodec.RUN_SAVE_KEY;
    },
    encodeRun(g) {
      return (stateComponent()?.codec ?? selectedCodec).encodeRun(g);
    },
    restoreRun(...args) {
      try {
        const raw = args[1] == null ? null : JSON.parse(args[1]);
        if (
          raw?.version <= 7 && // tuning-ok: the last save version written before the death-weapon credit policy
          (raw.progression?.awards ?? []).some((row) => deathWeaponDescriptor(row.weaponId)?.creditPolicy === "none")
        )
          return null;
      } catch {
        return null;
      }
      return (stateComponent()?.codec ?? selectedCodec).restoreRun(...args);
    },
  };
  const activeStorage = !selectedStorage
    ? selectedStorage
    : {
        getItem(key) {
          return (stateComponent()?.storageAdapter(selectedStorage) ?? selectedStorage).getItem(key);
        },
        setItem: (key, raw) => selectedStorage.setItem(key, raw),
      };
  let supplyScope = null;
  const supplyPickup = createPickupOperation({
    getRun,
    collectSupply,
    collectVest,
    vestRules: VEST_RULES,
    vestBagPosition: codec.VEST_BAG_POSITION,
    collectGearSupply,
    gearItems: GEAR_ITEMS,
    grantPistol,
    grantVest,
    canCollectGear: (g) => supplyScope?.run === g && supplyScope.allowed,
  });
  let pistolScope = null;
  const pistolOperation = createPistolOperation({
    getRun,
    collectPistol,
    equipPistol,
    grantPistol,
    canAct: (g) => pistolScope?.run === g && pistolScope.allowed,
  });
  const claimPickup = (command, context) =>
    command.pickupId === PISTOL_ITEM_ID ? pistolOperation(command, context) : supplyPickup(command, context);
  const executeDomain = createRunOperation({
    getRun,
    setRun,
    createFreshRun({ reset = false } = {}) {
      const candidate = createFreshRun({ reset }),
        e = expedition();
      if (candidate?.world.safehouseData) candidate.locker = locker().model.freshState();
      if (!reset && e && candidate && candidate !== getRun())
        candidate.expedition = e.model.copy(getRun().expedition ?? e.model.freshState());
      return candidate;
    },
    applySavedRun(g, saved) {
      const p = stateComponent();
      if (p) p.applySavedRun(g, saved);
      else codec.applySavedRun(g, saved);
      if (g.world.uniqueRewardData) syncMeleeEquipment(g);
    },
    claimPickup,
    equip: pistolOperation,
  });
  const io = createRunStorage({ storage: activeStorage, codec: activeCodec });
  const core = createCore({
    executeDomain(command, context) {
      if (command.type === "reset") return executeDomain(command, context);
      return marked()
        ? markedDomain(command, context)
        : hub()
          ? hubDomain(command, context)
          : railgun()
            ? railgunDomain(command, context)
            : reaper()
              ? reaperDomain(command, context)
              : story()
                ? storyDomain(command, context)
                : locker()
                  ? lockerDomain(command, context)
                  : bossEquipment()
                    ? bossEquipmentDomain(command, context)
                    : rifle()
                      ? rifleDomain(command, context)
                      : flame()
                        ? flameDomain(command, context)
                        : uniqueReward()
                          ? uniqueDomain(command, context)
                          : expedition()
                            ? expeditionDomain(command, context)
                            : progression()
                              ? wrappedDomain(command, context)
                              : executeDomain(command, context);
    },
    codec: activeCodec,
    readRun: () => io.restore(getRun()),
    writeRun: (candidate, options) => io.write(candidate, options),
  });
  function dispatchMarked(g, action, allowed = false) {
    if (g !== getRun() || markedScope || !marked()) return { ok: false, code: "not-eligible", events: [] };
    markedScope = { run: g, action, allowed: allowed === true };
    try {
      const result = core.dispatch({ type: "save" });
      if (!result.ok && result.code === "storage-unavailable") unavailable(g);
      return result;
    } finally {
      markedScope = null;
    }
  }
  function dispatchLocker(g, action, allowed = false) {
    if (g !== getRun() || lockerScope || !locker()) return { ok: false, code: "not-eligible", events: [] };
    lockerScope = { run: g, action, allowed: allowed === true };
    try {
      const result = core.dispatch({ type: "save" });
      if (!result.ok && result.code === "storage-unavailable") unavailable(g);
      return result;
    } finally {
      lockerScope = null;
    }
  }
  function unavailable(g) {
    g.message = webText("runCore.savingUnavailable.supplies");
    g.messageUntil = g.time + NOTICES.storageUnavailableSeconds;
  }
  function dispatchPistol(g, command, canAct) {
    if (
      g !== getRun() ||
      pistolScope ||
      lockerStored(g, "westminster-start-pistol-v1") ||
      (safehouseWeaponBlocked(g) && ["fire", "reload"].includes(command?.type))
    )
      return { ok: false, code: "not-eligible", events: [] };
    pistolScope = { run: g, allowed: canAct === true };
    try {
      const result = core.dispatch(command);
      if (!result.ok && result.code === "storage-unavailable") unavailable(g);
      return result;
    } finally {
      pistolScope = null;
    }
  }
  function dispatchExpedition(g, command, allowed) {
    if (g !== getRun() || expeditionScope) return { ok: false, code: "not-eligible", events: [] };
    expeditionScope = { run: g, allowed: allowed === true };
    try {
      const result = core.dispatch(command);
      if (!result.ok && result.code === "storage-unavailable") {
        g.message = webText("runCore.savingUnavailable.contract");
        g.messageUntil = g.time + NOTICES.storageUnavailableSeconds;
      }
      return result;
    } finally {
      expeditionScope = null;
    }
  }
  function dispatchUniqueReward(g, command, allowed) {
    if (g !== getRun() || uniqueScope || !uniqueReward()) return { ok: false, code: "not-eligible", events: [] };
    uniqueScope = { run: g, allowed: allowed === true };
    try {
      const result = core.dispatch(command);
      if (result.ok && g.world.uniqueRewardData) syncMeleeEquipment(g);
      if (!result.ok && result.code === "storage-unavailable") {
        g.message = webText("runCore.savingUnavailable.equipment");
        g.messageUntil = g.time + NOTICES.storageUnavailableSeconds;
      }
      return result;
    } finally {
      uniqueScope = null;
    }
  }
  function dispatchFlame(g, command, request = null, allowed = false) {
    if (g !== getRun() || flameScope || !flame()) return { ok: false, code: "not-eligible", events: [] };
    if (lastFuelOwner !== g) {
      lastFuelOwner = g;
      lastFuelTick = -1;
    }
    if (request && (safehouseWeaponBlocked(g) || lockerStored(g, "flamethrower-area8-v1")))
      return { ok: false, code: "not-eligible", events: [] };
    if (
      request &&
      (request.active !== true ||
        !Number.isFinite(request.seconds) ||
        Math.abs(request.seconds - 1 / 60) > 1e-8 ||
        lastFuelTick === g.tick ||
        !Number.isInteger(g.tick) ||
        !g.flame?.equipped ||
        g.player.hp <= 0 ||
        g.finished ||
        g.runSaveInvalid ||
        g.player.swing ||
        g.time < g.player.ready ||
        g.time < g.player.hurtUntil ||
        g.time < g.player.dodgeUntil)
    )
      return { ok: false, code: "not-eligible", events: [] };
    flameScope = { run: g, request, allowed: allowed === true };
    try {
      const result = core.dispatch(command);
      if (result.ok && result.events.some((e) => e.type === "flame-fuel-spent")) lastFuelTick = g.tick;
      if (!result.ok && result.code === "storage-unavailable") unavailable(g);
      return result;
    } finally {
      flameScope = null;
    }
  }
  function dispatchRifle(g, command, allowed = false) {
    if (
      g !== getRun() ||
      rifleScope ||
      !rifle() ||
      (["fire", "reload"].includes(command?.type) &&
        (safehouseWeaponBlocked(g) || lockerStored(g, "bridge-warden-rifle-v1")))
    )
      return { ok: false, code: "not-eligible", events: [] };
    const descriptor = Object.getOwnPropertyDescriptor(command ?? {}, "type"),
      type = descriptor && "value" in descriptor ? descriptor.value : null;
    const action = ["fire", "reload"].includes(type) ? { type } : null,
      clock = rifleActionState(g);
    if (
      action &&
      (!closedData(command, ["type"]) ||
        !g.rifle?.selected ||
        g.flame?.equipped ||
        (type === "fire" && (clock.reloadingUntil > 0 || g.time < clock.nextFireAt)) ||
        (type === "reload" && (!(clock.reloadingUntil > 0) || g.time + 1e-8 < clock.reloadingUntil)))
    )
      return { ok: false, code: "not-eligible", events: [] };
    rifleScope = { run: g, allowed: allowed === true, action };
    try {
      const result = core.dispatch(action ? { type: "save" } : command);
      if (result.ok) {
        if (result.events.some((e) => e.type === "rifle-ammo-spent")) {
          clock.nextFireAt = g.time + g.world.rifleData.rules.cadence;
          clock.firedAt = g.time;
          clock.paidTick = g.tick;
          clock.paidRounds = 1;
        }
        if (result.events.some((e) => e.type === "rifle-reloaded" || e.type === "rifle-selected"))
          clock.reloadingUntil = 0;
      } else if (result.code === "storage-unavailable") {
        g.message = webText("runCore.savingUnavailable.rifle");
        g.messageUntil = g.time + NOTICES.storageUnavailableSeconds;
      }
      return result;
    } finally {
      rifleScope = null;
    }
  }
  function dispatchBossEquipment(g, command, allowed = false) {
    if (
      g !== getRun() ||
      bossEquipmentScope ||
      !bossEquipment() ||
      (["fire", "reload"].includes(command?.type) &&
        (safehouseWeaponBlocked(g) || lockerStored(g, g.world.bossEquipmentData?.[command.field]?.itemId)))
    )
      return { ok: false, code: "not-eligible", events: [] };
    const action = ["fire", "reload"].includes(command?.type) ? { field: command.field, type: command.type } : null;
    let clock = null;
    if (action) {
      const data = g.world.bossEquipmentData[action.field];
      if (!data || !closedData(command, ["type", "field"]) || !g.bossEquipment?.[action.field]?.selected)
        return { ok: false, code: "not-eligible", events: [] };
      clock = bossEquipmentClock(g, action.field);
      if (
        (action.type === "fire" && (clock.reloadingUntil > 0 || g.time < clock.nextFireAt)) ||
        (action.type === "reload" &&
          (data.rules.reload <= 0 || !(clock.reloadingUntil > 0) || g.time + 1e-8 < clock.reloadingUntil))
      )
        return { ok: false, code: "not-eligible", events: [] };
    }
    bossEquipmentScope = { run: g, allowed: allowed === true, action };
    try {
      const result = core.dispatch(action ? { type: "save" } : command);
      if (result.ok && action) {
        if (action.type === "fire") {
          clock.nextFireAt = g.time + g.world.bossEquipmentData[action.field].rules.cadence;
          clock.firedAt = g.time;
          clock.paidTick = g.tick;
          clock.paidRounds = 1;
        } else clock.reloadingUntil = 0;
      }
      if (result.ok && g.world.uniqueRewardData) syncMeleeEquipment(g);
      if (!result.ok && result.code === "storage-unavailable") unavailable(g);
      return result;
    } finally {
      bossEquipmentScope = null;
    }
  }
  function dispatchMarshalPistol(g, request) {
    const deny = () => ({ ok: false, state: g.pistol, events: [] });
    if (
      g !== getRun() ||
      bossEquipmentScope ||
      !bossEquipment() ||
      safehouseWeaponBlocked(g) ||
      lockerStored(g, "westminster-start-pistol-v1") ||
      !g.bossEquipment?.commanderPistol?.selected ||
      !closedData(request, ["aim", "fire", "reload", "cancel", "canAct"]) ||
      !closedData(request.aim, ["x", "z"]) ||
      ![request.aim.x, request.aim.z].every(Number.isFinite) ||
      ["fire", "reload", "cancel", "canAct"].some((key) => typeof request[key] !== "boolean")
    )
      return deny();
    const p = g.player,
      allowed =
        request.canAct &&
        p.hp > 0 &&
        !g.finished &&
        !g.runSaveInvalid &&
        !p.swing &&
        g.time >= p.ready &&
        g.time >= p.hurtUntil &&
        g.time >= p.dodgeUntil;
    const next = stepPistol(g.pistol, {
      profile: selectedPistolProfile(g),
      time: g.time,
      areaId: g.world.areaId,
      position: p.pos,
      facing: p.facing,
      aim: request.aim,
      fire: request.fire,
      reload: request.reload,
      cancel: request.cancel,
      canAct: allowed,
      targets: g.enemies,
      lineClear: (a, b) => g.world.lineClear(a, b),
    });
    const changed = ["magazine", "reserve", "collected", "equipped"].some((key) => next.state[key] !== g.pistol[key]);
    if (!changed) {
      g.pistol = next.state;
      return { ok: true, ...next };
    }
    bossEquipmentScope = {
      run: g,
      allowed,
      action: { type: "sharedPistol", field: "commanderPistol", pistol: next.state },
    };
    try {
      const result = core.dispatch({ type: "save" });
      if (!result.ok) {
        if (result.code === "storage-unavailable") unavailable(g);
        return deny();
      }
      return { ok: true, state: g.pistol, events: next.events };
    } finally {
      bossEquipmentScope = null;
    }
  }
  function persistRun(g) {
    if (g !== getRun() || g.runSaveInvalid) return false;
    const result = core.dispatch({ type: "save" });
    if (!result.ok) unavailable(g);
    else
      for (const event of result.events) {
        g.events.push({ ...event, actor: g.player });
        if (
          event.type === "boss-equipment-drop" &&
          event.itemId === g.world.bossEquipmentData?.emberProjector?.itemId &&
          g.bossEquipment?.emberProjector?.status === "pending"
        ) {
          g.message = webText("runCore.bossDrop", { name: g.world.bossEquipmentData.emberProjector.name });
          g.messageUntil = g.time + NOTICES.bossDropSeconds;
        }
      }
    return result.ok;
  }
  function restoreSavedRun(g) {
    const result = core.dispatch({ type: "restore" });
    if (!result.ok) {
      g.runSaveInvalid = true;
      if (result.code === "invalid-save") {
        g.supplies = null;
        g.player.hp = 0;
        g.finished = true;
        g.message = webText("runCore.savedRunUnreadable");
        g.messageUntil = NOTICES.resetPromptSeconds;
      } else {
        g.message = webText("runCore.savingUnavailable.supplies");
        g.messageUntil = NOTICES.storageUnavailableSeconds;
      }
    }
    persistRun(g);
  }
  function resetRun() {
    return core.dispatch({ type: "reset" });
  }
  function retry() {
    const result = core.dispatch({ type: "retry" });
    if (result.ok && getRun().world.uniqueRewardData) syncMeleeEquipment(getRun());
    return result.ok;
  }
  function collectNearbySupplies(g, intent = {}) {
    const p = g.player;
    supplyScope = {
      run: g,
      allowed:
        p.hp > 0 &&
        !g.finished &&
        !intent.cancel &&
        !intent.dodge &&
        !p.swing &&
        g.time >= p.hurtUntil &&
        g.time >= p.dodgeUntil,
    };
    try {
      if (!g.supplies || g.runSaveInvalid || g.finished) return;
      for (const drop of g.supplies.pending.slice()) {
        const result = core.dispatch({ type: "claimPickup", pickupId: drop.id });
        if (result.ok) {
          for (const event of result.events) {
            g.events.push(event.type === "vest-pickup" ? { ...event, actor: g.player } : { ...event });
            if (event.type !== "supply-pickup") continue;
            g.message =
              event.kind === "westminster-start-pistol-v1"
                ? webText("runCore.pickup.pistol")
                : event.kind === "westminster-worn-vest-v1"
                  ? webText("runCore.pickup.vest")
                  : event.kind === "rounds"
                    ? webText("runCore.pickup.rounds", { amount: event.amount })
                    : webText("runCore.pickup.dressing", { amount: Math.ceil(event.amount) });
            g.messageUntil = g.time + NOTICES.supplyPickupSeconds;
          }
        } else if (result.code === "storage-unavailable") {
          unavailable(g);
        } else if (result.code === "not-eligible") {
          const { reason } = collectSupply(g.supplies, {
            dropId: drop.id,
            areaId: g.world.areaId,
            position: g.player.pos,
            rules: g.lootRules,
            resources: {
              hp: g.player.hp,
              maxHP: g.player.maxHP,
              pistolOwned: g.pistol.collected,
              reserve: g.pistol.reserve,
            },
            lineClear: (a, b) => g.world.lineClear(a, b),
          });
          if (["pistol-required", "reserve-full", "health-full"].includes(reason)) {
            const notice = drop.id + reason;
            if (g.supplyNotice === notice && g.time < g.supplyNoticeUntil) continue;
            g.supplyNotice = notice;
            g.supplyNoticeUntil = g.time + NOTICES.supplyNoticeRepeatSeconds;
            g.message = webText(`runCore.refusal.${reason}`);
            g.messageUntil = g.time + NOTICES.supplyRefusalSeconds;
          }
        }
      }
    } finally {
      supplyScope = null;
    }
  }
  function collectNearbyVest(g) {
    if (!g.vest || g.runSaveInvalid || g.finished) return;
    const result = core.dispatch({ type: "claimPickup", pickupId: VEST_RULES.itemId });
    if (!result.ok) {
      if (result.code === "storage-unavailable") unavailable(g);
      return;
    }
    for (const event of result.events) g.events.push({ ...event, actor: g.player });
    g.message = webText("runCore.vestEquipped");
    g.messageUntil = g.time + NOTICES.vestEquippedSeconds;
  }
  return {
    dispatchMarked,
    dispatchLocker,
    persistRun,
    restoreSavedRun,
    retry,
    resetRun,
    collectNearbySupplies,
    collectNearbyVest,
    dispatchPistol,
    dispatchRifle,
    dispatchBossEquipment,
    dispatchMarshalPistol,
    dispatchExpedition,
    dispatchUniqueReward,
    dispatchFlame,
  };
}
