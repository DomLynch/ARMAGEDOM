import { RIFLE_PROFILE } from "./weapon-catalog.js";
import {
  createLayerCodec,
  createLayerStorageAdapter,
  createReadOrigin,
  layerFailure,
  pickupEligible,
  runIsSafe,
  stageDeathDrops,
} from "./item-layer.js";
export const RIFLE_SAVE_KEY = "armagedom:rifle-run:v9";
// This layer's row: key, versions, tolerance and error messages, moved verbatim from the code below.
export const RIFLE_LAYER = Object.freeze({
  field: "rifle",
  saveKey: RIFLE_SAVE_KEY,
  previousKeys: Object.freeze([]),
  version: 9,
  baseVersion: 8,
  pickupEpsilon: 1e-8,
  finitePosition: true,
  messages: Object.freeze({
    envelope: "Invalid rifle envelope",
    base: "Rifle requires existing v8",
    snapshot: "Invalid rifle snapshot",
  }),
});
const fail = layerFailure;
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
  const reads = createReadOrigin();
  const {
    itemId,
    rules,
    source: { placementKey, areaId },
  } = profile;
  const state = (g) => (g.rifle === undefined ? model.freshState() : g.rifle);
  const selectedValid = (g, s) =>
    s.selected ? !g.pistol?.equipped && g.player?.weapon === "rifle" : g.player?.weapon !== "rifle";
  // Layer-specific migration: a base-era (legacy) record, or the current v9 envelope.
  function restoreEra(g, raw, legacyRaw, legacy) {
    const saved = raw == null ? null : JSON.parse(raw);
    if (legacy) {
      if ((saved?.progression?.awards ?? []).some((row) => row?.weaponId === itemId)) return null;
      const restored = baseCodec.restoreRun(g, raw, legacyRaw);
      if (!restored) return null;
      const rifle = model.restoreState(undefined, { sourceDead: sourceDead(restored) });
      return rifle ? { ...restored, rifle } : null;
    }
    if (
      saved?.version !== RIFLE_LAYER.version ||
      !Object.hasOwn(saved, RIFLE_LAYER.field) ||
      !model.valid(saved.rifle) ||
      (saved.rifle.selected && saved.pistol?.equipped)
    )
      return null;
    const previous = { ...saved, version: RIFLE_LAYER.baseVersion };
    delete previous.rifle;
    const restored = baseCodec.restoreRun(g, JSON.stringify(previous), null);
    return restored ? { ...restored, rifle: model.copy(saved.rifle) } : null;
  }
  const codec = createLayerCodec({
    baseCodec,
    row: RIFLE_LAYER,
    state,
    valid: model.valid,
    copy: model.copy,
    selectedValid,
    same,
    restore: restoreEra,
    reads,
  });
  const safe = (g) => runIsSafe(g, canDispatch, { nonNegativeTime: true });
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
            !pickupEligible(
              g,
              current,
              { areaId },
              { radius: rules.pickupRadius, epsilon: RIFLE_LAYER.pickupEpsilon, finitePosition: RIFLE_LAYER.finitePosition },
            )
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
        if (!["restore", "retry"].includes(command.type)) {
          const staged = stageDeathDrops({
            g,
            candidate,
            next,
            rows: [{ target: "rifle", source: { placementKey, areaId }, itemId }],
            stateOf: () => current,
            transition: (state, target, action) => model.transition(state, action),
            validatedDropPosition,
            matchCorpseArea: true,
          });
          if (!staged) return false;
          next = staged.next;
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
  const storageAdapter = createLayerStorageAdapter({
    baseStorageAdapter,
    saveKey: RIFLE_LAYER.saveKey,
    fallbacks: RIFLE_LAYER.previousKeys,
    legacyOrigin: true,
    baseKey: baseCodec.RUN_SAVE_KEY,
    reads,
  });
  return Object.freeze({ model, codec: Object.freeze(codec), wrapDomain, applySavedRun, storageAdapter });
}
