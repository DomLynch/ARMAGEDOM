import { closedData } from "./progression-state.js";
import { GAME_DATA } from "./game-data.js";
import {
  createLayerCodec,
  createLayerStorageAdapter,
  createReadOrigin,
  layerFailure,
  candidateConflicts,
  pickupEligible,
  runIsSafe,
  saveIsInvalid,
  stageDeathDrops,
} from "./item-layer.js";
export const UNIQUE_REWARD_SAVE_KEY = "armagedom:unique-reward-run:v7";
// This layer's row: key, versions, envelope, pickup radius and tolerance, moved verbatim from the code below.
export const UNIQUE_REWARD_LAYER = Object.freeze({
  field: "uniqueReward",
  saveKey: UNIQUE_REWARD_SAVE_KEY,
  previousKeys: Object.freeze([]),
  version: 7,
  baseVersion: 6,
  envelope: Object.freeze([
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
  ]),
  pickupRadius: GAME_DATA.visual.weaponViews.uniqueReward.pickupReach, // data/visual.json: the one pickup reach, shared with the view
  pickupEpsilon: 1e-8,
  finitePosition: true,
  messages: Object.freeze({
    envelope: "Invalid unique reward envelope",
    base: "Unique reward requires base v6",
    snapshot: "Invalid unique reward snapshot",
  }),
});
const same = (a, b) =>
  a.version === b.version &&
  a.status === b.status &&
  a.rewardReceipt === b.rewardReceipt &&
  a.selectedMeleeVariant === b.selectedMeleeVariant &&
  (a.dropPosition === null
    ? b.dropPosition === null
    : b.dropPosition !== null && a.dropPosition.x === b.dropPosition.x && a.dropPosition.z === b.dropPosition.z);
