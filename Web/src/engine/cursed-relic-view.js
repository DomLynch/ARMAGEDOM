import * as T from "three";
import { addPickupGlow } from "../pickup-glow.js";
import { relicAvailable, relicPosition, cursedHudText } from "./cursed-relic.js";
// The cursed relic as the player sees it: a dark crystal with a red contour (the same thin pickup contour every drop uses) and a soft
// red halo on the ground, bobbing and turning; while the curse is carried, a faint red ring under the player and a small "Cursed"
// line in the HUD. Looks come from area-content.json `cursedRelic.visual`. One mesh set per view, nothing is built per frame.
const TAU = Math.PI * 2; // tuning-ok: one full turn
const GRADIENT_PX = 64; // tuning-ok: a small canvas is plenty for a soft radial falloff
const RING_INNER = 0.62; // tuning-ok: the under-player ring is drawn as a fraction of the halo plane's radius
function haloTexture(colour) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = GRADIENT_PX;
  const ctx = canvas.getContext("2d"),
    mid = GRADIENT_PX / 2, // tuning-ok: centred on the canvas
    rgb = new T.Color(colour).toArray().map((c) => Math.round(c * 255)),
    gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  gradient.addColorStop(0, `rgba(${rgb},0.9)`);
  gradient.addColorStop(RING_INNER, `rgba(${rgb},0.3)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GRADIENT_PX, GRADIENT_PX);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}
export function createCursedRelicView(s) {
  const status = document.getElementById("cursed-status");
  let parts = null,
    disposed = false,
    shownText = "";
  function build(v) {
    const root = new T.Group(),
      crystal = new T.Mesh(
        new T.OctahedronGeometry(v.size),
        new T.MeshStandardMaterial({
          color: v.color,
          emissive: v.emissive,
          emissiveIntensity: v.emissiveIntensity,
          roughness: 0.35, // tuning-ok: glossy crystal
          metalness: 0.2, // tuning-ok: slight sheen
        }),
      ),
      map = haloTexture(v.halo),
      glowMaterial = () =>
        new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: v.haloOpacity }),
      halo = new T.Mesh(new T.PlaneGeometry(v.haloRadius * 2, v.haloRadius * 2), glowMaterial()), // tuning-ok: radius is half the side
      aura = new T.Mesh(new T.PlaneGeometry(v.haloRadius * 2, v.haloRadius * 2), glowMaterial());
    root.name = "Cursed relic"; // text-ok: scene-graph name, never shown
    crystal.scale.y = 1.5; // tuning-ok: a tall crystal reads as a shard, not a ball
    halo.rotation.x = aura.rotation.x = -Math.PI / 2; // tuning-ok: a quarter turn lays the glow flat
    halo.position.y = 0.03; // tuning-ok: just above the ground
    aura.position.y = 0.03;
    aura.material.opacity = v.haloOpacity * 0.6; // tuning-ok: the player's ring is fainter than the relic's own halo
    aura.visible = false;
    const contour = addPickupGlow(crystal);
    root.add(halo, crystal);
    s.scene.add(root, aura);
    return { v, root, crystal, halo, aura, contour, map, at: null, area: null };
  }
  function drop() {
    if (!parts) return;
    parts.root.removeFromParent();
    parts.aura.removeFromParent();
    parts.contour.dispose();
    for (const m of [parts.crystal, parts.halo, parts.aura]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    parts.map.dispose();
    parts = null;
  }
  function paint(text) {
    if (!status || text === shownText) return;
    status.textContent = text;
    status.hidden = !text;
    shownText = text;
  }
  function update() {
    if (disposed) return;
    const g = s.game,
      data = g?.world?.cursedRelicData;
    if (!data || !s.loaded || s.traveling) {
      drop();
      paint("");
      return;
    }
    const v = data.visual;
    parts ??= build(v);
    if (parts.area !== g.world.areaId) {
      parts.area = g.world.areaId;
      const p = relicPosition(g);
      parts.at = p && g.world.toRender(p);
    }
    const p = parts,
      seen = !!p.at && relicAvailable(g),
      carried = g.cursed?.active === true && g.player.hp > 0;
    p.root.visible = seen;
    if (seen) {
      p.root.position.set(p.at.x, 0, p.at.z);
      p.crystal.position.y = v.hoverHeight + v.bobAmount * Math.sin((g.time / v.bobSeconds) * TAU);
      p.crystal.rotation.y = (g.time / v.spinSeconds) * TAU;
    }
    p.aura.visible = carried;
    if (carried) p.aura.position.set(g.player.pos.x, p.aura.position.y, -g.player.pos.z);
    paint(carried ? cursedHudText(g) : "");
  }
  return {
    update,
    dispose() {
      disposed = true;
      drop();
      paint("");
    },
  };
}
