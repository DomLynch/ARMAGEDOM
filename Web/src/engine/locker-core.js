import { REAPER_ITEM_ID, REAPER_RECEIPT } from "./reaper.js";
import { createLockerModel, LOCKER_WEAPON_IDS, LOCKER_RESOURCE_RULES } from "./locker-state.js";
import { closedData } from "./progression-state.js";
import { safehouseProp } from "./safehouse.js";
export const LOCKER_SAVE_KEY = "armagedom:safehouse-run:v12";
const model = createLockerModel({ weaponIds: LOCKER_WEAPON_IDS, resourceRules: LOCKER_RESOURCE_RULES });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  fail = (code) => ({ ok: false, code, events: [] });
// The locker's weapons by name, in the saved order of LOCKER_WEAPON_IDS (locker-state.js).
const [PISTOL, RIFLE, FLAMETHROWER, CLEAVER, SHOTGUN, GRENADE, KNIFE, ROCKET, REAPER, COMMANDER_PISTOL] = LOCKER_WEAPON_IDS;
const bossFields = { [SHOTGUN]: "shotgun", [GRENADE]: "grenade", [KNIFE]: "surgicalKnife", [ROCKET]: "rocketLauncher" };
export function lockerInventory(g) {
  const weapons = Object.fromEntries(LOCKER_WEAPON_IDS.map((id) => [id, { owned: false, equipped: false }]));
  const set = (id, owned, equipped) => (weapons[id] = { owned: !!owned, equipped: !!equipped });
  set(PISTOL, g.pistol?.collected, g.pistol?.equipped);
  set(RIFLE, g.rifle?.status === "owned", g.rifle?.selected);
  set(FLAMETHROWER, g.flameFuel?.collected, g.flame?.equipped || g.bossEquipment?.emberProjector?.selected);
  set(CLEAVER, g.uniqueReward?.status === "owned", g.uniqueReward?.selectedMeleeVariant === CLEAVER);
  for (const [id, field] of Object.entries(bossFields))
    set(id, g.bossEquipment?.[field]?.status === "owned", g.bossEquipment?.[field]?.selected);
  set(
    REAPER,
    g.expedition?.status === "claimed" && g.expedition.rewardReceipt === REAPER_RECEIPT,
    g.expedition?.status === "claimed" && g.expedition.selectedPistolVariant === REAPER_ITEM_ID,
  );
  set(COMMANDER_PISTOL, g.bossEquipment?.commanderPistol?.status === "owned", g.bossEquipment?.commanderPistol?.selected);
  return {
    weapons,
    ammo: {
      "railgun-reserve": g.bossEquipment?.commanderPistol?.reserve ?? 0,
      "pistol-reserve": g.pistol?.reserve ?? 0,
      "rifle-reserve": g.rifle?.reserve ?? 0,
      "shotgun-reserve": g.bossEquipment?.shotgun?.reserve ?? 0,
      "rocket-reserve": g.bossEquipment?.rocketLauncher?.reserve ?? 0,
      "grenade-charges": g.bossEquipment?.grenade?.magazine ?? 0,
      "flame-fuel": g.flameFuel?.fuelUnits ?? 0,
    },
  };
}
// The physical locker family an item id belongs to (every pistol variant is the pistol, both flamethrowers the flamethrower).
function physicalOf(g, id) {
  let physical = id;
  const profiles = g.world?.bossEquipmentData ?? {},
    profile = Object.values(profiles).find((p) => p.itemId === id);
  if (
    !(g.world?.reaperData && id === REAPER_ITEM_ID) &&
    (profile?.family === "pistols" ||
      Object.hasOwn(g.world?.expeditionData?.variants ?? {}, id) ||
      id === "watchmans-pistol-v1")
  )
    physical = LOCKER_WEAPON_IDS[0];
  if (profile?.family === "flamethrowers") physical = LOCKER_WEAPON_IDS[2];
  return physical;
}
// In the safehouse Storage: the saved locker list only.
export const lockerHolds = (g, id) => (g.locker?.weapons ?? []).includes(physicalOf(g, id));
// Not usable right now: in the Storage, or left in the player's body bag (engine/corpse-run.js, session-only, never in the save).
// Every equip, fire and reload command and every weapon tile already asks this, so a withheld weapon cannot be used anywhere.
export const lockerStored = (g, id) =>
  lockerHolds(g, id) || (!!g.corpseBag?.gearId && physicalOf(g, g.corpseBag.gearId) === physicalOf(g, id));
