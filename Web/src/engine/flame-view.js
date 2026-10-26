import { lockerStored } from "./locker-core.js";
import * as T from "three";
import { setFlameEquipped, stopFlame, flameCanAct } from "./flame-runtime.js";
import { addPickupGlow } from "../pickup-glow.js";
import { markDrop } from "./drop-marker.js";
import { autoEquipAfterClaim, collectedMessage } from "../auto-equip.js";
import { WEAPON_VIEWS } from "./weapon-view-data.js";
import { GAME_DATA, fillText } from "./game-data.js";
const FLAME = WEAPON_VIEWS.flame;
const TEXT = GAME_DATA.weaponViewText.flame;
const paint = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};
export function createFlamePickupView(source) {
  const root = new T.Group(),
    contours = [];
  root.name = "Flamethrower world pickup"; // text-ok: three.js group name, never shown
  let ring = null;
  if (source?.scene) {
    const display = source.scene.clone(true);
    root.add(display);
    root.updateMatrixWorld(true);
    let box = new T.Box3().setFromObject(display),
      size = box.getSize(new T.Vector3());
    display.scale.setScalar(Math.min(1, FLAME.pickup.fitSize / Math.hypot(size.x, size.z)));
    root.updateMatrixWorld(true);
    box = new T.Box3().setFromObject(display);
    const center = box.getCenter(new T.Vector3());
    display.position.set(-center.x, FLAME.pickup.lift - box.min.y, -center.z);
    const meshes = [];
    display.traverse((mesh) => {
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) contours.push(addPickupGlow(mesh));
  } else {
    ring = new T.Mesh(
      new T.TorusGeometry(FLAME.ring.radius, FLAME.ring.tube, FLAME.ring.radialSegments, FLAME.ring.tubularSegments),
      new T.MeshBasicMaterial({ color: `#${FLAME.ring.colour}`, depthTest: true }),
    );
    ring.rotation.x = -Math.PI / 2; // tuning-ok: quarter turn lays the ring flat on the ground
    ring.position.y = FLAME.ring.lift;
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
      g.message = TEXT.outOfFuel;
      g.messageUntil = g.time + FLAME.messageSeconds;
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
          g.message = TEXT.loadFailed;
          g.messageUntil = g.time + FLAME.messageSeconds;
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
      g.message = TEXT.ready;
      g.messageUntil = g.time + FLAME.messageSeconds;
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
      g.message = collectedMessage(TEXT.name);
      g.messageUntil = g.time + FLAME.messageSeconds;
      void autoEquipAfterClaim(g, {
        equip,
        active: () => !!g.flame?.equipped,
        itemId: g.world.flameData.pickupId,
        name: TEXT.name,
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
    const benefit = fillText(TEXT.benefit, {
      damage: data.contact.damage,
      interval: data.contact.interval,
      range: data.contact.range,
    });
    paint(
      status,
      !owned
        ? fillText(TEXT.stateLocked, { benefit })
        : fuel <= 0
          ? TEXT.stateEmpty
          : fillText(TEXT.stateOwned, {
              status: equipped ? TEXT.statusEquipped : TEXT.statusStored,
              benefit,
              fuel,
              seconds: (g.flameFuel.fuelUnits / data.unitsPerSecond).toFixed(1),
            }),
    );
    button.disabled = lockerStored(g, "flamethrower-area8-v1") || !owned || fuel <= 0 || !safe(g) || !!load;
    paint(
      button,
      lockerStored(g, "flamethrower-area8-v1")
        ? TEXT.buttonStored
        : load
          ? TEXT.buttonLoading
          : equipped
            ? TEXT.buttonLower
            : failed
              ? TEXT.buttonRetry
              : fuel <= 0 && owned
                ? TEXT.buttonEmpty
                : TEXT.buttonEquip,
    );
    button.setAttribute("aria-pressed", String(equipped));
    const visible = data.groundPickupEnabled === true && available() && !owned && g.world.areaId === data.areaId;
    if (visible) {
      const ready = s.actors.flameReady();
      if (!drop || ready !== dropReady) {
        clearDrop();
        drop = markDrop(createFlamePickupView(s.actors.flameAsset()), TEXT.name);
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
      label: TEXT.collectLabel,
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
