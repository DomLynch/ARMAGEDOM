import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  safehouseProp,
  safehouseInteraction,
  safehouseAnchor,
  safehouseSite,
} from "./safehouse.js";
import { lockerInventory, lockerStored } from "./locker-core.js";
import { huntTarget } from "./route-guidance.js";
import { LOCKER_WEAPON_IDS, LOCKER_RESOURCE_RULES } from "./locker-state.js";
import { SAFEHOUSE_VIEW } from "./safehouse-view-data.js";
import { GAME_DATA, fillText } from "./game-data.js";
const CUE = SAFEHOUSE_VIEW.cue,
  CONTOUR = SAFEHOUSE_VIEW.contour,
  TEXT = GAME_DATA.safehouseText.safehouse;
// A short wall-clock presentation pulse; gameplay and storage clocks are untouched.
export function safehouseCueOpacity(
  time,
  { period = CUE.period, phase = 0, near = false, selected = false, reduced = false } = {},
) {
  if (reduced) return CUE.reducedOpacity;
  const pulse = Math.pow(
      (1 + Math.sin(2 * Math.PI * (time / period - phase))) / 2, // tuning-ok: full turn, and the sine remapped from -1..1 to 0..1
      CUE.pulseExponent,
    ),
    floor = selected ? CUE.floor.selected : near ? CUE.floor.near : CUE.floor.idle;
  return floor + (1 - floor) * pulse;
}
// Native registered-image plane; world owns the backdrop, this view owns only its patch/cues.
// Existing weapon owners skip the opening tutorial only on first observation.
// Once a fresh run starts it, ordinary pickup cannot complete the tutorial; only reaching the Westminster steps (the layout's
// setPieceSlot, the end of its tutorialPath) does, within visual.json routeGuidance.tutorialArrived metres.
export function shelterTutorialPending(g, pending) {
  if (pending === undefined)
    pending = !g.pistol?.collected && !g.expedition?.visitedIds?.some((id) => id !== "westminster");
  const slot = g.world.layout?.setPieceSlot?.at,
    at = slot && g.world.geometry?.ground(slot),
    arrived =
      g.world.areaId === "westminster" &&
      !!at &&
      Math.hypot(g.player.pos.x - at.x, g.player.pos.z - at.z) <= GAME_DATA.visual.routeGuidance.tutorialArrived;
  return !!pending && !arrived;
}
export function createSafehouseView(s, dispatch) {
  let owner = null,
    meshes = [],
    texture = null,
    loading = false,
    failed = false,
    disposed = false,
    lastPanel = "",
    lastError = "",
    promptOwned = false;
  let target = null,
    lastHubPage = null;
  const tutorialRuns = new WeakMap();
  function ensureTarget() {
    if (target) return;
    target = document.createElement("button");
    target.type = "button";
    target.id = "safehouse-interact";
    target.setAttribute("aria-label", TEXT.interactAria);
    target.hidden = true;
    target.style.cssText =
      "position:fixed;z-index:5;min-width:0;min-height:0;padding:0;border:0;border-radius:0;background:transparent;touch-action:none";
    target.addEventListener("click", interact);
    document.body.append(target);
  }
  function positionTarget(w, data, enabled) {
    target.hidden = !enabled;
    if (!enabled) return;
    const rect = s.canvas.getBoundingClientRect(),
      points = data.props
        .flatMap((prop) => {
          const b = prop.bounds;
          return [
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x, b.y + b.height],
            [b.x + b.width, b.y + b.height],
          ].map(([x, y]) => planePoint(w, x, y).project(s.camera));
        })
        .filter((p) => p.z >= -1 && p.z <= 1);
    if (!points.length) {
      target.hidden = true;
      return;
    }
    const xs = points.map((p) => rect.left + ((p.x + 1) * rect.width) / 2), // tuning-ok: NDC -1..1 to pixels is half the canvas width
      ys = points.map((p) => rect.top + ((1 - p.y) * rect.height) / 2), // tuning-ok: NDC -1..1 to pixels is half the canvas height
      left = Math.max(rect.left, Math.min(...xs)),
      top = Math.max(rect.top, Math.min(...ys)),
      right = Math.min(rect.right, Math.max(...xs)),
      bottom = Math.min(rect.bottom, Math.max(...ys));
    target.hidden = right <= left || bottom <= top;
    target.style.left = left + "px";
    target.style.top = top + "px";
    target.style.width = Math.max(0, right - left) + "px";
    target.style.height = Math.max(0, bottom - top) + "px";
  }

  const panel = document.getElementById("locker-items"),
    status = document.getElementById("locker-status");
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  function clear() {
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    meshes = [];
    owner = null;
  }
  function planePoint(w, x, y) {
    const a = w.backdrop.geometry.attributes.position,
      T = w.THREE,
      tl = new T.Vector3().fromBufferAttribute(a, 3), // tuning-ok: vertex index of the backdrop plane's top-left corner
      tr = new T.Vector3().fromBufferAttribute(a, 2), // tuning-ok: vertex index of the backdrop plane's top-right corner
      bl = new T.Vector3().fromBufferAttribute(a, 0);
    return tl.clone().addScaledVector(tr.sub(tl), x).addScaledVector(bl.sub(tl), y);
  }
  function build(w, data) {
    clear();
    owner = w.group;
    const T = w.THREE,
      p = data.patch;
    const coords = [
        [p.x, p.y + p.height],
        [p.x + p.width, p.y + p.height],
        [p.x + p.width, p.y],
        [p.x, p.y],
      ],
      geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        coords.flatMap(([x, y]) => planePoint(w, x, y).toArray()),
        3, // tuning-ok: x, y, z per vertex
      ),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); // tuning-ok: u, v per vertex
    geometry.setIndex([0, 1, 2, 0, 2, 3]); // tuning-ok: vertex indices of the quad's two triangles
    const material = new T.MeshBasicMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
    material.color.setRGB(w.layout.exposure, w.layout.exposure, w.layout.exposure);
    const patch = new T.Mesh(geometry, material);
    patch.name = "Westminster safehouse approved art"; // text-ok: three.js mesh name, never shown to the player
    patch.renderOrder = SAFEHOUSE_VIEW.patchRenderOrder;
    patch.frustumCulled = false;
    owner.add(patch);
    meshes.push(patch);
    // Each outline follows its own painted prop, never the patch rectangle.
    const silhouettes = SAFEHOUSE_VIEW.silhouettes;
    for (const prop of data.props) {
      const b = prop.bounds,
        paths = prop.outlines ?? [
          { closed: true, points: silhouettes[prop.id].map(([x, y]) => [b.x + x * b.width, b.y + y * b.height]) },
        ],
        segments = [];
      for (const path of paths) {
        const points = path.points.map(([x, y]) => planePoint(w, x, y));
        for (let i = 0; i < points.length - 1; i++) segments.push(...points[i].toArray(), ...points[i + 1].toArray());
        if (path.closed) segments.push(...points.at(-1).toArray(), ...points[0].toArray());
      }
      const geometry = new LineSegmentsGeometry().setPositions(segments),
        material = new LineMaterial({
          color: "#" + CONTOUR.colour,
          linewidth: CONTOUR.linewidth,
          worldUnits: false,
          transparent: true,
          opacity: CONTOUR.opacity,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
        line = new LineSegments2(geometry, material);
      line.name = "Safehouse " + prop.id + " painted contour"; // text-ok: three.js line object name, never shown to the player
      line.renderOrder = CONTOUR.renderOrder;
      line.frustumCulled = false;
      line.userData.prop = prop;
      owner.add(line);
      meshes.push(line);
    }
  }

  function allowed() {
    return (
      s.loaded &&
      !s.traveling &&
      !s.contextLost &&
      !s.resetting &&
      s.game?.player.hp > 0 &&
      !s.game.finished &&
      !s.game.runSaveInvalid
    );
  }
  function renderPanel(force = false) {
    const g = s.game;
    if (!g || !panel) return;
    const inv = lockerInventory(g),
      locker = g.locker,
      key = JSON.stringify([inv, locker, allowed(), safehouseProp(g, "locker"), lastError]);
    if (!force && key === lastPanel) return;
    lastPanel = key;
    panel.replaceChildren();
    const can = allowed() && safehouseProp(g, "locker");
    status.textContent = lastError || (!can ? TEXT.statusUnavailable : TEXT.statusReady);
    const button = (row, text, action, enabled) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.disabled = !can || !enabled;
      b.addEventListener("click", () => {
        const result = dispatch(s.game, action, allowed() && safehouseProp(s.game, "locker"));
        lastError = result.ok
          ? ""
          : result.code === "storage-unavailable"
            ? TEXT.saveUnavailable
            : TEXT.transferUnavailable;
        renderPanel(true);
        s.updateExpedition?.();
      });
      row.append(b);
    };
    for (const id of LOCKER_WEAPON_IDS) {
      const item = inv.weapons[id];
      if (!item.owned) continue;
      const row = document.createElement("div");
      row.className = "locker-row";
      const text = document.createElement("p"),
        stored = lockerStored(g, id);
      text.textContent = fillText(TEXT.weaponRow, {
        name: TEXT.weaponNames[id],
        state: stored ? TEXT.stored : item.equipped ? TEXT.equipped : TEXT.carried,
      });
      row.append(text);
      button(
        row,
        stored ? TEXT.retrieve : TEXT.store,
        { type: stored ? "withdrawWeapon" : "depositWeapon", itemId: id },
        !item.equipped,
      );
      panel.append(row);
    }
    for (const resource of Object.keys(LOCKER_RESOURCE_RULES)) {
      const title = TEXT.resourceNames[resource],
        carry = inv.ammo[resource],
        stash = locker?.ammo[resource] ?? 0,
        rule = LOCKER_RESOURCE_RULES[resource],
        row = document.createElement("div");
      row.className = "locker-row";
      const text = document.createElement("p");
      text.textContent = fillText(TEXT.resourceRow, {
        title,
        carried: +carry.toFixed(SAFEHOUSE_VIEW.amountDigits),
        stored: +stash.toFixed(SAFEHOUSE_VIEW.amountDigits),
      });
      row.append(text);
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = resource === "flame-fuel" ? ".01" : "1";
      amount.step = resource === "flame-fuel" ? ".01" : "1";
      amount.value = resource === "flame-fuel" ? "10" : "1";
      amount.max = String(Math.max(rule.carryCap, rule.stashCap));
      amount.setAttribute("aria-label", fillText(TEXT.amountAria, { title }));
      row.append(amount);
      for (const type of ["depositSupply", "withdrawSupply"]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = type === "depositSupply" ? TEXT.store : TEXT.retrieve;
        b.disabled = !can || !(type === "depositSupply" ? carry : stash);
        b.addEventListener("click", () => {
          const result = dispatch(
            s.game,
            { type, resource, amount: Number(amount.value) },
            allowed() && safehouseProp(s.game, "locker"),
          );
          lastError = result.ok
            ? ""
            : result.code === "storage-unavailable"
              ? TEXT.saveUnavailable
              : TEXT.amountUnavailable;
          renderPanel(true);
        });
        row.append(b);
      }
      panel.append(row);
    }
  }
  function update() {
    const g = s.game,
      w = s.world,
      data = safehouseSite(w);
    // The opening tutorial's arrow targets belong to Westminster, which has no safehouse: they are set before the safehouse gate.
    if (g && w) {
      const pending = shelterTutorialPending(g, tutorialRuns.get(g));
      tutorialRuns.set(g, pending);
      w.routeGuidance?.setTutorial?.(w.areaId === "westminster" && pending);
      const pistol = g.pistol;
      w.routeGuidance?.setPistolTarget?.(
        pistol && !pistol.collected && w.areaId === pistol.pickupAreaId ? pistol.pickupPos : null,
      );
      w.routeGuidance?.setHuntTarget?.(w.areaId === "westminster" ? huntTarget(g) : null);
    }
    if (!g || !w || !data) {
      if (target) target.hidden = true;
      return;
    }
    ensureTarget();
    const inArea = w.areaId === data.areaId;
    if (data.patch && !texture && !loading && !failed && inArea) {
      loading = true;
      new w.THREE.TextureLoader().load(
        new URL("world/" + data.patch.path, w.baseUrl).href,
        (t) => {
          loading = false;
          if (disposed) {
            t.dispose();
            return;
          }
          texture = t;
          texture.colorSpace = w.THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = w.THREE.ClampToEdgeWrapping;
        },
        undefined,
        () => {
          loading = false;
          failed = true;
        },
      );
    }
    if (inArea && data.patch && texture && owner !== w.group) build(w, data);
    for (const mesh of meshes) mesh.visible = inArea && !!data.patch;
    const anchor = safehouseAnchor(g),
      near = !!anchor && Math.hypot(g.player.pos.x - anchor.x, g.player.pos.z - anchor.z) <= data.nearbyRadius,
      active = safehouseInteraction(g),
      cueTime = performance.now() / 1000,
      rect = s.canvas.getBoundingClientRect();
    for (const mesh of meshes) {
      if (!mesh.userData.prop) continue;
      mesh.material.opacity = safehouseCueOpacity(cueTime, {
        period: data.pulseSeconds,
        phase: 0,
        near,
        selected: active,
        reduced: !!reduced?.matches,
      });
      mesh.material.resolution.set(rect.width, rect.height);
      mesh.userData.cueTime = cueTime;
    }
    positionTarget(w, data, !!data.patch && inArea && allowed() && !s.paused && active);

    renderPanel();
  }
  function interact() {
    if (!allowed() || s.paused || !safehouseInteraction(s.game)) return false;
    lastError = "";
    renderPanel(true);
    const pages = ["locker", "gear", "map"],
      page = lastHubPage ? (pages.includes(s.hud.menuPage) ? s.hud.menuPage : lastHubPage) : "locker";
    if (s.hud.showMenuPage(page) !== false) lastHubPage = page;
    return true;
  }
  function interaction() {
    const g = s.game;
    if (!g || !allowed() || s.paused || !safehouseInteraction(g)) return null;
    return { id: "safehouse", label: TEXT.interactLabel, position: safehouseAnchor(g), run: interact };
  }

  return {
    update,
    interact,
    interaction,
    dispose() {
      disposed = true;
      clear();
      texture?.dispose();
      target?.removeEventListener("click", interact);
      target?.remove();
      panel?.replaceChildren?.();
    },
  };
}
