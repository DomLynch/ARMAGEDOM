import { createWantedProjection } from "./wanted-projection.js";
import { createMarkedView } from "./marked-view.js";
import { createTrapCrateView } from "./trap-crate-view.js";
import { createReaperView } from "./reaper-view.js";
import { carriedWeaponTiles, createWeaponTiles } from "./weapon-tiles.js";
import { nextCarriedWeapon, carriedWeaponAt } from "./weapon-cycle.js";
import { createSafehouseView } from "./safehouse-view.js";
import { createBossEquipmentView } from "./boss-equipment-view.js";
import { selectedBossRanged } from "./boss-weapon-runtime.js";
import { selectedFlameProfile } from "./boss-equipment-data.js";
import { createRifleView } from "./rifle-view.js";
import { selectedPistolProfile } from "./expedition-core.js";
import { selectedMeleeVariant } from "../melee-equipment.js";
import { webText } from "./web-text.js";
import { effectiveWeaponDamage } from "./progression-runtime.js";
import { createFlameView } from "./flame-view.js";
import { createCursedRelicView } from "./cursed-relic-view.js";
import { createChainedPitbornView } from "./chained-pitborn-view.js";
import { stopFlame } from "./flame-runtime.js";
import { createUniqueRewardView } from "../unique-reward-view.js";
import { createBossView } from "./boss-view.js";
import { createExpeditionView } from "./expedition-runtime.js";
import { resetMobileControls } from "../combat.js";
import { keySuffix } from "./key-hint.js";
import { stepPistol, START_PISTOL_ID, START_PISTOL_LABEL, PISTOL_RULES } from "../pistol.js";
import { VEST_BAG_POSITION } from "./run-state.js";
import { createRunPersistence } from "./run-core.js";
import { withWorldJournal } from "./world-events.js";
import { createMarkerOnlyDrop, markDrop } from "./drop-marker.js";
import { createSupplyView } from "../supplies-view.js";
import { createVestBagView } from "../vest-view.js";
import { vestAvailable, VEST_RULES } from "../vest.js";
import { GAME_DATA, fillText } from "./game-data.js";
import { PISTOL_ITEM_ID } from "../core/pistol-operation.js";
// The weapon summary lines quote these rows of data/weapons.json, so the text cannot drift from what the weapon does.
const GRENADE = GAME_DATA.weapons.ranged["standard-grenade-v1"],
  ROCKET = GAME_DATA.weapons.ranged["borough-butchers-rocket-launcher-v1"],
  SHOTGUN = GAME_DATA.weapons.ranged["south-stalker-shotgun-v1"];
