export const HUB_SAVE_KEY = "armagedom:central-hub-run:v17";
// Passive envelope only. Railgun16 and the existing Core remain the sole
// owners of resources, receipts, validation and writes. Keep16 for rollback.
export function createHubComponent({ base }) {
  if (base?.codec.RUN_SAVE_KEY !== "armagedom:railgun-run:v16") throw TypeError("Hub requires Railgun16 foundation");
  let legacy = false;
  const codec = {
    RUN_SAVE_KEY: HUB_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return base.codec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      const data = JSON.parse(base.codec.encodeRun(g));
      if (data.version !== 16) throw TypeError("Unexpected hub foundation");
      return JSON.stringify({ ...data, version: 17 });
    },
    restoreRun(g, raw, previous) {
      const older = legacy;
      legacy = false;
      try {
        if (older) return base.codec.restoreRun(g, raw, previous);
        const data = JSON.parse(raw);
        if (!data || data.version !== 17) return null;
        return base.codec.restoreRun(g, JSON.stringify({ ...data, version: 16 }), null);
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
              if (key !== HUB_SAVE_KEY) return b.getItem(key);
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
