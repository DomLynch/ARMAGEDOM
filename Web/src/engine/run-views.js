import { createWantedProjection } from "./wanted-projection.js";
import { createMarkedView } from "./marked-view.js";
import { createReaperView } from "./reaper-view.js";
import { createWeaponTiles } from "./weapon-tiles.js";
import { createSafehouseView } from "./safehouse-view.js";
import { createBossEquipmentView } from "./boss-equipment-view.js";
import { selectedBossRanged } from "./boss-weapon-runtime.js";
import { selectedFlameProfile } from "./boss-equipment-data.js";
import { createRifleView } from "./rifle-view.js";
import { selectedPistolProfile } from "./expedition-core.js";
import { selectedMeleeVariant } from "../melee-equipment.js";
import { effectiveWeaponDamage } from "./progression-runtime.js";
import { createFlameView } from "./flame-view.js";
import { stopFlame } from "./flame-runtime.js";
import { createUniqueRewardView } from "../unique-reward-view.js";
import { createBossView } from "./boss-view.js";
import { createExpeditionView } from "./expedition-runtime.js";
import { resetMobileControls } from "../combat.js";
import { stepPistol, START_PISTOL_ID, START_PISTOL_LABEL } from "../pistol.js";
import { VEST_BAG_POSITION } from "./run-state.js";
import { createRunPersistence } from "./run-core.js";
import { withWorldJournal } from "./world-events.js";
import { createSupplyView } from "../supplies-view.js";
import { createVestBagView } from "../vest-view.js";
import { vestAvailable, VEST_RULES } from "../vest.js";
export function dispatchEquipmentSelection(g, command, allowed, dispatch) {
  const result = dispatch(g, command, allowed);
  if (result.ok && (command.type === "equip" || command.type === "selectVariant")) stopFlame(g, { unequip: true });
  return result;
}
export function claimStartingPistol(g, dispatch, clearInput) {
  const result = dispatch(g, { type: "claimPickup", pickupId: "westminster-start-pistol-v1" }, true);
  if (result.ok) {
    g.events.push(...result.events);
    g.message = `Starting Pistol · ${g.pistol.magazine} loaded · ${g.pistol.reserve} spare.`;
    g.messageUntil = g.time + 3;
    clearInput();
  }
  return true;
}
export function nearestInteraction(position, candidates) {
  return (
    candidates
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.run === "function" &&
          Number.isFinite(c.position?.x) &&
          Number.isFinite(c.position?.z),
      )
      .map((c) => ({ ...c, distance: Math.hypot(position.x - c.position.x, position.z - c.position.z) }))
      // The starting pistol wins over everything in reach (the contract giver stands 0.15 m from it), so G and the
      // shared button at spawn collect the pistol; once claimed, the contract is reachable as before.
      .sort(
        (a, b) =>
          (b.id === START_PISTOL_ID) - (a.id === START_PISTOL_ID) ||
          a.distance - b.distance ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export function meleeWeaponSummary(g) {
  const profile = selectedMeleeVariant(g);
  if (profile.modelVariantId === "bone-saw") {
    const r = g.world.bossEquipmentData.surgicalKnife.rules;
    return `${profile.name} · Hold CUT · ${+effectiveWeaponDamage(g, "knife", r.damage).toFixed(1)} damage / ${r.interval}s contact · slowed while cutting`;
  }
  return `${profile.name} · Slash ${+effectiveWeaponDamage(g, "knife", profile.moves.light_right.damage).toFixed(1)} · Heavy ${+effectiveWeaponDamage(g, "knife", profile.moves.heavy_overhead.damage).toFixed(1)}`;
}
export function createRunViews(s) {
  let storage;
  if ("storage" in s) storage = s.storage;
  else
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  const persistence = withWorldJournal(
    createRunPersistence({
      getRun: () => s.game,
      setRun: (value) => s.setGame(value),
      createFreshRun: (options) => s.createFreshRun(options),
      storage,
    }),
    s,
  );
  const reaperView = createReaperView(s, persistence.dispatchExpedition);
  const bossEquipmentView = createBossEquipmentView(s, persistence.dispatchBossEquipment, () => flameView.equip());
  const bossView = createBossView(s),
    flameView = createFlameView(s, persistence);
  const rifleView = createRifleView(s, (g, command, allowed) =>
    dispatchEquipmentSelection(g, command, allowed, persistence.dispatchRifle),
  );
  const uniqueView = createUniqueRewardView(s, (g, command, allowed) => {
    const result = dispatchEquipmentSelection(g, command, allowed, persistence.dispatchUniqueReward);
    if (result.ok && command.type === "equip") resetMobileControls(g);
    s.updateExpedition?.();
    return result;
  });
  const expeditionView = createExpeditionView(s, (g, command, allowed) => {
    const result = dispatchEquipmentSelection(g, command, allowed, persistence.dispatchExpedition);
    s.updateExpedition?.();
    return result;
  });
  const safehouseView = createSafehouseView(s, persistence.dispatchLocker);
  const markedView = createMarkedView(s, persistence.dispatchMarked),
    wantedProjection = createWantedProjection(s);
  function interaction() {
    const g = s.game;
    if (
      !g ||
      !s.loaded ||
      s.contextLost ||
      s.traveling ||
      s.paused ||
      g.finished ||
      g.runSaveInvalid ||
      g.player.hp <= 0
    )
      return null;
    const candidates = [safehouseView, flameView, expeditionView, uniqueView, rifleView, bossEquipmentView].flatMap(
      (view) => view.interaction?.() ?? [],
    );
    const p = g.pistol;
    if (
      p &&
      !p.collected &&
      g.world.areaId === p.pickupAreaId &&
      !g.player.swing &&
      g.time >= g.player.ready &&
      g.time >= g.player.hurtUntil &&
      g.time >= g.player.dodgeUntil &&
      Math.hypot(g.player.pos.x - p.pickupPos.x, g.player.pos.z - p.pickupPos.z) <= 1.3 &&
      g.world.lineClear(g.player.pos, p.pickupPos)
    )
      candidates.push({
        id: START_PISTOL_ID,
        label: START_PISTOL_LABEL,
        position: p.pickupPos,
        run: () => claimStartingPistol(g, persistence.dispatchPistol, () => s.input.clear()),
      });
    return nearestInteraction(g.player.pos, candidates);
  }
  function interactNearby() {
    const target = interaction();
    return target ? target.run() : !!s.game?.flame?.equipped && flameView.interact();
  }
  function updateInteraction() {
    const field = document.getElementById("pistol-interact"),
      target = interaction();
    if (!field) return;
    field.hidden = !target;
    field.disabled = false;
    if (target) {
      field.textContent = target.label + " · G";
      field.dataset.contextAction = target.id;
    } else field.removeAttribute("data-context-action");
  }
  const weaponTiles = createWeaponTiles(s, (row) => {
    const id = row.control;
    if (id === "reaper-equip") return reaperView.equip();
    if (id.startsWith("melee-variant-")) return uniqueView.equip(id.slice(14));
    if (id.startsWith("variant-")) return expeditionView.selectVariant(id.slice(8));
    if (id === "rifle-equip") return rifleView.equip();
    if (id === "flame-equip") return flameView.equip();
    if (id.startsWith("boss-equip-")) return bossEquipmentView.equip(id.slice(11));
  });
  let vestBag = null;
  function updateVestEquipment() {
    const node = document.getElementById("vest-state"),
      g = s.game;
    if (!node || !g) return;
    const text = g.vest?.equipped
      ? `Worn vest · ${Math.round(VEST_RULES.reduction * 100)}% hit protection`
      : `No vest · Westminster stash after ${VEST_RULES.requiredKills} kills; pickup equips it.`;
    if (node.textContent !== text) node.textContent = text;
    const active = document.getElementById("active-weapon");
    if (!active) return;
    let weapon;
    if (g.flame?.equipped) {
      const data = selectedFlameProfile(g);
      weapon = `${data.name ?? "Flamethrower"} · ${Math.ceil((g.flameFuel.fuelUnits / data.capacity) * 100)}% fuel · ${data.contact.damage} damage per ${data.contact.interval}s contact`;
    } else if (selectedBossRanged(g)) {
      const field = selectedBossRanged(g),
        data = g.world.bossEquipmentData[field],
        state = g.bossEquipment[field];
      weapon =
        field === "commanderPistol"
          ? `${data.name} · ${data.rules.damage} piercing damage · ${data.rules.range}m · ${data.charge.seconds}s charge · ${state.magazine}/${data.rules.capacity} loaded · ${state.reserve} reserve`
          : field === "grenade"
            ? `${data.name} · ${state.magazine} charges · 1s fuse · 3m radius`
            : field === "rocketLauncher"
              ? `${data.name} · 80 blast damage · 3m radius · ${state.magazine}/1 loaded · ${state.reserve} reserve · 3.2s reload`
              : `${data.name} · 8 × 8 pellets · ${state.magazine}/2 loaded · ${state.reserve} reserve`;
    } else if (g.rifle?.selected) {
      const data = g.world.rifleData;
      weapon = `${data.name} · ${data.rules.damage} damage · ${g.rifle.magazine}/${data.rules.capacity} loaded · ${g.rifle.reserve} reserve`;
    } else if (g.pistol?.equipped) {
      const profile = selectedPistolProfile(g);
      weapon = `${profile.name ?? "Starting Pistol"} · ${+effectiveWeaponDamage(g, "westminster-start-pistol-v1", profile.damage).toFixed(1)} damage · ${g.pistol.magazine}/${profile.capacity} loaded · ${g.pistol.reserve} reserve`;
    } else weapon = meleeWeaponSummary(g);
    if (active.textContent !== weapon) active.textContent = weapon;
  }
  function clearVestBag() {
    vestBag?.dispose();
    vestBag = null;
  }
  function updateVestBag() {
    const available =
      !s.contextLost &&
      !s.traveling &&
      !s.game.finished &&
      s.world.areaId === "westminster" &&
      vestAvailable(s.game.vest, s.game.supplies, s.game.lootRules);
    if (!available) {
      clearVestBag();
      return;
    }
    if (!vestBag) {
      vestBag = createVestBagView();
      s.scene.add(vestBag.root);
      vestBag.root.position.copy(s.world.toRender(VEST_BAG_POSITION));
      s.game.message = "Supply bag by the pistol stash · Worn vest available.";
      s.game.messageUntil = s.game.time + 4;
    }
    vestBag.update(s.game.time);
  }
  const supplyViews = new Map();
  function updateSupplies() {
    const drops = s.game?.supplies?.pending.filter((d) => d.areaId === s.world.areaId) ?? [],
      ids = new Set(drops.map((d) => d.id));
    for (const [id, v] of supplyViews)
      if (!ids.has(id)) {
        v.view.dispose();
        supplyViews.delete(id);
      }
    for (const drop of drops) {
      let v = supplyViews.get(drop.id);
      if (v && v.remaining !== drop.remaining) {
        v.view.dispose();
        supplyViews.delete(drop.id);
        v = null;
      }
      if (!v) {
        v = {
          remaining: drop.remaining,
          view:
            drop.kind === "westminster-worn-vest-v1"
              ? createVestBagView()
              : createSupplyView({
                  kind:
                    drop.kind === "rounds"
                      ? "ammo"
                      : drop.kind === "westminster-start-pistol-v1"
                        ? "pistol"
                        : "dressing",
                  count: drop.remaining,
                }),
        };
        supplyViews.set(drop.id, v);
        s.scene.add(v.view.root);
      }
      v.view.root.position.copy(s.world.toRender(drop.position));
      v.view.update(s.game.time);
    }
  }
  function clearSupplies() {
    for (const v of supplyViews.values()) v.view.dispose();
    supplyViews.clear();
  }
  function cancelPistol(g) {
    for (const clock of Object.values(g.bossEquipmentAction ?? {})) clock.reloadingUntil = 0;
    if (g.rifleAction) g.rifleAction.reloadingUntil = 0;
    stopFlame(g);
    s.effects?.clearFlameFeedback?.();
    resetMobileControls(g);
    s.actors?.resetFeedback();
    g.pistolTargetId = null;
    g.pistolTargetFacing = null;
    if (!g.flame?.equipped) g.pistol = stepPistol(g.pistol, { time: g.time, cancel: true, canAct: false }).state;
    s.effects?.clearPistolFeedback();
    s.effects?.update(g, { paused: true });
  }
  return {
    updateExpedition() {
      updateVestEquipment();
      reaperView.update();
      expeditionView.update();
      uniqueView.update();
      bossView.update();
      flameView.update();
      rifleView.update();
      bossEquipmentView.update();
      safehouseView.update();
      markedView.update();
      wantedProjection.update();
      updateInteraction();
      weaponTiles.update();
    },
    interactNearby,
    interactSafehouse: safehouseView.interact,
    interactFlame: flameView.interact,
    interactExpedition: expeditionView.interact,
    interactUniqueReward: uniqueView.interact,
    clearVestBag,
    updateVestBag,
    ...persistence,
    updateSupplies,
    clearSupplies,
    cancelPistol,
    dispose() {
      wantedProjection.dispose();
      markedView.dispose();
      weaponTiles.dispose();
      reaperView.dispose();
      safehouseView.dispose();
      bossEquipmentView.dispose();
      rifleView.dispose();
      flameView.dispose();
      uniqueView.dispose();
      bossView.dispose();
      expeditionView.dispose();
      clearSupplies();
      clearVestBag();
    },
  };
}
