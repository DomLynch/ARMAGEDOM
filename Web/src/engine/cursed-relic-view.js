import * as T from "three";
import { addPickupGlow } from "../pickup-glow.js";
import { relicAvailable, relicPosition, cursedHudText } from "./cursed-relic.js";
// The cursed relic as the player sees it: a dark crystal with a red contour (the same thin pickup contour every drop uses) and a soft
// red halo on the ground, bobbing and turning; while the curse is carried, a faint red ring under the player and a small "Cursed"
// line in the HUD. Every look value is area-content.json `cursedRelic.visual`. One mesh set per view, nothing is built per frame.
const TURN = T.MathUtils.DEG2RAD * 360; // one full turn in radians
const QUARTER = T.MathUtils.DEG2RAD * 90; // lays a plane flat on the ground
function haloTexture(v) {
  const r = v.haloCanvasRadiusPx,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = r + r;
  const ctx = canvas.getContext("2d"),
    rgb = new T.Color(v.halo).toArray().map((c) => Math.round(c * 255)),
    gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, `rgba(${rgb},${v.haloCoreAlpha})`);
  gradient.addColorStop(v.haloMidStop, `rgba(${rgb},${v.haloMidAlpha})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}
function glowPlane(v, map, opacity) {
  const side = v.haloRadius + v.haloRadius,
    plane = new T.Mesh(
      new T.PlaneGeometry(side, side),
      new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity }),
    );
  plane.rotation.x = -QUARTER;
  plane.position.y = v.haloLift;
  return plane;
}
function build(s, v) {
  const root = new T.Group(),
    crystal = new T.Mesh(
      new T.OctahedronGeometry(v.size),
      new T.MeshStandardMaterial({
        color: v.color,
        emissive: v.emissive,
        emissiveIntensity: v.emissiveIntensity,
        roughness: v.roughness,
        metalness: v.metalness,
      }),
    ),
    map = haloTexture(v),
    halo = glowPlane(v, map, v.haloOpacity),
    aura = glowPlane(v, map, v.haloOpacity * v.auraShare);
  crystal.scale.y = v.stretch;
  aura.visible = false;
  const contour = addPickupGlow(crystal);
  root.add(halo, crystal);
  s.scene.add(root, aura);
  return { root, crystal, halo, aura, contour, map, at: null, area: null };
}
export function createCursedRelicView(s) {
  const status = document.getElementById("cursed-status");
  let parts = null,
    disposed = false,
    shownText = "";
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
    parts ??= build(s, v);
    const p = parts;
    if (p.area !== g.world.areaId) {
      p.area = g.world.areaId;
      const at = relicPosition(g);
      p.at = at && g.world.toRender(at);
    }
    const seen = !!p.at && relicAvailable(g),
      carried = g.cursed?.active === true && g.player.hp > 0;
    p.root.visible = seen;
    if (seen) {
      p.root.position.set(p.at.x, 0, p.at.z);
      p.crystal.position.y = v.hoverHeight + v.bobAmount * Math.sin((g.time / v.bobSeconds) * TURN);
      p.crystal.rotation.y = (g.time / v.spinSeconds) * TURN;
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