function withAmmo(g, ammo) {
  const next = { ...g };
  if (g.pistol) next.pistol = { ...g.pistol, reserve: ammo["pistol-reserve"] };
  if (g.rifle) next.rifle = { ...g.rifle, reserve: ammo["rifle-reserve"] };
  if (g.flameFuel) next.flameFuel = { ...g.flameFuel, fuelUnits: ammo["flame-fuel"] };
  if (g.bossEquipment)
    next.bossEquipment = {
      ...g.bossEquipment,
      shotgun: { ...g.bossEquipment.shotgun, reserve: ammo["shotgun-reserve"] },
      rocketLauncher: { ...g.bossEquipment.rocketLauncher, reserve: ammo["rocket-reserve"] },
      grenade: { ...g.bossEquipment.grenade, magazine: ammo["grenade-charges"] },
      commanderPistol: { ...g.bossEquipment.commanderPistol, reserve: ammo["railgun-reserve"] },
    };
  return next;
}
const state = (g) => (g.locker === undefined ? model.freshState() : g.locker);
const valid = (g) => model.validInventory(state(g), lockerInventory(g));
export function createLockerComponent({
  baseCodec,
  getRun,
  applyBaseSaved,
  baseStorageAdapter = (storage) => storage,
  canDispatch,
  getAction = () => null,
}) {
  let legacy = false;
  const codec = {
    RUN_SAVE_KEY: LOCKER_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return baseCodec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      if (!valid(g)) throw TypeError("Invalid paired locker inventory");
      const old = JSON.parse(baseCodec.encodeRun(g));
      if (old.version !== 11) throw TypeError("Locker requires v11");
      return JSON.stringify({ ...old, version: 12, locker: model.copy(state(g)) });
    },
    restoreRun(g, raw, legacyRaw) {
      const oldRead = legacy;
      legacy = false;
      try {
        const saved = raw == null ? null : JSON.parse(raw);
        if (oldRead) {
          const restored = baseCodec.restoreRun(g, raw, legacyRaw);
          return restored && valid({ ...restored, locker: model.freshState() })
            ? { ...restored, locker: model.freshState() }
            : null;
        }
        if (
          saved?.version !== 12 || // tuning-ok: the save format version this codec reads (see LOCKER_SAVE_KEY)
          !closedData(saved, [
            "version",
            "pistol",
            "hp",
            "supplies",
            "vest",
            "droneDeaths",
            "animalCycle",
            "progression",
            "expedition",
            "uniqueReward",
            "flameFuel",
            "rifle",
            "bossEquipment",
            "locker",
          ]) ||
          !model.valid(saved.locker)
        )
          return null;
        const old = { ...saved, version: 11 };
        delete old.locker;
        const restored = baseCodec.restoreRun(g, JSON.stringify(old), null);
        const result = restored ? { ...restored, locker: model.copy(saved.locker) } : null;
        return result && valid(result) ? result : null;
      } catch {
        return null;
      }
    },
    captureRunState(g) {
      if (!valid(g)) throw TypeError("Invalid locker snapshot");
      return { base: baseCodec.captureRunState(g), locker: model.copy(state(g)) };
    },
    isRunStateUnchanged(g, snapshot) {
      return valid(g) && same(state(g), snapshot.locker) && baseCodec.isRunStateUnchanged(g, snapshot.base);
    },
  };
  function applyCommitted(g, proposal) {
    if (proposal.player?.weapon) g.player.weapon = proposal.player.weapon;
    g.locker = model.copy(proposal.locker);
    for (const key of ["pistol", "rifle", "flameFuel", "bossEquipment", "uniqueReward"])
      if (proposal[key]) g[key] = structuredClone(proposal[key]);
  }
  function wrapDomain(executeDomain) {
    return (command, context) => {
      const g = getRun();
      if (!g) return fail("not-eligible");
      if (command.type !== "restore" && !valid(g)) return fail("invalid-save");
      const action = command.type === "save" ? getAction(g) : null;
      let proposed = null,
        committed = null;
      if (action) {
        const p = g.player;
        if (
          !canDispatch(g) ||
          !safehouseProp(g, "locker") ||
          g.runSaveInvalid ||
          p.hp <= 0 ||
          g.finished ||
          p.swing ||
          g.time < (p.ready ?? 0) ||
          g.time < (p.hurtUntil ?? 0) ||
          g.time < (p.dodgeUntil ?? 0)
        )
          return fail("not-eligible");
        proposed = model.propose(state(g), lockerInventory(g), action);
        if (!proposed) return fail("not-eligible");
      }
      // A stored physical family cannot be selected through legacy or variant paths.
      if (
        (command.type === "equip" && command.equipped && lockerStored(g, command.itemId)) ||
        (command.type === "selectVariant" && lockerStored(g, command.variantId))
      )
        return fail("not-eligible");
      const result = executeDomain(command, {
        ...context,
        writeRun(candidate) {
          if (command.type !== "retry" && candidate.locker !== undefined && !same(candidate.locker, state(g)))
            return false;
          let next = { ...candidate, locker: model.copy(proposed?.locker ?? state(g)) };
          if (
            command.type === "retry" &&
            (state(g).weapons.includes(LOCKER_WEAPON_IDS[0]) || state(g).ammo["pistol-reserve"] > 0)
          ) {
            next.pistol = { ...g.pistol, reloadingUntil: 0, nextFireAt: 0 };
            if (next.pistol.equipped) next.player = { ...next.player, weapon: "pistol" };
          }
          if (proposed) next = withAmmo(next, proposed.ammo);
          if (!valid(next) || !context.writeRun(next)) return false;
          committed = next;
          return true;
        },
      });
      if (result.ok && committed) applyCommitted(getRun(), committed);
      return result.ok && action
        ? { ...result, changed: true, events: [...result.events, { type: "locker-transfer", action: { ...action } }] }
        : result;
    };
  }
  function storageAdapter(storage) {
    const base = baseStorageAdapter(storage);
    return !base
      ? base
      : {
          getItem(key) {
            if (key !== LOCKER_SAVE_KEY) return base.getItem(key);
            legacy = false;
            const raw = base.getItem(key);
            if (raw != null) return raw;
            legacy = true;
            return base.getItem(baseCodec.RUN_SAVE_KEY);
          },
          setItem: (key, raw) => base.setItem(key, raw),
        };
  }
  return Object.freeze({
    model,
    codec,
    wrapDomain,
    storageAdapter,
    applySavedRun(g, saved) {
      applyBaseSaved(g, saved);
      g.locker = model.copy(saved.locker);
      if (!valid(g)) throw TypeError("Invalid restored locker");
    },
  });
}
