import { lockerStored } from "./engine/locker-core.js";
import { effectiveWeaponDamage } from "./engine/progression-runtime.js";
import * as T from "three";
import { cloneMeleeWeapon, MELEE_VARIANTS } from "./melee-equipment.js";
import { addPickupGlow } from "./pickup-glow.js";
import { autoEquipAfterClaim, collectedMessage } from "./auto-equip.js";
import { GAME_DATA, fillText } from "./engine/game-data.js";
// Checked by engine/weapon-view-data.js, which the engine weapon views load.
const REWARD = GAME_DATA.visual.weaponViews.uniqueReward;
const TEXT = GAME_DATA.weaponViewText.uniqueReward;
const CLEAVER = GAME_DATA.combatText.rewardNames.cleaver;
const paint = (element, text) => {
  if (element.textContent !== text) element.textContent = text;
};
export function createMeleePickupView(source, data) {
  const clone = cloneMeleeWeapon(source, data.itemId),
    root = new T.Group(),
    display = new T.Group(),
    contours = [],
    meshes = [];
  root.name = "Unique reward · " + data.itemId; // text-ok: three.js group name for scene lookup, never shown
  root.userData = { itemId: data.itemId, placementKey: data.placementKey };
  display.add(clone.root);
  root.add(display);
  root.updateWorldMatrix(true, true);
  let bounds = new T.Box3().setFromObject(display),
    size = bounds.getSize(new T.Vector3());
  display.scale.setScalar(Math.min(1, REWARD.pickup.fitSize / Math.hypot(size.x, size.z)));
  root.updateWorldMatrix(true, true);
  bounds = new T.Box3().setFromObject(display);
  const center = bounds.getCenter(new T.Vector3());
  display.position.set(-center.x, REWARD.pickup.lift - bounds.min.y, -center.z);
  clone.root.traverse((mesh) => {
    if (mesh.isMesh) meshes.push(mesh);
  });
  for (const mesh of meshes) contours.push(addPickupGlow(mesh));
  let disposed = false;
  return {
    root,
    materials: clone.materials,
    contours,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const contour of contours) contour.dispose();
      for (const row of clone.materials) row.material.dispose();
    },
  };
}
// `markers` is the engine's drop marker (engine/drop-marker.js: markDrop, createMarkerOnlyDrop), handed in by run-views.js because
// this file sits outside the engine boundary. Without it the drop has no ring or label.
const noMarkers = {
  markDrop: (view) => view,
  createMarkerOnlyDrop() {
    const root = new T.Group();
    return { root, dispose: () => root.removeFromParent() };
  },
};
export function createUniqueRewardView(s, dispatch, markers = noMarkers) {
  const el = (id) => document.getElementById(id),
    panel = el("melee-equipment"),
    label = el("unique-reward-label");
  if (!panel || !label)
    return {
      update() {},
      interact() {
        return false;
      },
      dispose() {},
    };
  const buttons = new Map(),
    equipHandlers = new Map(),
    listeners = [],
    loads = new Map(),
    failed = new Set();
  let drop = null,
    disposed = false;
  const available = () => s.loaded && !s.contextLost && !s.traveling;
  const safe = (g) =>
    available() &&
    !g.finished &&
    g.player.hp > 0 &&
    !g.player.swing &&
    g.time >= g.player.hurtUntil &&
    g.time >= g.player.dodgeUntil;
  function clearDrop() {
    if (!drop) return;
    drop.dispose();
    drop = null;
  }
  function source(id) {
    return s.actors?.meleeVariantSource(id);
  }
  function prepare(id) {
    if (id === "knife" || source(id)) return Promise.resolve();
    if (loads.has(id)) return loads.get(id);
    failed.delete(id);
    const load = s.actors
      .ensureMeleeVariant(id)
      .catch((error) => {
        failed.add(id);
        throw error;
      })
      .finally(() => loads.delete(id));
    loads.set(id, load);
    return load;
  }
  function execute(command) {
    const g = s.game;
    if (!g) return { ok: false };
    const result = dispatch(g, command, safe(g));
    if (result.ok) {
      g.events.push(...result.events);
      g.message =
        command.type === "claimPickup"
          ? collectedMessage(CLEAVER)
          : fillText(TEXT.equipped, { name: MELEE_VARIANTS[command.itemId].name });
      g.messageUntil = g.time + REWARD.messageSeconds;
      if (command.type === "equip") s.input.clear({ keepMovement: true });
    }
    update();
    return result;
  }
  function build() {
    for (const [id, profile] of Object.entries(MELEE_VARIANTS)) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "melee-variant-" + id;
      el("melee-choices").append(button);
      buttons.set(id, button);
      const handler = async () => {
        const owner = s.game;
        if (!safe(owner)) return;
        const loadOnly = owner.uniqueReward?.status === "pending" && id === owner.world.uniqueRewardData?.itemId;
        try {
          const pending = prepare(id);
          update();
          await pending;
          if (!disposed && s.game === owner && safe(owner) && !loadOnly)
            execute({ type: "equip", itemId: id, equipped: true });
        } catch {
          if (s.game === owner) {
            owner.message = loadOnly ? TEXT.cleaverLoadFailed : TEXT.weaponLoadFailed;
            owner.messageUntil = owner.time + REWARD.loadFailedSeconds;
          }
        }
        update();
      };
      equipHandlers.set(id, handler);
      button.addEventListener("click", handler);
      listeners.push(() => button.removeEventListener("click", handler));
    }
  }
  function eligible(g) {
    const data = g.world.uniqueRewardData,
      state = g.uniqueReward;
    return !!(
      data &&
      state?.status === "pending" &&
      safe(g) &&
      !s.paused &&
      g.world.areaId === data.areaId &&
      source(data.itemId) &&
      Math.hypot(g.player.pos.x - state.dropPosition.x, g.player.pos.z - state.dropPosition.z) <=
        GAME_DATA.uniqueReward.pickupRadius + 1e-8 &&
      g.world.lineClear(g.player.pos, state.dropPosition)
    );
  }
  function interact() {
    const g = s.game;
    if (!g || !eligible(g)) return false;
    const itemId = g.world.uniqueRewardData.itemId,
      claimed = execute({ type: "claimPickup", pickupId: itemId }).ok;
    if (claimed)
      void autoEquipAfterClaim(g, {
        equip: (options) => equipHandlers.get(itemId)?.(options),
        active: () => g.uniqueReward?.selectedMeleeVariant === itemId,
        itemId,
        name: CLEAVER,
      });
    return claimed;
  }
  function createDrop(data, ready) {
    const name = MELEE_VARIANTS[data.itemId]?.name ?? TEXT.fallbackName,
      view = ready
        ? Object.assign(markers.markDrop(createMeleePickupView(source(data.itemId), data), name), { model: true })
        : markers.createMarkerOnlyDrop(name);
    s.scene.add(view.root);
    return view;
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = g?.world?.uniqueRewardData,
      state = g?.uniqueReward;
    panel.hidden = !data;
    if (!data || !state) {
      clearDrop();
      label.hidden = true;
      return;
    }
    if (!buttons.size) build();
    const owned = state.status === "owned",
      missing = state.status === "pending" && !source(data.itemId),
      retry = missing && failed.has(data.itemId),
      selected = MELEE_VARIANTS[state.selectedMeleeVariant];
    paint(
      el("melee-state"),
      state.status === "pending"
        ? retry
          ? TEXT.stateRetry
          : TEXT.statePending
        : state.status === "legacy-dead"
          ? TEXT.stateLegacyDead
          : owned
            ? fillText(TEXT.stateOwned, {
                name: selected.name,
                status: g.flame?.equipped || g.player.weapon !== "knife" ? TEXT.storedForMelee : TEXT.ownedEquipped,
              })
            : TEXT.stateLocked,
    );
    for (const [id, button] of buttons) {
      const profile = MELEE_VARIANTS[id],
        canOwn = id === "knife" || owned,
        canLoad = id === data.itemId && missing,
        equipped = !g.flame?.equipped && g.player.weapon === "knife" && state.selectedMeleeVariant === id;
      button.disabled = lockerStored(g, id) || (!canOwn && !canLoad) || !safe(g) || loads.has(id);
      button.setAttribute("aria-pressed", String(equipped));
      paint(
        button,
        lockerStored(g, id)
          ? fillText(TEXT.buttonStored, { name: profile.name })
          : fillText(TEXT.button, {
              action: TEXT.actions[
                loads.has(id)
                  ? "loading"
                  : canLoad
                    ? retry
                      ? "retryLoading"
                      : "loadWeapon"
                    : equipped
                      ? "equipped"
                      : canOwn
                        ? "equip"
                        : "locked"
              ],
              name: profile.name,
            }),
      );
    }
    if (el("melee-comparison"))
      paint(
        el("melee-comparison"),
        Object.values(MELEE_VARIANTS)
          .map(
            (profile) =>
              fillText(TEXT.comparison, {
                name: profile.name,
                slash: +effectiveWeaponDamage(g, "knife", profile.moves.light_right.damage).toFixed(1),
                heavy: +effectiveWeaponDamage(g, "knife", profile.moves.heavy_overhead.damage).toFixed(1),
                slashCost: profile.costs.slash,
                heavyCost: profile.costs.heavy,
              }),
          )
          .join(" / "),
      );
    const visible = available() && state.status === "pending" && g.world.areaId === data.areaId;
    if (visible && !source(data.itemId) && !loads.has(data.itemId) && !failed.has(data.itemId))
      prepare(data.itemId).catch(() => {});
    if (visible) {
      // The ring and label show from the drop position at once; the model joins them when its asset has loaded.
      const ready = !!source(data.itemId);
      if (drop && ready && !drop.model) clearDrop();
      drop ??= createDrop(data, ready);
      drop.root.position.copy(g.world.toRender(state.dropPosition));
    } else clearDrop();
    label.hidden = true;
  }
  function interaction() {
    const g = s.game;
    if (!g || !eligible(g)) return null;
    return {
      id: g.world.uniqueRewardData.itemId,
      label: fillText(GAME_DATA.weaponViewText.shared.pickupCollect, { name: CLEAVER }),
      pickup: true,
      position: g.uniqueReward.dropPosition,
      run() {
        interact();
        return true;
      },
    };
  }
  return {
    update,
    interact,
    interaction,
    equip: (id) => equipHandlers.get(id)?.(),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearDrop();
      for (const remove of listeners) remove();
      for (const button of buttons.values()) button.remove();
      buttons.clear();
      equipHandlers.clear();
      panel.hidden = true;
      label.hidden = true;
      el("pistol-interact").removeAttribute("data-unique-reward-action");
    },
  };
}
