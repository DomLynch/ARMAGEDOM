/** Synchronous guest IO only. Inject the EXISTING unified-run codec; no ledger here. */
export function createRunStorage({ storage, codec }) {
  if (
    !codec ||
    typeof codec.encodeRun !== "function" ||
    typeof codec.restoreRun !== "function" ||
    typeof codec.RUN_SAVE_KEY !== "string" ||
    typeof codec.PISTOL_SAVE_KEY !== "string"
  )
    throw TypeError("Existing run codec and both legacy/current keys required");
  let committedRaw = null,
    committedKey = null,
    committedState = null,
    blocked = null;
  return Object.freeze({
    restore(template) {
      committedRaw = committedKey = committedState = null;
      if (!storage) {
        blocked = "unavailable";
        return { status: blocked };
      }
      let raw, legacyRaw;
      try {
        raw = storage.getItem(codec.RUN_SAVE_KEY);
        // Present corrupt primary data must never fall back to pistol-only data.
        legacyRaw = raw == null ? storage.getItem(codec.PISTOL_SAVE_KEY) : null;
      } catch {
        blocked = "unavailable";
        return { status: blocked };
      }
      let saved;
      try {
        saved = codec.restoreRun(template, raw, legacyRaw);
      } catch {
        saved = null;
      }
      if (!saved) {
        blocked = "corrupt";
        return { status: blocked };
      }
      blocked = null;
      return { status: "ok", source: raw != null ? "run" : legacyRaw != null ? "legacy" : "fresh", saved };
    },
    write(candidate, { fresh = false, reset = false } = {}) {
      // Only Core Retry/Reset may pass fresh; normal save cannot erase unreadable data.
      if (blocked && !fresh) return { status: blocked, ok: false };
      if (!storage) return { status: "unavailable", ok: false };
      if (candidate?.runSaveInvalid) {
        committedState = null;
        return { status: "corrupt", ok: false };
      }
      let raw,
        key,
        state = null;
      try {
        key = codec.RUN_SAVE_KEY;
        // Only a successful validated write may establish this optional codec guard.
        // Retry and restore must retain their validation/migration semantics.
        if (!blocked && !fresh && committedState && key === committedKey) {
          try {
            if (codec.isRunStateUnchanged(candidate, committedState)) return { status: "unchanged", ok: true };
          } catch {
            committedState = null;
          }
        }
        raw = codec.encodeRun(candidate);
        if (typeof raw !== "string" || !codec.restoreRun(candidate, raw, null)) {
          committedState = null;
          return { status: "invalid", ok: false };
        }
      } catch {
        committedState = null;
        return { status: "invalid", ok: false };
      }
      if (typeof codec.captureRunState === "function" && typeof codec.isRunStateUnchanged === "function") {
        try {
          state = codec.captureRunState(candidate);
        } catch {
          /* Unsupported shapes use full validation. */
        }
      }
      if (!reset && !blocked && key === committedKey && raw === committedRaw) {
        committedState = state;
        return { status: "unchanged", ok: true };
      }
      try {
        if (reset && !fresh) return { status: "invalid", ok: false };
        storage.setItem(key, raw);
      } catch {
        committedState = null;
        return { status: "unavailable", ok: false };
      }
      committedRaw = raw;
      committedKey = key;
      committedState = state;
      blocked = null;
      return { status: "saved", ok: true };
    },
  });
}
