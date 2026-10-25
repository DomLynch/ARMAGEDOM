import { lockerStored } from "./engine/locker-core.js";
import { effectiveWeaponDamage } from "./engine/progression-runtime.js";
import * as T from "three";
import { cloneMeleeWeapon, MELEE_VARIANTS } from "./melee-equipment.js";
import { addPickupGlow } from "./pickup-glow.js";
import { autoEquipAfterClaim } from "./auto-equip.js";
const paint = (element, text) => {
  if (element.textContent !== text) element.textContent = text;
};
export function createMeleePickupView(source, data) {
  const clone = cloneMeleeWeapon(source, data.itemId),
    root = new T.Group(),
    display = new T.Group(),
    contours = [],
    meshes = [];
  root.name = "Unique reward · " + data.itemId;
  root.userData = { itemId: data.itemId, placementKey: data.placementKey };
  display.add(clone.root);
  root.add(display);
  root.updateWorldMatrix(true, true);
  let bounds = new T.Box3().setFromObject(display),
    size = bounds.getSize(new T.Vector3());
  display.scale.setScalar(Math.min(1, 0.72 / Math.hypot(size.x, size.z)));
  root.updateWorldMatrix(true, true);
  bounds = new T.Box3().setFromObject(display);
  const center = bounds.getCenter(new T.Vector3());
  display.position.set(-center.x, 0.025 - bounds.min.y, -center.z);
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
export function createUniqueRewardView(s, dispatch) {
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
          ? "Pitborn Cleaver collected. Equip it in Gear."
          : MELEE_VARIANTS[command.itemId].name + " equipped.";
      g.messageUntil = g.time + 4;
      if (command.type === "equip") s.input.clear();
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
            owner.message = loadOnly
              ? "Cleaver loading unavailable. Pending drop kept; retry in Gear."
              : "Weapon loading unavailable. Selection kept; tap Equip to retry.";
            owner.messageUntil = owner.time + 5;
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
      Math.hypot(g.player.pos.x - state.dropPosition.x, g.player.pos.z - state.dropPosition.z) <= 1.3 + 1e-8 &&
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
      });
    return claimed;
  }
  function createDrop(data) {
    const view = createMeleePickupView(source(data.itemId), data);
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
          ? "Pitborn Cleaver loading failed. Retry loading below, then collect it in East."
          : "Hale dropped the Pitborn Cleaver. Collect it in East."
        : state.status === "legacy-dead"
          ? "Hale was already defeated in this run. A new kill after Retry can earn his cleaver."
          : owned
            ? `${selected.name} ${g.flame?.equipped || g.player.weapon !== "knife" ? "stored for melee" : "equipped"}. Earned weapon retained across Retry.`
            : "Defeat Hale in East to earn his unique cleaver. Supply-case progress is separate.",
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
          ? `Stored · ${profile.name}`
          : `${loads.has(id) ? "Loading" : canLoad ? (retry ? "Retry loading" : "Load weapon") : equipped ? "Equipped" : canOwn ? "Equip" : "Locked"} · ${profile.name}`,
      );
    }
    if (el("melee-comparison"))
      paint(
        el("melee-comparison"),
        Object.values(MELEE_VARIANTS)
          .map(
            (profile) =>
              `${profile.name}: Slash ${+effectiveWeaponDamage(g, "knife", profile.moves.light_right.damage).toFixed(1)} / Heavy ${+effectiveWeaponDamage(g, "knife", profile.moves.heavy_overhead.damage).toFixed(1)} damage · stamina ${profile.costs.slash}/${profile.costs.heavy}`,
          )
          .join(" / "),
      );
    const visible = available() && state.status === "pending" && g.world.areaId === data.areaId;
    if (visible && !source(data.itemId) && !loads.has(data.itemId) && !failed.has(data.itemId))
      prepare(data.itemId).catch(() => {});
    if (visible && source(data.itemId)) {
      if (!drop) drop = createDrop(data);
      drop.root.position.copy(g.world.toRender(state.dropPosition));
    } else clearDrop();
    label.hidden = true;
  }
  function interaction() {
    const g = s.game;
    if (!g || !eligible(g)) return null;
    return {
      id: g.world.uniqueRewardData.itemId,
      label: "Collect Pitborn Cleaver",
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
