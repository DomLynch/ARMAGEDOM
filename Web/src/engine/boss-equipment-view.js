import { ownsEmberReward } from "./boss-equipment-data.js";
import { lockerStored } from "./locker-core.js";
import { createRocketView } from "./rocket-view.js";
import { createExplosionEffects } from "./explosion-effect.js";
import * as T from "three";
import { createPickupModel } from "./pickup-model-view.js";
import { BOSS_EQUIPMENT_VIEW as V } from "./boss-equipment-view-data.js";
import { createMarkerOnlyDrop, markDrop } from "./drop-marker.js";
import { autoEquipAfterClaim, collectedMessage } from "../auto-equip.js";
import { GAME_DATA, fillText } from "./game-data.js";
import { RANGED_WEAPON_CATALOG } from "./weapon-catalog.js";
const TEXT = GAME_DATA.weaponViewText.bossEquipment;
// The starting pistol, whose magazine the pistols-family stats line shares.
const PISTOL_ITEM_ID = "westminster-start-pistol-v1";
export function createBossEquipmentView(s, dispatch, legacyFlameEquip = null) {
  const panel = document.getElementById("boss-equipment");
  if (!panel) return { update() {}, dispose() {} };
  const explosions = createExplosionEffects(s),
    rockets = createRocketView(s, explosions),
    cards = new Map(),
    equipHandlers = new Map(),
    drops = new Map(),
    projectiles = new Map(),
    blasts = new Map(),
    loads = new Map(),
    failed = new Set(),
    listeners = [];
  let disposed = false,
    lastGame = null,
    lastArea = null;
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
  function prepare(field) {
    if (s.actors.equipmentReady(field)) return Promise.resolve();
    if (loads.has(field)) return loads.get(field);
    failed.delete(field);
    const owner = s.game,
      p = s.actors
        .ensureEquipment(field)
        .catch((error) => {
          failed.add(field);
          if (s.game === owner) {
            owner.message = TEXT.loadFailed;
            owner.messageUntil = owner.time + V.loadFailureSeconds;
          }
          throw error;
        })
        .finally(() => loads.delete(field));
    loads.set(field, p);
    return p;
  }
  function execute(field, command) {
    const g = s.game;
    if (!safe(g)) return;
    const result = dispatch(g, command, true);
    if (result.ok) {
      g.events.push(...result.events);
      g.message =
        command.type === "claimPickup"
          ? collectedMessage(g.world.bossEquipmentData[field].name)
          : command.equipped
            ? fillText(TEXT.equipped, { name: g.world.bossEquipmentData[field].name })
            : TEXT.returned;
      g.messageUntil = g.time + V.claimMessageSeconds;
      s.input.clear({ keepMovement: true });
    }
    s.updateExpedition?.();
    return result;
  }
  function createCard(field, data) {
    const section = document.createElement("section"),
      title = document.createElement("h4"),
      label = document.createElement("p"),
      button = document.createElement("button");
    title.textContent = data.name;
    button.type = "button";
    button.id = "boss-equip-" + field;
    section.append(title, label, button);
    panel.append(section);
    const equip = async (options) => {
      const owner = s.game,
        raiseOnly = options?.raiseOnly === true;
      if (!safe(owner)) return;
      if (
        !raiseOnly &&
        field === "emberProjector" &&
        typeof legacyFlameEquip === "function" &&
        (!ownsEmberReward(owner) || (owner.flame?.equipped && !owner.bossEquipment.emberProjector.selected))
      ) {
        await legacyFlameEquip();
        update();
        return;
      }
      try {
        await prepare(field);
      } catch {
        // prepare already records a visible load error and preserves equipment/ammo.
        update();
        return;
      }
      if (!disposed && s.game === owner && safe(owner) && owner.bossEquipment?.[field]?.status === "owned")
        execute(field, {
          type: "equip",
          itemId: data.itemId,
          equipped: raiseOnly || !owner.bossEquipment[field].selected,
        });
      update();
    };
    equipHandlers.set(field, equip);
    button.addEventListener("click", equip);
    listeners.push(() => {
      button.removeEventListener("click", equip);
      section.remove();
    });
    return { label, button };
  }
  // Every number comes from the weapon's own row in weapons.json (rules, payload) or combatRules.json.
  function stats(data, state, g) {
    const magazine = state?.magazine ?? 0,
      reserve = state?.reserve ?? 0;
    if (data.weaponKey === "railgun")
      return fillText(TEXT.railgunStats, {
        damage: data.rules.damage,
        jumps: data.arc.jumps,
        range: data.rules.range,
        charge: data.charge.seconds,
        cadence: data.rules.cadence,
        magazine,
        capacity: data.rules.capacity,
        reserve,
        reload: data.rules.reload,
      });
    if (data.family === "shotguns")
      return fillText(TEXT.shotgunStats, {
        pellets: data.payload.pelletCount,
        pelletDamage: data.payload.pelletDamage,
        range: data.payload.range,
        magazine,
        capacity: data.rules.capacity,
        reserve,
      });
    if (data.family === "launchers")
      return fillText(TEXT.launcherStats, {
        damage: data.payload.maxDamage,
        radius: data.payload.radius,
        magazine,
        capacity: data.rules.capacity,
        reserve,
        range: data.payload.maxRange,
        speed: data.payload.speed,
        reload: data.rules.reload,
      });
    if (data.family === "grenades")
      return fillText(TEXT.grenadeStats, {
        magazine,
        range: data.payload.maxRange,
        fuse: data.payload.fuseSeconds,
        radius: data.payload.radius,
        throwRanges: GAME_DATA.combatRules.bossWeapon.grenadeThrowRanges.join(TEXT.throwRangeSeparator),
      });
    if (data.family === "blades")
      return fillText(TEXT.sawStats, { damage: data.rules.damage, interval: data.rules.interval });
    if (data.family === "pistols")
      return fillText(TEXT.pistolStats, {
        magazine: g.pistol.magazine,
        capacity: RANGED_WEAPON_CATALOG[PISTOL_ITEM_ID].rules.capacity,
        reserve: g.pistol.reserve,
      });
    return fillText(TEXT.flameStats, {
      damage: data.rules.damage,
      interval: data.rules.interval,
      range: data.rules.range,
      fuel: Math.ceil(((g.flameFuel?.fuelUnits ?? 0) / data.rules.fuelCapacity) * 100),
    });
  }
  function clearWorld() {
    rockets.clear();
    explosions.clear();
    for (const view of drops.values()) view.dispose();
    drops.clear();
    for (const row of projectiles.values()) {
      row.view.dispose();
      row.warning.geometry.dispose();
      row.warning.material.dispose();
      row.warning.removeFromParent();
    }
    projectiles.clear();
    for (const row of blasts.values()) {
      row.mesh.removeFromParent();
      row.mesh.geometry.dispose();
      row.mesh.material.dispose();
    }
    blasts.clear();
  }
  function updateProjectiles(g) {
    const G = V.grenade,
      R = G.ring,
      B = G.blast;
    const active = (g.activeGrenades ?? []).filter((row) => row.intent.areaId === g.world.areaId),
      ids = new Set(active.map((row) => row.intent.id));
    for (const [id, row] of projectiles)
      if (!ids.has(id)) {
        row.view.dispose();
        if (g.events.some((event) => event.type === "grenade-blast" && event.id === id)) {
          row.warning.material.color.set(`#${B.colour}`);
          blasts.set(id, { mesh: row.warning, start: g.time });
          explosions.spawn(row.warning.position, R.outer, g.time);
        } else {
          row.warning.geometry.dispose();
          row.warning.material.dispose();
          row.warning.removeFromParent();
        }
        projectiles.delete(id);
      }
    for (const [id, row] of blasts) {
      const age = g.time - row.start;
      if (age > B.seconds) {
        row.mesh.removeFromParent();
        row.mesh.geometry.dispose();
        row.mesh.material.dispose();
        blasts.delete(id);
        continue;
      }
      row.mesh.scale.setScalar(B.startScale + (age / B.seconds) * B.growth);
      row.mesh.material.opacity = B.opacity * (1 - age / B.seconds);
    }
    for (const row of active) {
      let item = projectiles.get(row.intent.id);
      if (!item) {
        const source = s.actors.equipmentAsset("grenade");
        if (!source) continue;
        const view = createPickupModel(source.gltf, { rootName: "Grenade", ground: false }),
          warning = new T.Mesh(
            new T.RingGeometry(R.inner, R.outer, R.segments),
            new T.MeshBasicMaterial({
              color: `#${R.colour}`,
              transparent: true,
              opacity: R.opacity,
              depthWrite: false,
              side: T.DoubleSide,
            }),
          );
        warning.rotation.x = -Math.PI / 2; // tuning-ok: lays the ring flat on the ground
        s.scene.add(view.root, warning);
        const start = s.actors.equipmentOrigin?.("grenade") ?? s.world.toRender(row.origin, G.startHeight);
        item = { view, warning, start: start.clone() };
        projectiles.set(row.intent.id, item);
      }
      const born = row.intent.detonateAt - 1,
        t = Math.max(0, Math.min(1, (g.time - born) / G.flightSeconds)),
        end = s.world.toRender(row.intent.position, G.landHeight);
      if (row.mode === "sticky" && row.surfacePosition)
        item.view.root.position.set(row.surfacePosition.x, row.surfacePosition.y, row.surfacePosition.z);
      else {
        item.view.root.position.lerpVectors(item.start, end, t);
        item.view.root.position.y += Math.sin(Math.PI * t) * G.arcHeight;
      }
      item.view.root.rotation.z = t < 1 ? t * Math.PI * G.spinPi : 0;
      item.warning.position.copy(s.world.toRender(row.intent.position, R.height));
      item.warning.material.opacity =
        R.pulseBase + R.pulseSwing * Math.abs(Math.sin((g.time - born) * Math.PI * R.pulseRate));
    }
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = g?.world.bossEquipmentData;
    panel.hidden = !data;
    if (!data) {
      clearWorld();
      return;
    }
    if (g !== lastGame || g.world.areaId !== lastArea) {
      clearWorld();
      lastGame = g;
      lastArea = g.world.areaId;
    }
    g.bossEquipmentAssetReady ??= {};
    for (const [field, profile] of Object.entries(data)) {
      let card = cards.get(field);
      if (!card) {
        card = createCard(field, profile);
        cards.set(field, card);
      }
      const state = g.bossEquipment?.[field],
        ready = s.actors.equipmentReady(field);
      g.bossEquipmentAssetReady[field] = ready;
      if ((state?.status === "pending" || state?.selected) && !ready && !loads.has(field) && !failed.has(field))
        prepare(field).catch(() => {});
      const placement = g.world.bossData.placements.find((row) => row.key === profile.source.placementKey),
        boss = placement && g.world.bossData.profiles[placement.profileRef]?.name;
      const legacyAccess = field === "emberProjector" && !!g.flameFuel?.collected && !ownsEmberReward(g),
        owned = state?.status === "owned" || legacyAccess;
      card.label.textContent = legacyAccess
        ? stats(profile, state, g) +
          (state?.status === "pending" ? TEXT.legacyPending : TEXT.legacyUnclaimed)
        : state?.status === "owned"
          ? stats(profile, state, g)
          : state?.status === "pending"
            ? fillText(TEXT.statePending, { boss })
            : state?.status === "legacy-dead"
              ? fillText(TEXT.stateLegacyDead, { boss })
              : fillText(TEXT.stateLocked, { boss });
      card.button.hidden = !owned && !(state?.status === "pending" && failed.has(field));
      card.button.disabled =
        lockerStored(g, profile.itemId) ||
        !safe(g) ||
        loads.has(field) ||
        (legacyAccess && !!document.getElementById("flame-equip")?.disabled);
      card.button.textContent = lockerStored(g, profile.itemId)
        ? GAME_DATA.weaponViewText.shared.storedInSafehouse
        : loads.has(field)
          ? TEXT.buttonLoading
          : failed.has(field)
            ? TEXT.buttonRetry
            : (field === "emberProjector" ? g.flame?.equipped : state?.selected)
              ? TEXT.buttonLower
              : fillText(TEXT.buttonEquip, { name: profile.name });
      if (state?.status !== "pending" || g.world.areaId !== profile.source.areaId) {
        drops.get(field)?.dispose();
        drops.delete(field);
        continue;
      }
      // The ring and label show from the drop position at once; the model joins them when its asset has loaded.
      let drop = drops.get(field);
      if (drop && ready && !drop.model) {
        drop.dispose();
        drops.delete(field);
        drop = null;
      }
      if (!drop) {
        if (!ready && !s.scene) continue; // no scene to show the marker in yet
        if (ready) {
          const source = s.actors.equipmentAsset(field);
          drop = markDrop(
            createPickupModel(source.gltf, {
              rootName: source.description?.pose?.root ?? null,
              rotate: ["shotguns", "blades"].includes(profile.family),
            }),
            profile.name,
          );
          drop.model = true;
        } else drop = createMarkerOnlyDrop(profile.name);
        s.scene.add(drop.root);
        drops.set(field, drop);
      }
      drop.root.position.copy(s.world.toRender(state.dropPosition));
    }
    updateProjectiles(g);
    rockets.update(g);
    explosions.update(g.time);
  }
  function interaction() {
    const g = s.game;
    if (!g || s.paused || !safe(g)) return null;
    return Object.entries(g.world.bossEquipmentData ?? {})
      .map(([field, data]) => {
        const state = g.bossEquipment?.[field];
        if (
          state?.status !== "pending" ||
          g.world.areaId !== data.source.areaId ||
          !s.actors.equipmentReady(field) ||
          Math.hypot(g.player.pos.x - state.dropPosition.x, g.player.pos.z - state.dropPosition.z) >
            data.rules.pickupRadius ||
          !g.world.lineClear(g.player.pos, state.dropPosition)
        )
          return null;
        return {
          id: data.itemId,
          label: "Collect " + data.name,
          pickup: true,
          position: state.dropPosition,
          run() {
            execute(field, { type: "claimPickup", pickupId: data.itemId });
            if (g.bossEquipment?.[field]?.status === "owned")
              void autoEquipAfterClaim(g, {
                equip: (options) => equipHandlers.get(field)?.(options),
                active: () => !!g.bossEquipment?.[field]?.selected,
                itemId: data.itemId,
                name: data.name,
              });
            return true;
          },
        };
      })
      .filter(Boolean);
  }
  return {
    update,
    interaction,
    equip: (field) => equipHandlers.get(field)?.(),
    dispose() {
      disposed = true;
      clearWorld();
      explosions.dispose();
      for (const remove of listeners) remove();
      cards.clear();
      equipHandlers.clear();
    },
  };
}
