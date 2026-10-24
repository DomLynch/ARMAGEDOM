// Shared parts of the per-item save layers (engine/*-core.js). Each layer states its keys, versions, envelope, radii
// and event names as a data row and passes it in; nothing in this file is a tuned value or an item name.
// The layers keep their own selection rules as named hooks.
export const layerFailure = (code) => ({ ok: false, code, events: [] });
export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The one place a run is "safe" to change equipment: alive, idle, not mid-action, and the scope allows it. */
export function runIsSafe(g, canDispatch, { requireReady = true } = {}) {
  const p = g.player;
  return (
    !!p &&
    Number.isFinite(p.hp) &&
    p.hp > 0 &&
    !g.finished &&
    !g.runSaveInvalid &&
    !p.swing &&
    Number.isFinite(g.time) &&
    (!requireReady || g.time >= (p.ready ?? 0)) &&
    g.time >= (p.hurtUntil ?? 0) &&
    g.time >= (p.dodgeUntil ?? 0) &&
    canDispatch(g) === true
  );
}

/** Pickup eligibility for a pending drop: same area, within the row's radius (plus its epsilon), line clear. */
export function pickupEligible(g, state, source, { radius, epsilon }) {
  const p = g.player.pos;
  return (
    state.status === "pending" &&
    !!p &&
    g.world.areaId === source.areaId &&
    Math.hypot(p.x - state.dropPosition.x, p.z - state.dropPosition.z) <= radius + epsilon &&
    g.world.lineClear(p, state.dropPosition)
  );
}

/**
 * Death -> pending drop. For each row whose source died in the candidate write (award present in the candidate but
 * not yet in the live run), find the corpse, place the drop and move the model to `pending`. Returns the next state
 * and the drop events, or null when a corpse or a legal spot is missing (the write is then refused).
 */
export function stageDeathDrops({ g, candidate, next, rows, model, validatedDropPosition, eventType, events = [] }) {
  // Events go into the caller's array row by row, so a later refused row leaves earlier ones in place, as before.
  for (const [target, data] of rows) {
    const s = next[target],
      matches = (a) => a.placementKey === data.source.placementKey && a.areaId === data.source.areaId;
    if (
      !["eligible", "legacy-dead"].includes(s.status) ||
      !(candidate.progression?.awards ?? []).some(matches) ||
      (g.progression?.awards ?? []).some(matches)
    )
      continue;
    const corpse =
      g.world.areaId === data.source.areaId
        ? [...(g.enemies ?? []), ...(g.corpses ?? [])].find(
            (e) => e.placementKey === data.source.placementKey && Number.isFinite(e.hp) && e.hp <= 0,
          )
        : null;
    if (!corpse) return null;
    let position;
    try {
      position = validatedDropPosition(g, corpse, data.source);
    } catch {
      return null;
    }
    next = model.transition(next, target, {
      type: "drop",
      placementKey: data.source.placementKey,
      areaId: data.source.areaId,
      position,
    });
    if (!next) return null;
    events.push({ type: eventType, itemId: data.itemId, areaId: data.source.areaId, position: { ...position } });
  }
  return { next, events };
}

/**
 * Remembers which stored key a read came from, so the codec can pick the matching migration.
 * `fallbacks` is the ordered list of older keys: [{key, origin}]; the base codec's key is the last, legacy, resort.
 */
export function createReadOrigin() {
  let origin = null;
  return {
    set: (value) => {
      origin = value;
    },
    take: () => {
      const value = origin;
      origin = null;
      return value;
    },
  };
}

export function createLayerStorageAdapter({ baseStorageAdapter, saveKey, fallbacks, legacyOrigin, baseKey, reads }) {
  return (storage) => {
    const base = baseStorageAdapter(storage);
    return !base
      ? base
      : {
          getItem(key) {
            if (key !== saveKey) return base.getItem(key);
            reads.set(null);
            const raw = base.getItem(key);
            if (raw != null) return raw;
            for (const { key: older, origin } of fallbacks) {
              const previous = base.getItem(older);
              if (previous != null) {
                reads.set(origin);
                return previous;
              }
            }
            reads.set(legacyOrigin);
            return base.getItem(baseKey);
          },
          setItem: (key, raw) => base.setItem(key, raw),
        };
  };
}

/**
 * The layer's save codec. `row` carries saveKey, version, baseVersion, field and the error messages; `restore`
 * is the layer's own migration (it receives the read origin) and may return null to refuse the record.
 */
export function createLayerCodec({ baseCodec, row, state, valid, copy, selectedValid, restore, reads }) {
  return {
    RUN_SAVE_KEY: row.saveKey,
    get PISTOL_SAVE_KEY() {
      return baseCodec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      const value = state(g);
      if (!valid(value) || !selectedValid(g, value)) throw TypeError(row.messages.envelope);
      const old = JSON.parse(baseCodec.encodeRun(g));
      if (old.version !== row.baseVersion) throw TypeError(row.messages.base);
      return JSON.stringify({ ...old, version: row.version, [row.field]: copy(value) });
    },
    restoreRun(g, raw, legacyRaw) {
      const origin = reads.take();
      try {
        return restore(g, raw, legacyRaw, origin);
      } catch {
        return null;
      }
    },
    captureRunState(g) {
      const value = state(g);
      if (!valid(value) || !selectedValid(g, value)) throw TypeError(row.messages.snapshot);
      return { base: baseCodec.captureRunState(g), [row.field]: copy(value) };
    },
    isRunStateUnchanged(g, snapshot) {
      const value = state(g);
      return (
        valid(value) &&
        selectedValid(g, value) &&
        sameJson(value, snapshot[row.field]) &&
        baseCodec.isRunStateUnchanged(g, snapshot.base)
      );
    },
  };
}
