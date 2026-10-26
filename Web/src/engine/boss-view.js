import * as T from "three";
import { createHeadLabelPositioner } from "./boss-label.js";
import { BOSS_VIEW as V } from "./boss-view-data.js";
export function createBossView(s) {
  const host = document.getElementById("boss-labels");
  if (!host) return { update() {}, dispose() {} };
  const labels = new Map(),
    patches = new Map(),
    positionHead = createHeadLabelPositioner();
  let ring = null,
    disc = null,
    disposed = false;
  const removePatch = (view) => {
    view.root.removeFromParent();
    view.fill.material.dispose();
    view.edge.material.dispose();
  };
  function update() {
    if (disposed) return;
    const g = s.game;
    if (!g) return;
    const active = s.loaded && !s.contextLost && !s.traveling && g.player.hp > 0;
    const live = new Set();
    for (const e of g.enemies.filter((e) => (e.bossProfile || e.markedHunter) && e.hp > 0)) {
      live.add(e.id);
      let el = labels.get(e.id);
      if (!el) {
        el = document.createElement("span");
        el.className = "boss-world-label" + (e.markedHunter ? " hunter-world-label" : "");
        el.dataset.bossKey = e.placementKey;
        host.append(el);
        labels.set(e.id, el);
      }
      const near = Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) < V.labelRange;
      el.hidden = !active || !near;
      if (el.hidden) continue;
      const name = e.markedHunter ? "HUNTER" : e.bossName;
      if (el.textContent !== name) el.textContent = name;
      const position = positionHead(s.actors?.views.get(e.id), el.getBoundingClientRect(), s.camera, {
        width: innerWidth,
        height: innerHeight,
      });
      el.hidden = !position;
      if (position) {
        el.style.left = `${position.left}px`;
        el.style.top = `${position.top}px`;
      }
    }
    for (const [id, el] of labels)
      if (!live.has(id)) {
        el.remove();
        labels.delete(id);
      }
    const ids = new Set(),
      H = V.hazard;
    for (const h of g.areaHazards ?? []) {
      if (
        h.areaId !== s.world.areaId ||
        g.time >= h.expiresAt ||
        !g.enemies.some((e) => e.id === h.ownerId && e.hp > 0)
      )
        continue;
      ids.add(h.ownerId);
      let view = patches.get(h.ownerId);
      if (!view) {
        ring ??= new T.RingGeometry(H.ringInner, 1, H.segments);
        disc ??= new T.CircleGeometry(1, H.segments);
        const root = new T.Group(),
          fill = new T.Mesh(
            disc,
            new T.MeshBasicMaterial({ transparent: true, opacity: H.initialFillOpacity, depthWrite: false, side: T.DoubleSide }),
          ),
          edge = new T.Mesh(
            ring,
            new T.MeshBasicMaterial({ transparent: true, opacity: H.initialEdgeOpacity, depthWrite: false, side: T.DoubleSide }),
          );
        root.rotation.x = -Math.PI / 2; // tuning-ok: lays the patch flat on the ground
        root.add(fill, edge);
        s.scene.add(root);
        view = { root, fill, edge };
        patches.set(h.ownerId, view);
      }
      const warning = g.time < h.startsAt;
      view.root.name = warning ? "Area hazard warning" : "Area hazard active"; // text-ok: three.js group name, never shown to the player
      view.root.visible = active;
      view.root.position.copy(s.world.toRender(h.position, H.height));
      view.root.scale.setScalar(h.radius);
      const phase = warning ? H.warning : H.active;
      view.fill.material.color.set(`#${phase.colour}`);
      view.edge.material.color.set(`#${phase.colour}`);
      view.fill.material.opacity = phase.fillOpacity;
      view.edge.material.opacity = warning
        ? phase.edgeBase + phase.edgeSwing * Math.sin(g.time * phase.pulseRate) ** 2 // tuning-ok: squared sine pulse
        : phase.edgeOpacity;
    }
    for (const [id, view] of patches)
      if (!ids.has(id)) {
        removePatch(view);
        patches.delete(id);
      }
  }
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const el of labels.values()) el.remove();
      labels.clear();
      for (const view of patches.values()) removePatch(view);
      patches.clear();
      ring?.dispose();
      disc?.dispose();
    },
  };
}
