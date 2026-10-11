/** Synchronous guest IO only. Inject the EXISTING unified-run codec; no ledger here. */
export function createRunStorage({storage, codec}) {
  if (!codec || typeof codec.encodeRun !== 'function' || typeof codec.restoreRun !== 'function' ||
      typeof codec.RUN_SAVE_KEY !== 'string' || typeof codec.PISTOL_SAVE_KEY !== 'string')
    throw TypeError('Existing run codec and both legacy/current keys required');
  let committedRaw = null, blocked = null;
  return Object.freeze({
    restore(template) {
      committedRaw = null;
      if (!storage) { blocked = 'unavailable'; return {status: blocked}; }
      let raw, legacyRaw;
      try {
        raw = storage.getItem(codec.RUN_SAVE_KEY);
        // Present corrupt primary data must never fall back to pistol-only data.
        legacyRaw = raw == null ? storage.getItem(codec.PISTOL_SAVE_KEY) : null;
      } catch { blocked = 'unavailable'; return {status: blocked}; }
      let saved;
      try { saved = codec.restoreRun(template, raw, legacyRaw); }
      catch { saved = null; }
      if (!saved) { blocked = 'corrupt'; return {status: blocked}; }
      blocked = null;
      return {status: 'ok', source: raw != null ? 'run' : legacyRaw != null ? 'legacy' : 'fresh', saved};
    },
    write(candidate, {fresh = false} = {}) {
      // Only Core Retry may pass fresh; normal save cannot erase unreadable data.
      if (blocked && !fresh) return {status: blocked, ok: false};
      if (!storage) return {status: 'unavailable', ok: false};
      if (candidate?.runSaveInvalid) return {status: 'corrupt', ok: false};
      let raw;
      try {
        raw = codec.encodeRun(candidate);
        if (typeof raw !== 'string' || !codec.restoreRun(candidate, raw, null))
          return {status: 'invalid', ok: false};
      } catch { return {status: 'invalid', ok: false}; }
      if (!blocked && raw === committedRaw) return {status: 'unchanged', ok: true};
      try { storage.setItem(codec.RUN_SAVE_KEY, raw); }
      catch { return {status: 'unavailable', ok: false}; }
      committedRaw = raw; blocked = null;
      return {status: 'saved', ok: true};
    },
  });
}