const fail = layerFailure;
// OUTER wrapper: unique(expedition(progression(domain))). One existing Core writer.
export function createUniqueRewardComponent({
  baseCodec,
  getRun,
  model,
  placementKey,
  areaId,
  itemId,
  baseVariantId,
  applyBaseSaved,
  baseStorageAdapter = (storage) => storage,
  canDispatch,
  validatedDropPosition,
  sourceDead,
}) {
  if (
    [
      getRun,
      applyBaseSaved,
      baseStorageAdapter,
      canDispatch,
      validatedDropPosition,
      sourceDead,
      baseCodec?.encodeRun,
      baseCodec?.restoreRun,
      baseCodec?.captureRunState,
      baseCodec?.isRunStateUnchanged,
      model?.copy,
      model?.transition,
    ].some((fn) => typeof fn !== "function")
  )
    throw TypeError("Existing codec, model and runtime authority required");
  const reads = createReadOrigin();
  function missing(saved) {
    const dead = sourceDead(saved);
    return typeof dead === "boolean" ? model.restoreState(undefined, { sourceDead: dead }) : null;
  }
  const state = (g) => (g.uniqueReward === undefined ? missing(g) : g.uniqueReward);
  // Layer-specific migration: a base-era (legacy) record, or the current v7 envelope.
  function restoreEra(g, raw, legacyRaw, legacy) {
    if (legacy) {
      const restored = baseCodec.restoreRun(g, raw, legacyRaw);
      if (!restored) return null;
      const reward = missing(restored);
      return reward ? { ...restored, uniqueReward: reward } : null;
    }
    const saved = JSON.parse(raw);
    if (
      saved?.version !== UNIQUE_REWARD_LAYER.version ||
      !closedData(saved, UNIQUE_REWARD_LAYER.envelope) ||
      !model.valid(saved.uniqueReward)
    )
      return null;
    const previous = { ...saved, version: UNIQUE_REWARD_LAYER.baseVersion };
    delete previous.uniqueReward;
    const restored = baseCodec.restoreRun(g, JSON.stringify(previous), null);
    return restored ? { ...restored, uniqueReward: model.copy(saved.uniqueReward) } : null;
  }
  const codec = createLayerCodec({
    baseCodec,
    row: UNIQUE_REWARD_LAYER,
    state,
    valid: model.valid,
    copy: model.copy,
    same,
    checkSnapshot: false,
    restore: restoreEra,
    reads,
  });
  const safe = (g) => runIsSafe(g, canDispatch, { requireReady: false });
  function wrapDomain(executeDomain) {
    return (command, context) => {
      const g = getRun();
      if (!g) return fail("not-eligible");
      if (saveIsInvalid(g, command, model.valid(state(g)))) return fail("invalid-save");
      let changed = false,
        committedReward = null;
      const drops = [];
      function writeCandidate(candidate, { reward = state(g), pistol, player } = {}) {
        const current = state(g);
        if (
          !model.valid(current) ||
          candidateConflicts(command, candidate.uniqueReward, current, { valid: model.valid, same, strictRetry: true })
        )
          return false;
        let next = model.copy(reward);
        if (command.type !== "restore" && command.type !== "retry") {
          const staged = stageDeathDrops({
            g,
            candidate,
            next,
            rows: [{ target: "uniqueReward", source: { placementKey, areaId }, itemId }],
            stateOf: () => current,
            transition: (state, target, action) => model.transition(state, action),
            validatedDropPosition,
            matchCorpseArea: true,
          });
          if (!staged) return false;
          next = staged.next;
        }
        const proposal = { ...candidate, uniqueReward: next };
        if (pistol !== undefined) proposal.pistol = pistol;
        if (player !== undefined) proposal.player = player;
        if (!context.writeRun(proposal)) return false;
        changed ||= !same(current, next);
        committedReward = model.copy(next);
        candidate.uniqueReward = model.copy(next);
        if (command.type !== "retry") g.uniqueReward = model.copy(next);
        if (current.status !== next.status && next.status === "pending")
          drops.push({ type: "unique-reward-drop", itemId, areaId, position: { ...next.dropPosition } });
        return true;
      }
      const claim = command.type === "claimPickup" && command.pickupId === itemId,
        select = command.type === "equip" && [baseVariantId, itemId].includes(command.itemId);
      if (claim || select) {
        if (!safe(g)) return fail("not-eligible");
        const current = state(g);
        if (claim) {
          if (current.status === "owned") return fail("already-collected");
          if (
            !pickupEligible(
              g,
              current,
              { areaId },
              {
                radius: UNIQUE_REWARD_LAYER.pickupRadius,
                epsilon: UNIQUE_REWARD_LAYER.pickupEpsilon,
                finitePosition: UNIQUE_REWARD_LAYER.finitePosition,
              },
            )
          )
            return fail("not-eligible");
        }
        if (select && command.equipped !== true) return fail("not-eligible");
        const next = model.transition(
          current,
          claim ? { type: "pickup" } : { type: "select", variantId: command.itemId },
        );
        if (!next) return fail("not-eligible");
        if (select && !g.pistol) return fail("not-eligible");
        const pistol = claim ? g.pistol : { ...g.pistol, equipped: false },
          player = claim ? g.player : { ...g.player, weapon: "knife" };
        const ownChanged = claim || !same(current, next) || g.pistol.equipped || g.player.weapon !== "knife";
        // Reconcile all retained progression/expedition intent before this ONE write.
        const result = executeDomain(
          { type: "save" },
          {
            ...context,
            writeRun: (candidate) =>
              writeCandidate(candidate, select ? { reward: next, pistol, player } : { reward: next }),
          },
        );
        if (!result.ok) return result;
        if (select && ownChanged) {
          g.pistol = pistol;
          g.player.weapon = player.weapon;
        }
        const ownEvents = ownChanged
          ? [
              {
                type: claim ? "unique-reward-pickup" : "melee-variant-selected",
                itemId: claim ? itemId : command.itemId,
              },
            ]
          : [];
        return {
          ...result,
          changed: result.changed || changed || ownChanged,
          events: [...result.events, ...drops, ...ownEvents],
        };
      }
      const result = executeDomain(command, { ...context, writeRun: writeCandidate });
      // Inner codecs clone their candidates. The domain swaps the original fresh run
      // only after durable success; attach the committed DTO to that new live owner.
      if (result.ok && command.type === "retry" && committedReward) getRun().uniqueReward = model.copy(committedReward);
      return result.ok
        ? { ...result, changed: result.changed || changed, events: [...result.events, ...drops] }
        : result;
    };
  }
  function applySavedRun(g, saved) {
    if (!model.valid(saved.uniqueReward)) throw TypeError("Invalid restored unique reward");
    g.uniqueReward = model.copy(saved.uniqueReward);
    applyBaseSaved(g, saved);
  }
  const storageAdapter = createLayerStorageAdapter({
    baseStorageAdapter,
    saveKey: UNIQUE_REWARD_LAYER.saveKey,
    fallbacks: UNIQUE_REWARD_LAYER.previousKeys,
    legacyOrigin: true,
    baseKey: baseCodec.RUN_SAVE_KEY,
    reads,
  });
  return Object.freeze({ model, codec: Object.freeze(codec), wrapDomain, applySavedRun, storageAdapter });
}
