import { closedData } from "./progression-state.js";
import { createUnlockRewardModel } from "./unlock-reward-state.js";
import { LOCKER_RESOURCE_RULES, LOCKER_WEAPON_IDS } from "./locker-state.js";
export const RAILGUN_ITEM_ID = "borough-marshals-pistol-v1";
export const RAILGUN_SAVE_KEY = "armagedom:railgun-run:v16";
const versions = {
  "armagedom:boss-equipment-run:v11": 11,
  "armagedom:safehouse-run:v12": 12,
  "armagedom:opening-story-run:v14": 14,
  "armagedom:reaper-run:v15": 15,
};
const envelope = [
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
];
// Passive envelope boundary: the existing boss AmmoRewardModel remains the sole resource/receipt owner.
export function createRailgunComponent({ base, getRun }) {
  let legacy = false;
  const version = versions[base.codec.RUN_SAVE_KEY];
  if (!version) throw TypeError("Registered boss equipment foundation required");
  const fields = [...envelope, ...(version >= 12 ? ["locker"] : []), ...(version >= 14 ? ["openingStory"] : [])];
  function convert(data) {
    if (data === null) return null;
    if (!data || typeof data !== "object" || !Number.isInteger(data.version) || data.version > 15) return undefined;
    if ((data.progression?.awards ?? []).some((row) => row.weaponId === RAILGUN_ITEM_ID)) return undefined;
    const profile = getRun().world.bossEquipmentData.commanderPistol,
      old = data.bossEquipment?.commanderPistol;
    if (old) {
      const model = createUnlockRewardModel({ itemId: profile.itemId, source: profile.source });
      if (!model.valid(old)) return undefined;
    }
    let next = structuredClone(data);
    const locker = data.locker;
    if (locker) {
      const resources = Object.keys(LOCKER_RESOURCE_RULES).filter((key) => key !== "railgun-reserve");
      if (
        !closedData(locker, ["version", "weapons", "ammo"]) ||
        locker.version !== 1 ||
        !Array.isArray(locker.weapons) ||
        new Set(locker.weapons).size !== locker.weapons.length ||
        !locker.weapons.every((id) => LOCKER_WEAPON_IDS.includes(id) && id !== RAILGUN_ITEM_ID) ||
        !closedData(locker.ammo, resources)
      )
        return undefined;
      // Do not normalize a historically impossible selected/stored pistol into a valid replacement.
      if (locker.weapons.includes("westminster-start-pistol-v1") && (data.pistol?.equipped || old?.selected))
        return undefined;
      next.locker.ammo["railgun-reserve"] = 0;
      if (old?.status === "owned" && locker.weapons.includes("westminster-start-pistol-v1"))
        next.locker.weapons.push(RAILGUN_ITEM_ID);
    }
    if (old) {
      const owned = old.status === "owned";
      next.bossEquipment.commanderPistol = {
        ...old,
        magazine: owned ? profile.rules.capacity : 0,
        reserve: owned ? profile.rules.reserve : 0,
      };
      if (old.selected) {
        if (!data.pistol?.collected || !data.pistol.equipped) return undefined;
        next.pistol = { ...data.pistol, equipped: false };
      }
    }
    return next;
  }
  const codec = {
    RUN_SAVE_KEY: RAILGUN_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return base.codec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      const old = JSON.parse(base.codec.encodeRun(g));
      if (old.version !== version) throw TypeError("Unexpected Railgun foundation version");
      return JSON.stringify({ ...old, version: 16 });
    },
    restoreRun(g, raw, previous) {
      const older = legacy;
      legacy = false;
      try {
        const data = raw == null ? null : JSON.parse(raw);
        if (older) {
          const converted = convert(data);
          if (converted === undefined) return null;
          return base.codec.restoreRun(g, converted === null ? null : JSON.stringify(converted), previous);
        }
        if (!closedData(data, fields) || data.version !== 16) return null;
        return base.codec.restoreRun(g, JSON.stringify({ ...data, version }), null);
      } catch {
        return null;
      }
    },
    captureRunState: (g) => base.codec.captureRunState(g),
    isRunStateUnchanged: (g, s) => base.codec.isRunStateUnchanged(g, s),
  };
  return {
    codec,
    wrapDomain: (execute) => (command, context) => execute(command, context),
    applySavedRun: (g, s) => base.applySavedRun(g, s),
    storageAdapter(storage) {
      const b = base.storageAdapter(storage);
      return !b
        ? b
        : {
            getItem(key) {
              if (key !== RAILGUN_SAVE_KEY) return b.getItem(key);
              legacy = false;
              const raw = b.getItem(key);
              if (raw != null) return raw;
              legacy = true;
              return b.getItem(base.codec.RUN_SAVE_KEY);
            },
            setItem: (key, raw) => b.setItem(key, raw),
          };
    },
  };
}
