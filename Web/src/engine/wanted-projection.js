import * as T from "three";
import { effectiveBounty } from "./marked.js";
import { GAME_DATA } from "./game-data.js";
import { validateWantedPoster } from "./wanted-poster-data.js";

// Poster layout, wear pattern, mesh colour, draw order and flicker rates: data/visual.json `wantedPoster`.
const POSTER = GAME_DATA.visual.wantedPoster;
validateWantedPoster(POSTER);

// One cached canvas on the existing registered image stage. Currency is read
// from MARKED; this view never grants, saves, or changes a bounty.
export function paintWanted(canvas, portrait, bounty) {
  const { portrait: pic, amount: money, rules, specks, scratches } = POSTER,
    c = canvas.getContext("2d");
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#e5e5df";
  c.textAlign = "center";
  c.font = "700 82px monospace";
  c.fillText("WANTED", POSTER.titleX, 100);
  c.globalAlpha = pic.alpha;
  c.drawImage(portrait, pic.x, pic.y, pic.width, pic.height);
  c.globalAlpha = 1;
  const amount = "$" + bounty.toLocaleString("en-US");
  c.font = `700 ${money.fontPx}px monospace`;
  const width = c.measureText(amount).width;
  if (width > money.maxWidth) c.font = `700 ${Math.floor((money.fontPx * money.maxWidth) / width)}px monospace`;
  c.fillText(amount, money.x, money.y);
  c.globalAlpha = rules.alpha;
  c.fillRect(rules.top.x, rules.top.y, rules.top.width, rules.thickness);
  c.fillRect(rules.bottom.x, rules.bottom.y, rules.bottom.width, rules.thickness);
  c.globalAlpha = 1;
  // Fixed wear, repainted only with changed content, never frame-by-frame noise.
  c.globalCompositeOperation = "destination-out";
  for (let n = 0; n < specks.count; n++) {
    const x = (n * specks.stepX + specks.offsetX) % specks.spanX,
      y = (n * specks.stepY + specks.offsetY) % specks.spanY;
    c.fillStyle = `rgba(0,0,0,${specks.alpha + (n % specks.alphaSteps) * specks.alphaStep})`;
    c.fillRect(x, y, 1 + (n % specks.sizeSteps), 1);
  }
  for (let n = 0; n < scratches.count; n++) {
    c.fillStyle = "rgba(0,0,0,.12)";
    const x = scratches.x + ((n * scratches.stepX) % scratches.spanX),
      length = scratches.width + (n % scratches.widthSteps) * scratches.widthStep;
    c.fillRect(x, scratches.y + n * scratches.stepY, length, 1);
  }
  c.globalCompositeOperation = "source-over";
}

export function createWantedMesh(world, data, texture) {
  const material = new T.MeshBasicMaterial({
    map: texture,
    color: Number("0x" + POSTER.meshColour),
    transparent: false,
    opacity: data.opacity,
    blending: T.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: T.DoubleSide,
    toneMapped: false,
  });
  // Additive blending retains texture alpha, but the opaque render queue is
  // intentional: transparent-list quads run after actors regardless of order.
  // Draw after the registered photograph and before its authored depth masks.
  // Existing actor/depth rendering therefore still places foreground actors in front.
  const mesh = world.quad(data.points, 100, material, POSTER.renderOrder, true);
  mesh.geometry.setAttribute("uv", new T.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); // tuning-ok: two components (u, v) per corner
  mesh.name = "WANTED wall projection";
  mesh.userData = { areaId: data.areaId, bounty: null, textureUpdates: 0 };
  return mesh;
}

export function createWantedProjection(s) {
  let world = null,
    mesh = null,
    canvas = null,
    texture = null,
    portrait = null,
    pending = null,
    failed = false,
    disposed = false,
    lastBounty = null,
    paints = 0;
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  function clear() {
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    }
    world = null;
  }
  function load(data, w) {
    if (pending || portrait || failed) return;
    const image = new Image();
    image.decoding = "async";
    pending = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = new URL("world/" + data.portrait, w.baseUrl).href;
    })
      .then((value) => {
        if (!disposed) {
          portrait = value;
          update();
        }
      })
      .catch(() => {
        failed = true;
      })
      .finally(() => (pending = null));
  }
  function update() {
    if (disposed) return;
    const w = s.world,
      g = s.game,
      settings = w?.markedData,
      data = settings?.projections?.[w.areaId] ?? settings?.projection;
    if (mesh && (world !== w || mesh.parent !== w.group)) clear();
    if (!data || w.areaId !== data.areaId || !g?.marked || g.runSaveInvalid) {
      if (mesh) mesh.visible = false;
      return;
    }
    const bounty = effectiveBounty(g);
    if (bounty <= 0) {
      if (mesh) mesh.visible = false;
      return;
    }
    if (!portrait) {
      load(data, w);
      return;
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = POSTER.canvas.width;
      canvas.height = POSTER.canvas.height;
      texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = T.LinearFilter;
    }
    if (!mesh) {
      world = w;
      mesh = createWantedMesh(w, data, texture);
    }
    if (lastBounty !== bounty) {
      paintWanted(canvas, portrait, bounty);
      texture.needsUpdate = true;
      lastBounty = bounty;
      paints++;
    }
    mesh.visible = true;
    mesh.userData.bounty = bounty;
    mesh.userData.textureUpdates = paints;
    const t = g.time ?? 0;
    const wobble = (Math.sin(t * POSTER.flickerHz[0]) + Math.sin(t * POSTER.flickerHz[1])) * 0.5; // tuning-ok: the mean of two sine waves
    mesh.material.opacity = data.opacity * (reduced?.matches ? 1 : 1 + data.flicker * wobble);
  }
  return {
    update,
    dispose() {
      disposed = true;
      clear();
      texture?.dispose();
      texture = null;
      canvas = portrait = null;
    },
  };
}
