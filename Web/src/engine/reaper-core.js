import { closedData } from "./progression-state.js";
import { REAPER_ITEM_ID, REAPER_RECEIPT } from "./reaper.js";
export const REAPER_SAVE_KEY = "armagedom:reaper-run:v15";
const fields = [
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
  "openingStory",
];
// Existing quest selection/receipt remains the single entitlement/selection DTO.
// This passive version boundary retains v14 untouched for rollback and rejects future credit/locker IDs in historical inputs.
export function createReaperComponent({ base, getRun }) {
  let legacy = false;
  const codec = {
    RUN_SAVE_KEY: REAPER_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return base.codec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      const old = JSON.parse(base.codec.encodeRun(g));
      if (old.version !== 14) throw TypeError("Reaper requires v14 foundation");
      return JSON.stringify({ ...old, version: 15 });
    },
    restoreRun(g, raw, previous) {
      const older = legacy;
      legacy = false;
      try {
        let data = raw == null ? null : JSON.parse(raw);
        if (older) {
          if (
            (data?.progression?.awards ?? []).some((row) => row.weaponId === REAPER_ITEM_ID) ||
            (data?.locker?.weapons ?? []).includes(REAPER_ITEM_ID)
          )
            return null;
          const saved = base.codec.restoreRun(g, raw, previous);
          if (!saved) return null;
          if (
            saved.expedition?.status === "claimed" &&
            saved.expedition.rewardReceipt === REAPER_RECEIPT &&
            saved.locker?.weapons.includes("westminster-start-pistol-v1")
          ) {
            saved.locker = { ...saved.locker, weapons: [...saved.locker.weapons, REAPER_ITEM_ID] };
            saved.expedition = { ...saved.expedition, selectedPistolVariant: "westminster-start-pistol-v1" };
          }
          return saved;
        }
        if (!closedData(data, fields) || data.version !== 15) return null;
        return base.codec.restoreRun(g, JSON.stringify({ ...data, version: 14 }), null);
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
              if (key !== REAPER_SAVE_KEY) return b.getItem(key);
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
