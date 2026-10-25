import { lockerStored } from "./locker-core.js";
import * as T from "three";
import { addPickupGlow } from "../pickup-glow.js";
import { autoEquipAfterClaim } from "../auto-equip.js";
export function createRifleView(s, dispatch) {
  const el = (id) => document.getElementById(id),
    panel = el("rifle-equipment"),
    button = el("rifle-equip"),
    pickup = el("rifle-pickup"),
    label = el("rifle-state");
  if (!panel || !button || !pickup || !label) return { update() {}, dispose() {} };
  let pending = null,
    failed = false,
    disposed = false,
    drop = null;
  const safe = (g) =>
    s.loaded &&
    !s.contextLost &&
    !s.traveling &&
    !g.finished &&
    !g.runSaveInvalid &&
    g.player.hp > 0 &&
    !g.player.swing &&
    g.time >= (g.player.ready ?? 0) &&
    g.time >= g.player.hurtUntil &&
    g.time >= g.player.dodgeUntil;
  function clear() {
    if (!drop) return;
    drop.root.removeFromParent();
    for (const c of drop.contours) c.dispose();
    for (const m of drop.materials) m.dispose();
    drop = null;
  }
  function prepare() {
    if (s.actors?.rifleReady()) return Promise.resolve();
    if (pending) return pending;
    const owner = s.game;
    failed = false;
    pending = s.actors
      .ensureRifle()
      .then(() => {
        if (!disposed && s.game === owner) {
          owner.rifleAssetReady = true;
          s.updateExpedition?.();
        }
      })
      .catch((error) => {
        failed = true;
        if (s.game === owner) {
          owner.message = "Rifle loading unavailable. Selection and ammunition kept; retry in Gear.";
          owner.messageUntil = owner.time + 5;
        }
        throw error;
      })
      .finally(() => (pending = null));
    return pending;
  }
  function execute(command) {
    const g = s.game;
    if (!safe(g)) return;
    const result = dispatch(g, command, true);
    if (result.ok) {
      g.events.push(...result.events);
      g.message =
        command.type === "claimPickup"
          ? "Bridge Rifle collected. Equip it in Gear."
          : command.equipped
            ? "RIFLE EQUIPPED"
            : "Returned to melee.";
      g.messageUntil = g.time + 4;
      s.input.clear();
    }
    s.updateExpedition?.();
  }
  const equip = async () => {
    const owner = s.game;
    if (!safe(owner)) return;
    try {
      await prepare();
    } catch {
      // prepare already records a visible load error and preserves equipment/ammo.
      update();
      return;
    }
    if (!disposed && s.game === owner && safe(owner) && owner.rifle?.status === "owned")
      execute({
        type: "equip",
        itemId: owner.world.rifleData.itemId,
        equipped: !!owner.flame?.equipped || !owner.rifle.selected,
      });
    update();
  };
  const claim = () => {
    const g = s.game;
    if (s.paused || g.rifle?.status !== "pending") return;
    execute({ type: "claimPickup", pickupId: g.world.rifleData.itemId });
    if (g.rifle?.status === "owned")
      void autoEquipAfterClaim(g, { equip, active: () => !!g.rifle?.selected, itemId: g.world.rifleData.itemId });
  };
  button.addEventListener("click", equip);
  pickup.addEventListener("click", claim);
  function createDrop(source) {
    const root = new T.Group(),
      display = source.gltf.scene.getObjectByName(source.description.pose.root).clone(true),
      materials = [],
      contours = [],
      meshes = [];
    display.rotation.z = Math.PI / 2;
    root.add(display);
    display.traverse((n) => {
      if (n.isMesh) {
        n.material = [n.material].flat().map((m) => {
          const clone = m.clone();
          materials.push(clone);
          return clone;
        });
        if (n.material.length === 1) n.material = n.material[0];
        meshes.push(n);
      }
    });
    for (const mesh of meshes) contours.push(addPickupGlow(mesh));
    root.updateWorldMatrix(true, true);
    let box = new T.Box3().setFromObject(root),
      size = box.getSize(new T.Vector3());
    display.scale.setScalar(Math.min(1, 0.72 / Math.hypot(size.x, size.z)));
    root.updateWorldMatrix(true, true);
    box = new T.Box3().setFromObject(root);
    const center = box.getCenter(new T.Vector3());
    display.position.set(-center.x, 0.025 - box.min.y, -center.z);
    s.scene.add(root);
    return { root, materials, contours };
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = g?.world.rifleData,
      state = g?.rifle;
    panel.hidden = !data;
    pickup.hidden = true;
    if (!data) {
      clear();
      return;
    }
    const ready = s.actors?.rifleReady() === true;
    g.rifleAssetReady = ready;
    if ((state?.status === "pending" || state?.selected) && !ready && !pending && !failed) prepare().catch(() => {});
    const owned = state?.status === "owned";
    label.textContent = owned
      ? `${data.name} · ${data.rules.damage} damage · ${state.magazine}/${data.rules.capacity} loaded · ${state.reserve} reserve. Spent ammunition stays spent on Retry.`
      : state?.status === "pending"
        ? "Bridge Warden dropped a Rifle. Approach it and collect it."
        : state?.status === "legacy-dead"
          ? "Bridge Warden was already defeated. A new defeat after Retry can drop the Rifle."
          : "Defeat Bridge Warden to earn the Rifle.";
    button.hidden = !owned && !(state?.status === "pending" && failed);
    button.disabled = lockerStored(g, data.itemId) || !safe(g) || !!pending;
    button.textContent = lockerStored(g, data.itemId)
      ? "Stored in safehouse"
      : pending
        ? "Preparing rifle…"
        : failed
          ? "Retry rifle loading"
          : state?.selected && !g.flame?.equipped
            ? "Return to melee"
            : "Equip rifle";
    if (state?.status !== "pending" || g.world.areaId !== data.source.areaId || !ready) {
      clear();
      return;
    }
    drop ??= createDrop(s.actors.rifleAsset());
    drop.root.position.copy(s.world.toRender(state.dropPosition));
  }
  function interaction() {
    const g = s.game,
      data = g?.world.rifleData,
      state = g?.rifle;
    if (
      !data ||
      state?.status !== "pending" ||
      s.paused ||
      !safe(g) ||
      !s.actors?.rifleReady() ||
      g.world.areaId !== data.source.areaId ||
      Math.hypot(g.player.pos.x - state.dropPosition.x, g.player.pos.z - state.dropPosition.z) >
        data.rules.pickupRadius ||
      !g.world.lineClear(g.player.pos, state.dropPosition)
    )
      return null;
    return {
      id: data.itemId,
      label: "Collect " + data.name,
      position: state.dropPosition,
      run() {
        claim();
        return true;
      },
    };
  }
  return {
    update,
    interaction,
    equip,
    dispose() {
      disposed = true;
      clear();
      button.removeEventListener("click", equip);
      pickup.removeEventListener("click", claim);
    },
  };
}
