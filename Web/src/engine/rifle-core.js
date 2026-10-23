import { RIFLE_PROFILE } from "./weapon-catalog.js";
export const RIFLE_SAVE_KEY = "armagedom:rifle-run:v9";
const fail = (code) => ({ ok: false, code, events: [] });
const same = (a, b) =>
  a.version === b.version &&
  a.status === b.status &&
  a.rewardReceipt === b.rewardReceipt &&
  a.magazine === b.magazine &&
  a.reserve === b.reserve &&
  a.selected === b.selected &&
  (a.dropPosition === null
    ? b.dropPosition === null
    : b.dropPosition !== null && a.dropPosition.x === b.dropPosition.x && a.dropPosition.z === b.dropPosition.z);
// One current v9 record extends v8; the old v8 bytes remain read-only for migration/rollback.
export function createRifleComponent({
  baseCodec,
  getRun,
  model,
  profile = RIFLE_PROFILE,
  applyBaseSaved,
  baseStorageAdapter = (storage) => storage,
  canDispatch,
  validatedDropPosition,
  sourceDead,
  getAction = () => null,
}) {
  if (
    [
      getRun,
      applyBaseSaved,
      baseStorageAdapter,
      canDispatch,
      validatedDropPosition,
      sourceDead,
      getAction,
      baseCodec?.encodeRun,
      baseCodec?.restoreRun,
      baseCodec?.captureRunState,
      baseCodec?.isRunStateUnchanged,
      model?.freshState,
      model?.valid,
      model?.copy,
      model?.transition,
    ].some((fn) => typeof fn !== "function")
  )
    throw TypeError("Existing v8 codec, rifle model and runtime authorities required");
  let legacyRead = false;
  const {
    itemId,
    rules,
    source: { placementKey, areaId },
  } = profile;
  const state = (g) => (g.rifle === undefined ? model.freshState() : g.rifle);
  const selectedValid = (g, s) =>
    s.selected ? !g.pistol?.equipped && g.player?.weapon === "rifle" : g.player?.weapon !== "rifle";
  const codec = {
    RUN_SAVE_KEY: RIFLE_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return baseCodec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      const rifle = state(g);
      if (!model.valid(rifle) || !selectedValid(g, rifle)) throw TypeError("Invalid rifle envelope");
      const old = JSON.parse(baseCodec.encodeRun(g));
      if (old.version !== 8) throw TypeError("Rifle requires existing v8");
      return JSON.stringify({ ...old, version: 9, rifle: model.copy(rifle) });
    },
    restoreRun(g, raw, legacyRaw) {
      const legacy = legacyRead;
      legacyRead = false;
      try {
        const saved = raw == null ? null : JSON.parse(raw);
        if (legacy) {
          if ((saved?.progression?.awards ?? []).some((row) => row?.weaponId === itemId)) return null;
          const restored = baseCodec.restoreRun(g, raw, legacyRaw);
          if (!restored) return null;
          const rifle = model.restoreState(undefined, { sourceDead: sourceDead(restored) });
          return rifle ? { ...restored, rifle } : null;
        }
        if (
          saved?.version !== 9 ||
          !Object.hasOwn(saved, "rifle") ||
          !model.valid(saved.rifle) ||
          (saved.rifle.selected && saved.pistol?.equipped)
        )
          return null;
        const previous = { ...saved, version: 8 };
        delete previous.rifle;
        const restored = baseCodec.restoreRun(g, JSON.stringify(previous), null);
        return restored ? { ...restored, rifle: model.copy(saved.rifle) } : null;
      } catch {
        return null;
      }
    },
    captureRunState(g) {
      const rifle = state(g);
      if (!model.valid(rifle) || !selectedValid(g, rifle)) throw TypeError("Invalid rifle snapshot");
      return { base: baseCodec.captureRunState(g), rifle: model.copy(rifle) };
    },
    isRunStateUnchanged(g, snapshot) {
      const rifle = state(g);
      return (
        model.valid(rifle) &&
        selectedValid(g, rifle) &&
        same(rifle, snapshot.rifle) &&
        baseCodec.isRunStateUnchanged(g, snapshot.base)
      );
    },
  };
  function safe(g) {
    const p = g.player;
    return (
      !!p &&
      Number.isFinite(p.hp) &&
      p.hp > 0 &&
      !g.finished &&
      !g.runSaveInvalid &&
      !p.swing &&
      Number.isFinite(g.time) &&
      g.time >= 0 &&
      g.time >= (p.ready ?? 0) &&
      g.time >= (p.hurtUntil ?? 0) &&
      g.time >= (p.dodgeUntil ?? 0) &&
      canDispatch(g) === true
    );
  }
  function wrapDomain(executeDomain) {
    return (command, context) => {
      const g = getRun();
      if (!g) return fail("not-eligible");
      if (command.type !== "restore" && (g.runSaveInvalid || !model.valid(state(g)))) return fail("invalid-save");
      const current = state(g),
        claim = command.type === "claimPickup" && command.pickupId === itemId,
        select = command.type === "equip" && command.itemId === itemId;
      const action = command.type === "save" ? getAction(g) : null;
      let proposed = null,
        changed = false,
        committed = null;
      const events = [];
      if (claim || select || action !== null) {
        if (!safe(g)) return fail("not-eligible");
        if (claim) {
          if (current.status === "owned") return fail("already-collected");
          if (
            current.status !== "pending" ||
            ![g.player.pos?.x, g.player.pos?.z].every(Number.isFinite) ||
            g.world.areaId !== areaId ||
            Math.hypot(g.player.pos.x - current.dropPosition.x, g.player.pos.z - current.dropPosition.z) >
              rules.pickupRadius + 1e-8 ||
            !g.world.lineClear(g.player.pos, current.dropPosition)
          )
            return fail("not-eligible");
          proposed = model.transition(current, { type: "pickup" });
        } else if (select) {
          if (current.status !== "owned" || typeof command.equipped !== "boolean") return fail("not-eligible");
          proposed = model.transition(current, { type: "select", selected: command.equipped });
        } else {
          if (!action || !["fire", "reload"].includes(action.type)) return fail("invalid-command");
          proposed = model.transition(current, action);
        }
        if (!proposed) return fail("not-eligible");
      }
      function writeCandidate(candidate) {
        if (
          command.type !== "retry" &&
          candidate.rifle !== undefined &&
          (!model.valid(candidate.rifle) || !same(candidate.rifle, current))
        )
          return false;
        let next = model.copy(proposed ?? current);
        const award = (row) => row.placementKey === placementKey && row.areaId === areaId;
        if (
          !["restore", "retry"].includes(command.type) &&
          ["eligible", "legacy-dead"].includes(current.status) &&
          (candidate.progression?.awards ?? []).some(award) &&
          !(g.progression?.awards ?? []).some(award)
        ) {
          const corpse =
            g.world.areaId === areaId
              ? [...(g.enemies ?? []), ...(g.corpses ?? [])].find(
                  (e) =>
                    e.placementKey === placementKey &&
                    (e.areaId ?? g.world.areaId) === areaId &&
                    Number.isFinite(e.hp) &&
                    e.hp <= 0,
                )
              : null;
          if (!corpse) return false;
          let position;
          try {
            position = validatedDropPosition(g, corpse);
          } catch {
            return false;
          }
          next = model.transition(next, { type: "drop", placementKey, areaId, position });
          if (!next) return false;
        }
        // Other existing equipment owners keep authority over their successful switch.
        if (
          !select &&
          command.type !== "retry" &&
          next.selected &&
          ((command.type === "equip" && candidate.player.weapon !== "rifle") ||
            (candidate.pistol?.equipped && candidate.player.weapon === "pistol"))
        )
          next.selected = false;
        const proposal = { ...candidate, rifle: next };
        if (next.selected) {
          proposal.pistol = { ...candidate.pistol, equipped: false, reloadingUntil: 0 };
          proposal.player = { ...candidate.player, weapon: "rifle" };
        } else if (select)
          proposal.player = { ...candidate.player, weapon: candidate.pistol?.equipped ? "pistol" : "knife" };
        if (!context.writeRun(proposal)) return false;
        changed ||= !same(current, next);
        committed = model.copy(next);
        candidate.rifle = model.copy(next);
        if (command.type !== "retry") {
          g.rifle = model.copy(next);
          if (!next.selected && g.rifleAction) g.rifleAction.reloadingUntil = 0;
          if (select) {
            g.pistol = proposal.pistol ?? g.pistol;
            g.player.weapon = proposal.player.weapon;
          }
        }
        if (current.status !== next.status && next.status === "pending")
          events.push({ type: "rifle-drop", itemId, areaId, position: { ...next.dropPosition } });
        return true;
      }
      const result = executeDomain(claim || select ? { type: "save" } : command, {
        ...context,
        writeRun: writeCandidate,
      });
      if (!result.ok) return result;
      if (command.type === "retry" && committed) {
        const fresh = getRun();
        fresh.rifle = model.copy(committed);
        if (committed.selected) {
          fresh.pistol = { ...fresh.pistol, equipped: false, reloadingUntil: 0 };
          fresh.player.weapon = "rifle";
        }
      }
      if (claim) events.push({ type: "rifle-pickup", itemId });
      if (select) events.push({ type: "rifle-selected", itemId, equipped: proposed.selected });
      if (action?.type === "fire") events.push({ type: "rifle-ammo-spent", itemId, rounds: 1 });
      if (action?.type === "reload")
        events.push({ type: "rifle-reloaded", itemId, rounds: proposed.magazine - current.magazine });
      return { ...result, changed: result.changed || changed, events: [...result.events, ...events] };
    };
  }
  function applySavedRun(g, saved) {
    if (!model.valid(saved.rifle) || (saved.rifle.selected && saved.pistol?.equipped))
      throw TypeError("Invalid restored rifle");
    applyBaseSaved(g, saved);
    g.rifle = model.copy(saved.rifle);
    g.rifleAction = { nextFireAt: 0, reloadingUntil: 0, firedAt: -1 };
    if (g.rifle.selected) {
      g.pistol = { ...g.pistol, equipped: false, reloadingUntil: 0 };
      g.player.weapon = "rifle";
    }
  }
  function storageAdapter(storage) {
    const base = baseStorageAdapter(storage);
    return !base
      ? base
      : {
          getItem(key) {
            if (key !== RIFLE_SAVE_KEY) return base.getItem(key);
            legacyRead = false;
            const raw = base.getItem(key);
            if (raw != null) return raw;
            legacyRead = true;
            return base.getItem(baseCodec.RUN_SAVE_KEY);
          },
          setItem: (key, raw) => base.setItem(key, raw),
        };
  }
  return Object.freeze({ model, codec: Object.freeze(codec), wrapDomain, applySavedRun, storageAdapter });
}