export function dispatchEquipmentSelection(g, command, allowed, dispatch) {
  const result = dispatch(g, command, allowed);
  if (result.ok && (command.type === "equip" || command.type === "selectVariant")) stopFlame(g, { unequip: true });
  return result;
}
export function claimStartingPistol(g, dispatch, clearInput) {
  const result = dispatch(g, { type: "claimPickup", pickupId: "westminster-start-pistol-v1" }, true);
  if (result.ok) {
    g.events.push(...result.events);
    // Picking the pistol up equips it: say so ("Starting Pistol equipped."), without repeating the rounds the pistol tile shows.
    g.message = fillText(GAME_DATA.combatText.gear.equipped, {
      name: g.world.expeditionData?.variants?.[PISTOL_ITEM_ID]?.name ?? webText("summary.pistolDefaultName"),
    });
    g.messageUntil = g.time + GAME_DATA.visual.hud.equipMessageSeconds;
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
// The uncollected starting pistol as a pickup candidate: in its area, in reach, in line of sight, and the player free to act.
export function startingPistolCandidate(g, run) {
  const p = g.pistol;
  return p &&
    !p.collected &&
    g.world.areaId === p.pickupAreaId &&
    !g.player.swing &&
    g.time >= g.player.ready &&
    g.time >= g.player.hurtUntil &&
    g.time >= g.player.dodgeUntil &&
    Math.hypot(g.player.pos.x - p.pickupPos.x, g.player.pos.z - p.pickupPos.z) <= PISTOL_RULES.pickupRadius &&
    g.world.lineClear(g.player.pos, p.pickupPos)
    ? { id: START_PISTOL_ID, label: START_PISTOL_LABEL, pickup: true, position: p.pickupPos, run }
    : null;
}
// Walking into the reach of a pickup claims it. `step(position, candidates, time)` runs the nearest candidate marked `pickup: true`
// that is due and remembers it until the candidate leaves the list (claimed, or out of reach), so a claim still in flight (an async
// auto-equip) is not repeated every frame. A pickup still listed after its back-off (the claim was refused for a reason that can
// pass, such as full save storage) is tried again while the player stays in reach: after 1 s, then 2 s, then every 4 s (weapons.json
// `autoPickupRetry`). Each pickup's own radius, line of sight, loaded and safe-to-act checks decide whether it is a candidate at all.
// `time` is game time (seconds).
export function createAutoPickup({ firstSeconds, maxSeconds } = GAME_DATA.weapons.autoPickupRetry) {
  const started = new Map();
  return function step(position, candidates, time = 0) {
    const pickups = candidates.filter((c) => c?.pickup === true);
    const live = new Set(pickups.map((c) => c.id));
    for (const id of started.keys()) if (!live.has(id)) started.delete(id);
    const next = nearestInteraction(
      position,
      pickups.filter((c) => !started.has(c.id) || time >= started.get(c.id).retryAt),
    );
    if (!next) return false;
    const wait = started.has(next.id)
      ? Math.min(started.get(next.id).wait * 2, maxSeconds) // tuning-ok: each retry waits twice as long as the last
      : firstSeconds;
    started.set(next.id, { retryAt: time + wait, wait });
    next.run();
    return true;
  };
}
export function meleeWeaponSummary(g) {
  const profile = selectedMeleeVariant(g);
  if (profile.modelVariantId === "bone-saw") {
    const r = g.world.bossEquipmentData.surgicalKnife.rules;
    return webText("summary.boneSaw", {
      name: profile.name,
      damage: +effectiveWeaponDamage(g, "knife", r.damage).toFixed(1),
      interval: r.interval,
    });
  }
  return webText("summary.melee", {
    name: profile.name,
    slash: +effectiveWeaponDamage(g, "knife", profile.moves.light_right.damage).toFixed(1),
    heavy: +effectiveWeaponDamage(g, "knife", profile.moves.heavy_overhead.damage).toFixed(1),
  });
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
  const uniqueView = createUniqueRewardView(
    s,
    (g, command, allowed) => {
      const result = dispatchEquipmentSelection(g, command, allowed, persistence.dispatchUniqueReward);
      if (result.ok && command.type === "equip") resetMobileControls(g);
      s.updateExpedition?.();
      return result;
    },
    { markDrop, createMarkerOnlyDrop },
  );
  const expeditionView = createExpeditionView(s, (g, command, allowed) => {
    const result = dispatchEquipmentSelection(g, command, allowed, persistence.dispatchExpedition);
    s.updateExpedition?.();
    return result;
  });
  const safehouseView = createSafehouseView(s, persistence.dispatchLocker);
  const markedView = createMarkedView(s, persistence.dispatchMarked),
    wantedProjection = createWantedProjection(s),
    relicView = createCursedRelicView(s),
    trapCrateView = createTrapCrateView(s),
    chainedPitbornView = createChainedPitbornView(s);
  // Everything in reach, pickups (`pickup: true`) and doors/contacts alike. Pickups are claimed by autoPickup as the player walks in;
  // the shared button and G only ever offer the rest (G also still claims a pickup the auto path left alone).
  function interactionCandidates() {
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
      return [];
    const candidates = [safehouseView, flameView, expeditionView, uniqueView, rifleView, bossEquipmentView].flatMap(
      (view) => view.interaction?.() ?? [],
    );
    const pistol = startingPistolCandidate(g, () =>
      claimStartingPistol(g, persistence.dispatchPistol, () => s.input.clear({ keepMovement: true })),
    );
    if (pistol) candidates.push(pistol);
    return candidates;
  }
  function interaction() {
    const g = s.game;
    return g ? nearestInteraction(g.player.pos, interactionCandidates()) : null;
  }
  function interactNearby() {
    const target = interaction();
    return target ? target.run() : !!s.game?.flame?.equipped && flameView.interact();
  }
  const autoPickup = createAutoPickup();
  function updateInteraction() {
    const field = document.getElementById("pistol-interact"),
      candidates = interactionCandidates(),
      position = s.game?.player.pos;
    if (position) autoPickup(position, candidates, s.game.time);
    const target = position
      ? nearestInteraction(
          position,
          candidates.filter((c) => !c.pickup),
        )
      : null;
    if (!field) return;
    field.hidden = !target;
    field.disabled = false;
    if (target) {
      field.textContent = target.label + keySuffix();
      field.dataset.contextAction = target.id;
    } else field.removeAttribute("data-context-action");
  }
  const selectWeapon = (row) => {
    const id = row.control;
    if (id === "reaper-equip") return reaperView.equip();
    if (id.startsWith("melee-variant-")) return uniqueView.equip(id.slice("melee-variant-".length));
    if (id.startsWith("variant-")) return expeditionView.selectVariant(id.slice("variant-".length));
    if (id === "rifle-equip") return rifleView.equip();
    if (id === "flame-equip") return flameView.equip();
    if (id.startsWith("boss-equip-")) return bossEquipmentView.equip(id.slice("boss-equip-".length));
  };
  const weaponTiles = createWeaponTiles(s, selectWeapon);
  // Keyboard weapon switch: the next carried weapon after the active one, in tile order, through the same
  // select path as a tile tap. The Reaper companion is a deploy/recall toggle, so the cycle skips it.
  let cycling = false;
  // { step } picks the next (1) or previous (-1) carried weapon, { slot } the nth; the blocked states are the same as a tile tap.
  async function switchWeapon({ step = 1, slot = null } = {}) {
    const g = s.game;
    if (cycling || !g || s.paused || !s.loaded || s.traveling || s.contextLost || g.finished || g.player.hp <= 0)
      return;
    const rows = carriedWeaponTiles(g),
      next = slot ? carriedWeaponAt(rows, slot) : nextCarriedWeapon(rows, step);
    if (!next || document.getElementById(next.control)?.disabled !== false) return;
    cycling = true;
    try {
      await selectWeapon(next);
    } finally {
      cycling = false;
      weaponTiles.update();
    }
  }
  let vestBag = null;
  function updateVestEquipment() {
    const node = document.getElementById("vest-state"),
      g = s.game;
    if (!node || !g) return;
    const text = g.vest?.equipped
      ? webText("summary.vestWorn", { percent: Math.round(VEST_RULES.reduction * 100) })
      : webText("summary.vestNone", { kills: VEST_RULES.requiredKills });
    if (node.textContent !== text) node.textContent = text;
    const active = document.getElementById("active-weapon");
    if (!active) return;
    let weapon;
    if (g.flame?.equipped) {
      const data = selectedFlameProfile(g);
      weapon = webText("summary.flame", {
        name: data.name ?? webText("summary.flameDefaultName"),
        fuel: Math.ceil((g.flameFuel.fuelUnits / data.capacity) * 100),
        damage: data.contact.damage,
        interval: data.contact.interval,
      });
    } else if (selectedBossRanged(g)) {
      const field = selectedBossRanged(g),
        data = g.world.bossEquipmentData[field],
        state = g.bossEquipment[field];
      weapon =
        field === "commanderPistol"
          ? webText("summary.arcGun", {
              name: data.name,
              damage: data.rules.damage,
              jumps: data.arc.jumps,
              range: data.rules.range,
              seconds: data.charge.seconds,
              magazine: state.magazine,
              capacity: data.rules.capacity,
              reserve: state.reserve,
            })
          : field === "grenade"
            ? webText("summary.grenade", {
                name: data.name,
                magazine: state.magazine,
                fuse: GRENADE.payload.fuseSeconds,
                radius: GRENADE.payload.radius,
              })
            : field === "rocketLauncher"
              ? webText("summary.rocket", {
                  name: data.name,
                  magazine: state.magazine,
                  reserve: state.reserve,
                  damage: ROCKET.payload.maxDamage,
                  radius: ROCKET.payload.radius,
                  capacity: ROCKET.rules.capacity,
                  reload: ROCKET.rules.reload,
                })
              : webText("summary.shotgun", {
                  name: data.name,
                  magazine: state.magazine,
                  reserve: state.reserve,
                  pellets: SHOTGUN.payload.pelletCount,
                  pelletDamage: SHOTGUN.payload.pelletDamage,
                  capacity: SHOTGUN.rules.capacity,
                });
    } else if (g.rifle?.selected) {
      const data = g.world.rifleData;
      weapon = webText("summary.rifle", {
        name: data.name,
        damage: data.rules.damage,
        magazine: g.rifle.magazine,
        capacity: data.rules.capacity,
        reserve: g.rifle.reserve,
      });
    } else if (g.pistol?.equipped) {
      const profile = selectedPistolProfile(g);
      weapon = webText("summary.pistol", {
        name: profile.name ?? webText("summary.pistolDefaultName"),
        damage: +effectiveWeaponDamage(g, "westminster-start-pistol-v1", profile.damage).toFixed(1),
        magazine: g.pistol.magazine,
        capacity: profile.capacity,
        reserve: g.pistol.reserve,
      });
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
      relicView.update();
      trapCrateView.update();
      chainedPitbornView.update();
      wantedProjection.update();
      updateInteraction();
      weaponTiles.update();
    },
    interactNearby,
    switchWeapon,
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
      relicView.dispose();
      markedView.dispose();
      trapCrateView.dispose();
      chainedPitbornView.dispose();
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
