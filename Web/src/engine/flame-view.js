import { lockerStored } from "./locker-core.js";
import * as T from "three";
import { setFlameEquipped, stopFlame, flameCanAct } from "./flame-runtime.js";
import { addPickupGlow } from "../pickup-glow.js";
import { markDrop } from "./drop-marker.js";
import { autoEquipAfterClaim, collectedMessage } from "../auto-equip.js";
const paint = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
export function createFlamePickupView(source) {
  const root = new T.Group(),
    contours = [];
  root.name = "Flamethrower world pickup";
  let ring = null;
  if (source?.scene) {
    const display = source.scene.clone(true);
    root.add(display);
    root.updateMatrixWorld(true);
    let box = new T.Box3().setFromObject(display),
      size = box.getSize(new T.Vector3());
    display.scale.setScalar(Math.min(1, 0.72 / Math.hypot(size.x, size.z)));
    root.updateMatrixWorld(true);
    box = new T.Box3().setFromObject(display);
    const center = box.getCenter(new T.Vector3());
    display.position.set(-center.x, 0.025 - box.min.y, -center.z);
    const meshes = [];
    display.traverse((mesh) => {
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) contours.push(addPickupGlow(mesh));
  } else {
    ring = new T.Mesh(
      new T.TorusGeometry(0.35, 0.025, 4, 20),
      new T.MeshBasicMaterial({ color: 0xffbd62, depthTest: true }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    root.add(ring);
  }
  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const c of contours) c.dispose();
      if (ring) {
        ring.geometry.dispose();
        ring.material.dispose();
      }
    },
  };
}
export function createFlameView(s, persistence) {
  const el = (id) => document.getElementById(id),
    panel = el("flame-equipment"),
    button = el("flame-equip"),
    status = el("flame-state"),
    label = el("flame-pickup-label"),
    field = el("pistol-interact");
  if (!panel || !button || !status || !label || !field)
    return {
      update() {},
      interact() {
        return false;
      },
      dispose() {},
    };
  let disposed = false,
    load = null,
    failed = false,
    drop = null,
    dropReady = null;
  const available = () => s.loaded && !s.contextLost && !s.traveling;
  const safe = (g) => available() && flameCanAct(g);
  const nearby = (g) =>
    g.world.flameData?.groundPickupEnabled === true &&
    safe(g) &&
    !s.paused &&
    !g.flameFuel?.collected &&
    g.world.areaId === g.world.flameData?.areaId &&
    Math.hypot(g.player.pos.x - g.world.flameData.position.x, g.player.pos.z - g.world.flameData.position.z) <=
      g.world.flameData.pickupRadius &&
    g.world.lineClear(g.player.pos, g.world.flameData.position);
  function clearDrop() {
    drop?.dispose();
    drop = null;
    dropReady = null;
  }
  function repaint() {
    if (s.game) s.hud?.update(s.game);
    if (s.updateExpedition) s.updateExpedition();
    else update();
  }
  function lower(g) {
    if (g.bossEquipment?.emberProjector?.selected) {
      const result = persistence.dispatchBossEquipment(
        g,
        { type: "equip", itemId: g.world.bossEquipmentData.emberProjector.itemId, equipped: false },
        true,
      );
      if (!result.ok) return;
    } else stopFlame(g, { unequip: true });
    s.input?.clear({ keepMovement: true });
    s.effects?.clearFlameFeedback?.();
    repaint();
  }
  async function equip(options) {
    if (lockerStored(s.game, "flamethrower-area8-v1")) return;
    const g = s.game;
    if (!g?.world.flameData || !safe(g) || load) return;
    if (g.flame.equipped && !g.bossEquipment?.emberProjector?.selected) {
      // Equip is a toggle: pressed again it lowers. An automatic switch (raise-only) never lowers.
      if (options?.raiseOnly !== true) lower(g);
      return;
    }
    if (!g.flameFuel?.collected) return;
    if (g.flameFuel.fuelUnits <= 0) {
      g.message = "Flamethrower is out of fuel.";
      g.messageUntil = g.time + 4;
      return;
    }
    const before = {
      weapon: g.player.weapon,
      variant: g.uniqueReward?.selectedMeleeVariant,
      pistol: g.pistol?.equipped,
    };
    failed = false;
    if (!s.actors.flameReady()) {
      load = s.actors.ensureFlame();
      repaint();
      try {
        await load;
      } catch {
        if (!disposed && s.game === g) {
          failed = true;
          g.message = "Could not load flamethrower. Try Equip again.";
          g.messageUntil = g.time + 4;
        }
        return;
      } finally {
        load = null;
        if (!disposed) repaint();
      }
    }
    if (
      disposed ||
      s.game !== g ||
      !safe(g) ||
      g.player.weapon !== before.weapon ||
      g.uniqueReward?.selectedMeleeVariant !== before.variant ||
      g.pistol?.equipped !== before.pistol
    )
      return;
    // Commit the previous boss selection through its owner before the base Flame overlay.
    // Keep the prior selection while its replacement asset is still loading.
    const previousBoss = Object.keys(g.bossEquipment ?? {}).find((field) => g.bossEquipment[field].selected);
    if (previousBoss) {
      const result = persistence.dispatchBossEquipment(
        g,
        { type: "equip", itemId: g.world.bossEquipmentData[previousBoss].itemId, equipped: false },
        true,
      );
      if (!result.ok) return;
    }
    if (!persistence.persistRun(g)) return;
    if (setFlameEquipped(g, true)) {
      s.input?.clear({ keepMovement: true });
      g.message = "Ember Projector ready · hold Flame to fire.";
      g.messageUntil = g.time + 4;
      repaint();
    }
  }
  function interact() {
    const g = s.game;
    if (!g?.world.flameData || !available() || s.paused) return false;
    if (g.flame?.equipped) {
      lower(g);
      return true;
    }
    if (!nearby(g)) return false;
    const result = persistence.dispatchFlame(
      g,
      { type: "claimPickup", pickupId: g.world.flameData.pickupId },
      null,
      true,
    );
    if (result.ok) {
      g.events.push(...result.events);
      g.message = collectedMessage("Flamethrower");
      g.messageUntil = g.time + 4;
      void autoEquipAfterClaim(g, {
        equip,
        active: () => !!g.flame?.equipped,
        itemId: g.world.flameData.pickupId,
        name: "Flamethrower",
      }).then(repaint);
    }
    repaint();
    return true;
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = g?.world.flameData;
    if (!data) {
      panel.hidden = true;
      label.hidden = true;
      clearDrop();
      return;
    }
    panel.hidden = true;
    const owned = !!g.flameFuel?.collected,
      fuel = Math.ceil(((g.flameFuel?.fuelUnits ?? 0) / data.capacity) * 100),
      equipped = !!g.flame?.equipped && !g.bossEquipment?.emberProjector?.selected;
    const benefit = `${data.contact.damage} damage per ${data.contact.interval}s contact · ${data.contact.range}m range`;
    paint(
      status,
      !owned
        ? `Defeat the Ember Matron to earn the Ember Projector. ${benefit}.`
        : fuel <= 0
          ? "Fuel exhausted. Your normal weapon remains available."
          : `${equipped ? "Equipped" : "Stored"} · ${benefit} · fuel ${fuel}% (${(g.flameFuel.fuelUnits / data.unitsPerSecond).toFixed(1)}s left). Spent fuel stays spent after Retry.`,
    );
    button.disabled = lockerStored(g, "flamethrower-area8-v1") || !owned || fuel <= 0 || !safe(g) || !!load;
    paint(
      button,
      lockerStored(g, "flamethrower-area8-v1")
        ? "Stored in safehouse"
        : load
          ? "Loading flamethrower…"
          : equipped
            ? "Return to normal weapon"
            : failed
              ? "Retry loading & equip flamethrower"
              : fuel <= 0 && owned
                ? "Empty flamethrower"
                : "Equip Ember Projector",
    );
    button.setAttribute("aria-pressed", String(equipped));
    const visible = data.groundPickupEnabled === true && available() && !owned && g.world.areaId === data.areaId;
    if (visible) {
      const ready = s.actors.flameReady();
      if (!drop || ready !== dropReady) {
        clearDrop();
        drop = markDrop(createFlamePickupView(s.actors.flameAsset()), "Flamethrower");
        dropReady = ready;
        s.scene.add(drop.root);
      }
      drop.root.position.copy(g.world.toRender(data.position));
    } else clearDrop();
    label.hidden = true;
  }
  button.addEventListener?.("click", equip);
  function interaction() {
    const g = s.game;
    if (!g?.world.flameData || !nearby(g)) return null;
    return {
      id: g.world.flameData.pickupId,
      label: "Collect Flamethrower",
      pickup: true,
      position: g.world.flameData.position,
      run: interact,
    };
  }
  return {
    update,
    interact,
    interaction,
    equip,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearDrop();
      button.removeEventListener?.("click", equip);
      field.removeAttribute("data-flame-action");
      label.hidden = true;
      panel.hidden = true;
    },
  };
}
