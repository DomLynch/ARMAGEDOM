import { lockerStored } from "./locker-core.js";
import { bossExitGate } from "./area-bosses.js";
import { huntTarget, SALAMANDER_STEP } from "./route-guidance.js";
import { effectiveWeaponDamage } from "./progression-runtime.js";
import { expeditionEligible, selectedPistolProfile, contractEnabled } from "./expedition-core.js";
import { PISTOL_ITEM_ID } from "../core/pistol-operation.js";
import { createHeadLabelPositioner } from "./boss-label.js";
import { createVestBagView } from "../vest-view.js";
import { areaDisplayName as areaName } from "../area-registry.js";
export function selectedAtlasRoute(registry, from, to) {
  const route = [];
  if (!to || from === to) return route;
  const seen = new Set([from]);
  while (from !== to) {
    const link = registry.nextExit(from, to);
    if (!link || seen.has(link.to)) return [];
    route.push(link);
    from = link.to;
    seen.add(from);
  }
  return route;
}
const paint = (element, value) => {
  if (element.textContent !== value) element.textContent = value;
};
// Long schematic links use the gaps between cards, so crossing an unrelated
// area never looks like a connection to it. Endpoints remain the real graph.
export function atlasConnectionPoints(a, b) {
  const start = { x: a.column * 100 + 50, y: a.row * 100 + 50 },
    end = { x: b.column * 100 + 50, y: b.row * 100 + 50 };
  if (a.row === b.row && Math.abs(a.column - b.column) > 1) {
    const y = a.row === 0 ? 0 : a.row === 2 ? 300 : 100;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (a.column === b.column && Math.abs(a.row - b.row) > 1) {
    const x = a.column === 0 ? -3 : a.column === 2 ? 303 : 100,
      near = start.y < end.y ? 100 : 200,
      far = start.y < end.y ? 200 : 100;
    return [start, { x: start.x, y: near }, { x, y: near }, { x, y: far }, { x: end.x, y: far }, end];
  }
  return [start, end];
}
const stageAction = { available: "accept", accepted: "recover", recovered: "claim" };
const nearbyAction = (g, data) =>
  g.expedition?.status === "available" && expeditionEligible(g, "recover", data)
    ? "recover"
    : stageAction[g.expedition?.status];
const labels = { accept: "Accept contract", recover: "Recover supply case", claim: "Complete contract & claim reward" };
export function journalPresentation(g, data, allowed = true) {
  const status = g.expedition?.status,
    action = stageAction[status],
    eligible = !!(action && allowed && expeditionEligible(g, action, data)),
    gate = bossExitGate(g);
  if (!contractEnabled(data))
    return { eligible: false, showAction: false, next: gate && !gate.allowed ? gate.message : "" };
  const next =
    {
      available: "Optional · accept at the Westminster stash, or recover the case in East.",
      accepted: "Next: recover the supply case in East. Fighting Hale is optional.",
      recovered: eligible
        ? "At the Westminster stash · claim your reward."
        : "Case recovered · return to the Westminster stash.",
      claimed: "Reward claimed once · choose your earned weapon in Gear.",
    }[status] ?? "";
  return {
    eligible,
    showAction: status === "claimed" || eligible,
    next: gate && !gate.allowed ? `${gate.message}\n${next}` : next,
  };
}
export function progressionObjective(g) {
  if (g.world.areaId !== "westminster") return { target: null, objective: "" };
  const gate = bossExitGate(g, "east");
  // While the route arrow sends the player after the salamander, its line is the only one: the standing
  // "Kill the Ember Matron" objective comes back when the arrow moves on to her.
  return gate && !gate.allowed
    ? { target: "westminster", objective: huntTarget(g)?.label === SALAMANDER_STEP ? "" : gate.message }
    : { target: "east", objective: "Reach East." };
}
// The stolen supply case is a prop in East only while the contract is on.
export const supplyCaseShown = (data, areaId, status) =>
  contractEnabled(data) && areaId === data.contract.case.areaId && ["available", "accepted"].includes(status);
export function expeditionObjective(g) {
  if (g.world.safehouseData) return progressionObjective(g).target;
  const c = g.world.expeditionData?.contract,
    s = g.expedition?.status;
  return !c || !contractEnabled(g.world.expeditionData)
    ? null
    : s === "accepted"
      ? c.case.areaId
      : s === "claimed"
        ? null
        : c.giver.areaId;
}
// The existing menu, scene and interaction button remain owners. No second input/clock loop.
export function createExpeditionView(s, dispatch) {
  const el = (id) => document.getElementById(id),
    panel = el("expedition-panel");
  if (!panel)
    return {
      update() {},
      interact() {
        return false;
      },
      dispose() {},
    };
  const listeners = [],
    nodes = new Map(),
    choices = new Map(),
    materialColors = new WeakMap(),
    positionHead = createHeadLabelPositioner();
  let catalogue = null,
    caseView = null,
    pin = null,
    currentAction = null,
    disposed = false;
  const listen = (target, handler) => {
    target.addEventListener("click", handler);
    listeners.push(() => target.removeEventListener("click", handler));
  };
  const allowed = () => s.loaded && !s.contextLost && !s.traveling;
  function execute(command) {
    const g = s.game;
    if (!g) return;
    const result = dispatch(g, command, allowed());
    if (result.ok) {
      g.events.push(...result.events);
    }
    update();
    return result;
  }
  function viewGear() {
    el("equipment-panel").open = true;
    if (s.hud.showMenuPage) s.hud.showMenuPage("gear");
    else if (!el("menu").open) s.hud.toggleMenu();
  }
  function build(data) {
    catalogue = data;
    panel.hidden = false;
    el("contract-title").textContent = data.contract.title;
    const base = data.variants[PISTOL_ITEM_ID],
      reward = data.variants[data.contract.rewardVariantId];
    el("contract-description").textContent = s.world.reaperData
      ? `${data.contract.summary} Reward: ${s.world.reaperData.name}, an autonomous companion alongside your held weapon.`
      : `${data.contract.summary} Reward: ${reward.name}, ${reward.damage} base damage (+${Math.round((reward.damage / base.damage - 1) * 100)}%; starting pistol ${base.damage}); reload ${reward.reload.toFixed(1)}s (starting pistol ${base.reload.toFixed(1)}s).`;
    if (el("contract-reward"))
      el("contract-reward").textContent = s.world.reaperData
        ? `Reward: ${s.world.reaperData.name} · autonomous companion`
        : `Reward: ${reward.name} · +${Math.round((reward.damage / base.damage - 1) * 100)}% base damage · ${reward.reload.toFixed(1)}s reload.`;
    for (const [id, row] of Object.entries(data.variants)) {
      if (s.world.reaperData && id === data.contract.rewardVariantId) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.id = "variant-" + id;
      choices.set(id, button);
      el("variant-choices").append(button);
      listen(button, () => execute({ type: "selectVariant", variantId: id }));
    }
    const registry = s.world.registry,
      drawn = new Set();
    for (const from of registry.ids)
      for (const link of registry.links(from)) {
        const key = [from, link.to].sort().join(":");
        if (drawn.has(key)) continue;
        drawn.add(key);
        const points = atlasConnectionPoints(data.atlas[from], data.atlas[link.to]),
          line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("d", points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" "));
        line.setAttribute("data-from", from);
        line.setAttribute("data-to", link.to);
        line.style.display = "none";
        el("atlas-links").append(line);
      }
    el("atlas-map").setAttribute(
      "aria-label",
      `${registry.ids.length} areas. Select a destination to show only its route. Tile positions are schematic.`,
    );
    for (const id of registry.ids) {
      const button = document.createElement("button"),
        at = data.atlas[id];
      button.type = "button";
      button.id = "atlas-pin-" + id;
      button.style.gridColumn = String(at.column + 1);
      button.style.gridRow = String(at.row + 1);
      el("atlas-nodes").append(button);
      nodes.set(id, button);
      listen(button, () => {
        if (button.disabled) return;
        pin = pin === id ? null : id;
        update();
      });
    }
    listen(el("atlas-objective"), () => {
      const target = expeditionObjective(s.game);
      if (target) {
        pin = target;
        update();
      }
    });
    listen(el("contract-action"), () => {
      const g = s.game;
      if (g?.expedition?.status === "claimed") {
        viewGear();
        return;
      }
      const action = stageAction[g?.expedition?.status];
      if (action) execute({ type: "expedition", action });
    });
  }
  function label(element, position, height, text) {
    const p = s.world.toRender(position, height).project(s.camera),
      visible = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z >= -1 && p.z <= 1;
    element.hidden = !visible;
    if (!visible) return;
    element.textContent = text;
    const portrait = innerWidth < innerHeight;
    element.style.left = `${Math.max(95, Math.min(innerWidth - 95, ((p.x + 1) * innerWidth) / 2))}px`;
    element.style.top = `${Math.max(portrait ? 185 : 150, Math.min(innerHeight - 110, ((1 - p.y) * innerHeight) / 2))}px`;
  }
  function interact() {
    const g = s.game;
    if (!g || !allowed() || s.paused) return false;
    const action = nearbyAction(g, catalogue);
    if (action && expeditionEligible(g, action, catalogue)) {
      execute({ type: "expedition", action });
      return true;
    }
    if (g.expedition?.status === "claimed" && expeditionEligible(g, "claim", catalogue)) {
      viewGear();
      return true;
    }
    return false;
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = s.world?.expeditionData;
    if (!g || !data) {
      panel.hidden = true;
      return;
    }
    if (!catalogue) build(data);
    el("retry").disabled = el("again").disabled = !!g.runSaveInvalid;
    el("retry").title = el("again").title = g.runSaveInvalid ? "Open the menu and choose Reset game." : "";
    const state = g.expedition;
    if (!state) {
      panel.hidden = true;
      return;
    }
    const progression = g.world.safehouseData ? progressionObjective(g) : null;
    const c = data.contract,
      status = state.status,
      objective = expeditionObjective(g),
      action = stageAction[status],
      eligible = action && allowed() && expeditionEligible(g, action, data),
      fieldAction = nearbyAction(g, data),
      fieldEligible = fieldAction && allowed() && expeditionEligible(g, fieldAction, data);
    const journal = journalPresentation(g, data, allowed());
    paint(el("contract-status"), journal.next);
    el("contract-action").hidden = !journal.showAction;
    paint(el("contract-action"), status === "claimed" ? "View Gear" : labels[action]);
    el("contract-action").disabled = status !== "claimed" && !eligible;
    const known = new Set([...(state.visitedIds ?? []), g.world.areaId, ...(objective ? [objective] : [])]);
    if (pin && !known.has(pin)) pin = null;
    for (const [id, button] of nodes) {
      const visible = known.has(id),
        current = id === g.world.areaId,
        visited = state.visitedIds.includes(id),
        target = id === objective;
      button.disabled = !visible;
      button.dataset.current = String(current);
      button.setAttribute("aria-pressed", String(pin === id));
      paint(
        button,
        visible
          ? `${current ? "● " : ""}${areaName(id)}${visited ? " ✓" : ""}${target ? " ⚑" : ""}${pin === id ? " · PIN" : ""}`
          : "? Undiscovered",
      );
      button.setAttribute(
        "aria-label",
        visible
          ? `${areaName(id)}${current ? ", current area" : ""}${visited ? ", visited" : ""}${target ? ", objective" : ""}${pin === id ? ", pinned" : ""}`
          : "Undiscovered area",
      );
    }
    const selectedRoute = selectedAtlasRoute(g.world.registry, g.world.areaId, pin),
      routePairs = new Set(selectedRoute.map((link) => [link.from, link.to].sort().join(":")));
    for (const line of el("atlas-links").children) {
      const selected = routePairs.has([line.dataset.from, line.dataset.to].sort().join(":"));
      line.style.display = selected ? "" : "none";
      line.setAttribute("aria-hidden", String(!selected));
    }
    const next = selectedRoute[0] ?? null,
      gate = next ? bossExitGate(g, next.to) : null,
      route = pin
        ? next
          ? `Pinned ${areaName(pin)} · next exit: ${areaName(next.to)}${gate && !gate.allowed ? " · " + gate.message : ""}`
          : `Pinned ${areaName(pin)} · you are here.`
        : "Choose a known destination to show its route. Tile positions are schematic. ● Current · ✓ Visited · ⚑ Objective";
    paint(el("atlas-route"), route);
    el("atlas-objective").disabled = !objective;
    const profile = selectedPistolProfile(g),
      name = g.world.reaperData
        ? data.variants[PISTOL_ITEM_ID].name
        : (data.variants[state.selectedPistolVariant]?.name ?? data.variants[PISTOL_ITEM_ID].name);
    paint(
      el("equipment-state"),
      `${g.flame?.equipped ? "Stored pistol" : g.pistol.equipped ? "Equipped pistol" : "Holstered pistol"}: ${name} · damage ${+effectiveWeaponDamage(g, PISTOL_ITEM_ID, profile.damage).toFixed(1)} · reload ${profile.reload.toFixed(1)}s · ${g.pistol.magazine}/6 loaded, ${g.pistol.reserve} reserve.${g.pistol.collected ? "" : " Collect the pistol at the stash to use your retained variant."}`,
    );
    for (const [id, button] of choices) {
      const row = data.variants[id],
        owned = id === PISTOL_ITEM_ID || status === "claimed";
      button.disabled =
        lockerStored(g, id) || !owned || !g.pistol.collected || !allowed() || g.finished || g.player.hp <= 0;
      button.setAttribute(
        "aria-pressed",
        String(
          (g.world.reaperData ? id === PISTOL_ITEM_ID : state.selectedPistolVariant === id) &&
            g.pistol.equipped &&
            !g.flame?.equipped,
        ),
      );
      paint(
        button,
        lockerStored(g, id)
          ? `Stored · ${row.name}`
          : `${(g.world.reaperData ? id === PISTOL_ITEM_ID : state.selectedPistolVariant === id) && g.pistol.equipped && !g.flame?.equipped ? "Equipped" : owned ? "Equip" : "Locked"} · ${row.name}`,
      );
    }
    if (el("pistol-comparison"))
      paint(
        el("pistol-comparison"),
        Object.entries(data.variants)
          .filter(([id]) => !g.world.reaperData || id === PISTOL_ITEM_ID)
          .map(
            ([, row]) =>
              `${row.name}: ${+effectiveWeaponDamage(g, PISTOL_ITEM_ID, row.damage).toFixed(1)} damage · ${row.reload.toFixed(1)}s reload`,
          )
          .join(" / "),
      );
    const objectiveLine = el("expedition-objective");
    objectiveLine.hidden = !allowed() || g.player.hp <= 0;
    // Only the Westminster tutorial objective is shown; the contract lines (and the pinned route) are not.
    paint(objectiveLine, progression?.objective ?? "");
    const caseVisible = allowed() && supplyCaseShown(data, g.world.areaId, status);
    if (caseVisible && !caseView) {
      caseView = createVestBagView();
      caseView.root.name = "Stolen supply case";
      caseView.root.scale.setScalar(1.35);
      s.scene.add(caseView.root);
    }
    if (caseView) {
      caseView.root.visible = caseVisible;
      caseView.root.position.copy(g.world.toRender(c.case.position));
    }
    const caseLabel = el("expedition-case-label");
    caseLabel.hidden = true;
    const guardLabel = el("expedition-guard-label"),
      guard = g.enemies.find((e) => e.placementKey === c.guard.placementKey && e.hp > 0);
    guardLabel.hidden = true;
    if (
      allowed() &&
      g.world.areaId === c.guard.areaId &&
      guard &&
      Math.hypot(guard.pos.x - g.player.pos.x, guard.pos.z - g.player.pos.z) < 10
    ) {
      guardLabel.hidden = false;
      paint(guardLabel, c.guard.name);
      const position = positionHead(s.actors?.views.get(guard.id), guardLabel.getBoundingClientRect(), s.camera, {
        width: innerWidth,
        height: innerHeight,
      });
      guardLabel.hidden = !position;
      if (position) {
        guardLabel.style.left = `${position.left}px`;
        guardLabel.style.top = `${position.top}px`;
      }
    }
    const playerView = s.actors?.views.get(0),
      variant = state.selectedPistolVariant;
    if (playerView?.pistolMount) {
      const tint = data.variants[variant].tint;
      playerView.pistolMount.traverse((mesh) => {
        for (const material of [mesh.material].flat().filter(Boolean)) {
          if (!material.color) continue;
          if (!materialColors.has(material))
            materialColors.set(material, {
              base: material.color.clone(),
              color: material.color.clone(),
              variant: null,
            });
          const saved = materialColors.get(material);
          if (saved.variant !== variant) {
            saved.color.copy(saved.base).multiply(material.color.clone().setHex(tint));
            saved.variant = variant;
          }
          material.color.copy(saved.color);
        }
      });
      playerView.expeditionVariant = variant;
    }
  }
  function interaction() {
    const g = s.game;
    if (!g || !catalogue || !allowed() || s.paused || g.finished || g.player.hp <= 0) return null;
    const action = nearbyAction(g, catalogue),
      claimed = g.expedition?.status === "claimed";
    if ((!action && !claimed) || !expeditionEligible(g, claimed ? "claim" : action, catalogue)) return null;
    return {
      id: "expedition-" + (claimed ? "gear" : action),
      label: claimed ? "View earned gear" : labels[action],
      position: action === "recover" ? catalogue.contract.case.position : catalogue.contract.giver.position,
      run: interact,
    };
  }
  return {
    update,
    interact,
    interaction,
    selectVariant: (id) => execute({ type: "selectVariant", variantId: id }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of listeners) remove();
      caseView?.dispose();
      caseView = null;
      el("retry").disabled = el("again").disabled = false;
      el("expedition-case-label").hidden =
        el("expedition-guard-label").hidden =
        el("expedition-objective").hidden =
          true;
      panel.hidden = true;
    },
  };
}
