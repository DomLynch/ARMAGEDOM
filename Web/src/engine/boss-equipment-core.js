import { closedData } from "./progression-state.js";
import { syncMeleeEquipment } from "../melee-equipment.js";
import { createUnlockRewardModel } from "./unlock-reward-state.js";
import { createAmmoRewardModel } from "./rifle-state.js";
import { createRewardCollectionModel } from "./reward-collection-state.js";
import {
  createLayerCodec,
  createLayerStorageAdapter,
  createReadOrigin,
  layerFailure,
  pickupEligible,
  runIsSafe,
  sameJson,
  stageDeathDrops,
} from "./item-layer.js";
export const BOSS_EQUIPMENT_SAVE_KEY = "armagedom:boss-equipment-run:v11";
export const PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY = "armagedom:boss-equipment-run:v10";
const previousFields = ["shotgun", "grenade", "surgicalKnife", "commanderPistol", "emberProjector"];
// This layer's row: keys, versions, envelope, tolerances and event names, moved verbatim from the code below.
export const BOSS_EQUIPMENT_LAYER = Object.freeze({
  field: "bossEquipment",
  saveKey: BOSS_EQUIPMENT_SAVE_KEY,
  previousKeys: Object.freeze([{ key: PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, origin: "v10" }]),
  version: 11,
  previousVersion: 10,
  baseVersion: 9,
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
    "flameFuel",
    "rifle",
    "bossEquipment",
  ]),
  pickupEpsilon: 1e-8,
  events: Object.freeze({ drop: "boss-equipment-drop" }),
  messages: Object.freeze({
    envelope: "Invalid boss equipment envelope",
    base: "Boss equipment requires existing v9",
    snapshot: "Invalid equipment snapshot",
  }),
});
const fail = layerFailure;
const equal = sameJson;
// One outer envelope uses existing Core IO; retained v10/v9/v8 are read-only migration inputs.
export function createBossEquipmentComponent({
  baseCodec,
  getRun,
  profiles,
  applyBaseSaved,
  baseStorageAdapter = (storage) => storage,
  canDispatch,
  getAction = () => null,
  validatedDropPosition,
  sourceDead,
}) {
  if (
    [
      baseCodec?.encodeRun,
      baseCodec?.restoreRun,
      getRun,
      applyBaseSaved,
      canDispatch,
      getAction,
      validatedDropPosition,
      sourceDead,
    ].some((fn) => typeof fn !== "function")
  )
    throw TypeError("Existing v9 and runtime authorities required");
  if (
    !closedData(profiles, [...previousFields, "rocketLauncher"]) ||
    profiles.rocketLauncher.itemId !== "borough-butchers-rocket-launcher-v1" ||
    profiles.rocketLauncher.family !== "launchers" ||
    profiles.rocketLauncher.weaponKey !== "rocket" ||
    !closedData(profiles.rocketLauncher.source, ["placementKey", "areaId", "receiptId"]) ||
    profiles.rocketLauncher.source.placementKey !== "boss-butcher-v1" ||
    profiles.rocketLauncher.source.areaId !== "elephant-and-castle" ||
    profiles.rocketLauncher.source.receiptId !== "boss-butcher-v1:borough-butchers-rocket-launcher-v1"
  )
    throw TypeError("Six registered reward profiles required");
  const models = Object.fromEntries(
      Object.entries(profiles).map(([field, data]) => [
        field,
        ["shotguns", "grenades", "launchers", "rifles"].includes(data.family)
          ? createAmmoRewardModel(data)
          : createUnlockRewardModel({ itemId: data.itemId, source: data.source }),
      ]),
    ),
    model = createRewardCollectionModel(models),
    fields = Object.keys(models),
    byItem = new Map(fields.map((field) => [profiles[field].itemId, field]));
  const previousModel = createRewardCollectionModel(
    Object.fromEntries(previousFields.map((field) => [field, models[field]])),
  );
  const reads = createReadOrigin();
  const state = (g) => (g.bossEquipment === undefined ? model.freshState() : g.bossEquipment);
  const selected = (s) => fields.find((field) => s[field].selected) ?? null;
  const selectedValid = (g, s) => {
    const field = selected(s);
    return field
      ? (profiles[field].family === "pistols" ? g.pistol?.collected && g.pistol.equipped : !g.pistol?.equipped) &&
          !g.rifle?.selected &&
          (profiles[field].family === "flamethrowers"
            ? g.flameFuel?.collected && g.flame?.equipped
            : !g.flame?.equipped) &&
          g.player?.weapon === profiles[field].weaponKey
      : !fields.some(
          (field) =>
            ["shotguns", "grenades", "launchers", "rifles"].includes(profiles[field].family) &&
            g.player?.weapon === profiles[field].weaponKey,
        );
  };
  // Layer-specific migrations: legacy base-era records, the retained v10 era, and the current v11 envelope.
  function restoreEra(g, raw, legacyRaw, origin) {
    const saved = raw == null ? null : JSON.parse(raw);
    // Reject the impossible launcher receipt before any historical codec can normalize it.
    if (
      origin !== null &&
      (saved?.progression?.awards ?? []).some((row) => row?.weaponId === profiles.rocketLauncher.itemId)
    )
      return null;
    if (origin === "legacy") {
      const introduced = new Set(Object.values(profiles).map((data) => data.itemId));
      if ((saved?.progression?.awards ?? []).some((row) => introduced.has(row?.weaponId))) return null;
      const restored = baseCodec.restoreRun(g, raw, legacyRaw);
      if (!restored) return null;
      const equipment = {};
      for (const field of fields) {
        const next = models[field].restoreState(undefined, {
          sourceDead: sourceDead(restored, profiles[field].source),
        });
        if (!next) return null;
        equipment[field] = next;
      }
      return model.valid(equipment) ? { ...restored, bossEquipment: equipment } : null;
    }
    const historical = origin === "v10";
    if (
      saved?.version !== (historical ? BOSS_EQUIPMENT_LAYER.previousVersion : BOSS_EQUIPMENT_LAYER.version) ||
      !closedData(saved, BOSS_EQUIPMENT_LAYER.envelope) ||
      !(historical ? previousModel : model).valid(saved.bossEquipment)
    )
      return null;
    const old = { ...saved, version: BOSS_EQUIPMENT_LAYER.baseVersion };
    delete old.bossEquipment;
    const restored = baseCodec.restoreRun(g, JSON.stringify(old), null);
    if (!restored) return null;
    const equipment = historical
      ? {
          ...previousModel.copy(saved.bossEquipment),
          rocketLauncher: models.rocketLauncher.restoreState(undefined, {
            sourceDead: sourceDead(restored, profiles.rocketLauncher.source),
          }),
        }
      : model.copy(saved.bossEquipment);
    if (!model.valid(equipment)) return null;
    const field = selected(equipment);
    if (
      field &&
      ((profiles[field].family === "pistols"
        ? !saved.pistol?.collected || !saved.pistol.equipped
        : saved.pistol?.equipped) ||
        saved.rifle?.selected ||
        (profiles[field].family === "flamethrowers" && !saved.flameFuel?.collected))
    )
      return null;
    return { ...restored, bossEquipment: equipment };
  }
  const codec = createLayerCodec({
    baseCodec,
    row: BOSS_EQUIPMENT_LAYER,
    state,
    valid: model.valid,
    copy: model.copy,
    selectedValid,
    restore: restoreEra,
    reads,
  });
  const safe = (g) => runIsSafe(g, canDispatch);
  function applyCommitted(g, committed) {
    g.bossEquipment = model.copy(committed.bossEquipment);
    if (committed.pistol) g.pistol = committed.pistol;
    if (committed.flameState && g.flame) Object.assign(g.flame, committed.flameState);
    if (committed.flameFuel) g.flameFuel = { ...committed.flameFuel };
    const field = selected(g.bossEquipment);
    if (field) {
      const data = profiles[field];
      g.pistol = {
        ...g.pistol,
        equipped: data.family === "pistols",
        ...(data.family !== "pistols" || committed.resetPose ? { reloadingUntil: 0 } : {}),
      };
      if (g.rifle) g.rifle = { ...g.rifle, selected: false };
      if (g.rifleAction) g.rifleAction.reloadingUntil = 0;
      if (g.flame) {
        if (data.family === "flamethrowers")
          Object.assign(
            g.flame,
            { equipped: true },
            committed.resetPose ? { active: false, wantFire: false, elapsed: 0, pendingReturn: false } : {},
          );
        else Object.assign(g.flame, { equipped: false, active: false, wantFire: false, elapsed: 0 });
      }
      g.player.weapon = data.weaponKey;
    } else if (committed.playerWeapon !== undefined) g.player.weapon = committed.playerWeapon;
    if (g.world.uniqueRewardData) syncMeleeEquipment(g);
  }

  function wrapDomain(executeDomain) {
    return (command, context) => {
      const g = getRun();
      if (!g) return fail("not-eligible");
      const current = state(g);
      if (command.type !== "restore" && (g.runSaveInvalid || !model.valid(current))) return fail("invalid-save");
      const field = byItem.get(command.type === "claimPickup" ? command.pickupId : command.itemId),
        claim = command.type === "claimPickup" && field !== undefined,
        select = command.type === "equip" && field !== undefined,
        action = command.type === "save" ? getAction(g) : null;
      let proposed = null,
        committed = null;
      const events = [];
      if (claim || select || action) {
        if (!safe(g)) return fail("not-eligible");
        const target = action?.field ?? field,
          data = profiles[target];
        if (!data) return fail("invalid-command");
        if (claim) {
          if (
            !pickupEligible(g, current[target], data.source, {
              radius: data.rules.pickupRadius,
              epsilon: BOSS_EQUIPMENT_LAYER.pickupEpsilon,
            })
          )
            return fail("not-eligible");
          proposed = model.transition(current, target, { type: "pickup" });
        } else if (select) {
          if (
            typeof command.equipped !== "boolean" ||
            (command.equipped && data.family === "pistols" && !g.pistol?.collected)
          )
            return fail("invalid-command");
          proposed = model.transition(current, target, { type: "select", selected: command.equipped });
        } else {
          if (action.type === "sharedPistol" && data.family === "pistols" && current[target].selected)
            proposed = model.copy(current);
          else {
            if (!["fire", "reload"].includes(action.type)) return fail("invalid-command");
            proposed = model.transition(current, target, { type: action.type });
          }
        }
        if (!proposed) return fail("not-eligible");
      }
      function writeCandidate(candidate) {
        if (
          command.type !== "retry" &&
          candidate.bossEquipment !== undefined &&
          (!model.valid(candidate.bossEquipment) || !equal(candidate.bossEquipment, current))
        )
          return false;
        let next = model.copy(proposed ?? current);
        if (!["restore", "retry"].includes(command.type)) {
          const staged = stageDeathDrops({
            g,
            candidate,
            next,
            rows: fields.map((target) => [target, profiles[target]]),
            model,
            validatedDropPosition,
            eventType: BOSS_EQUIPMENT_LAYER.events.drop,
            events,
          });
          if (!staged) return false;
          next = staged.next;
        }
        if (
          !select &&
          command.type !== "retry" &&
          (command.type === "equip" ||
            command.type === "selectVariant" ||
            (candidate.pistol?.equipped && profiles[selected(next)]?.family !== "pistols") ||
            candidate.rifle?.selected ||
            (candidate.flame?.equipped && profiles[selected(next)]?.family !== "flamethrowers") ||
            (profiles[selected(next)]?.family === "flamethrowers" && !candidate.flame?.equipped))
        )
          for (const target of fields)
            if (next[target].selected) {
              next = model.transition(next, target, { type: "select", selected: false });
              if (!next) return false;
            }
        const active = selected(next),
          proposal = { ...candidate, bossEquipment: next };
        if (action?.type === "sharedPistol") proposal.pistol = action.pistol;
        if (claim && profiles[field].family === "flamethrowers")
          proposal.flameFuel = { version: 1, collected: true, fuelUnits: profiles[field].rules.fuelCapacity };
        if (active) {
          proposal.pistol = {
            ...proposal.pistol,
            equipped: profiles[active].family === "pistols",
            ...(profiles[active].family !== "pistols" || select ? { reloadingUntil: 0 } : {}),
          };
          if (candidate.rifle) proposal.rifle = { ...candidate.rifle, selected: false };
          if (candidate.flame)
            proposal.flame = { ...candidate.flame, equipped: profiles[active].family === "flamethrowers" };
          proposal.player = { ...candidate.player, weapon: profiles[active].weaponKey };
        } else if (select) {
          proposal.player = {
            ...candidate.player,
            weapon: candidate.pistol?.equipped ? "pistol" : candidate.rifle?.selected ? "rifle" : "knife",
          };
          if (profiles[field].family === "flamethrowers" && candidate.flame)
            proposal.flame = { ...candidate.flame, equipped: false, active: false, wantFire: false, elapsed: 0 };
        }
        if (!context.writeRun(proposal)) return false;
        committed = {
          pistol: proposal.pistol,
          bossEquipment: model.copy(next),
          playerWeapon: proposal.player.weapon,
          flameFuel: proposal.flameFuel,
          flameState: select && profiles[field].family === "flamethrowers" ? proposal.flame : undefined,
          resetPose: select,
        };
        candidate.bossEquipment = model.copy(next);
        return true;
      }
      const result = executeDomain(claim || select ? { type: "save" } : command, {
        ...context,
        writeRun: writeCandidate,
      });
      if (!result.ok) return result;
      // Choosing an already-selected legacy variant is a base no-op, but must still durably clear the outer variant.
      if (
        !committed &&
        !select &&
        selected(current) &&
        ["equip", "selectVariant"].includes(command.type) &&
        !writeCandidate(getRun())
      )
        return fail("storage-unavailable");
      // Nested legacy owners may apply their own callbacks after IO; apply the outer committed selection last.
      if (committed) applyCommitted(getRun(), committed);
      if (claim) events.push({ type: "boss-equipment-pickup", itemId: profiles[field].itemId });
      if (select)
        events.push({ type: "boss-equipment-selected", itemId: profiles[field].itemId, equipped: command.equipped });
      if (action?.type === "sharedPistol")
        events.push({ type: "boss-pistol-resource-commit", itemId: profiles[action.field].itemId });
      else if (action)
        events.push({
          type: "boss-equipment-" + (action.type === "fire" ? "ammo-spent" : "reloaded"),
          field: action.field,
          itemId: profiles[action.field].itemId,
        });
      return {
        ...result,
        changed: result.changed || (!!committed && !equal(current, committed.bossEquipment)),
        events: [...result.events, ...events],
      };
    };
  }
  function applySavedRun(g, saved) {
    if (!model.valid(saved.bossEquipment)) throw TypeError("Invalid restored boss equipment");
    applyBaseSaved(g, saved);
    applyCommitted(g, { bossEquipment: saved.bossEquipment });
    g.bossEquipmentAction = {};
    g.activeGrenades = [];
    g.activeRockets = [];
  }
  const storageAdapter = createLayerStorageAdapter({
    baseStorageAdapter,
    saveKey: BOSS_EQUIPMENT_LAYER.saveKey,
    fallbacks: BOSS_EQUIPMENT_LAYER.previousKeys,
    legacyOrigin: "legacy",
    baseKey: baseCodec.RUN_SAVE_KEY,
    reads,
  });
  return Object.freeze({ model, models, codec: Object.freeze(codec), wrapDomain, applySavedRun, storageAdapter });
}
