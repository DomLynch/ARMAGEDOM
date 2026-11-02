// Draws the other players of my area (W2): a simple figure per player, a name tag above it, positions from createRemotePlayers().
// Presentation only: no collision, no hits, no effect on the game state. A figure is a pooled group removed (and disposed) when its
// player leaves the layer.
import * as THREE from "three";
import { REMOTE_PLAYERS as V } from "./remote-players-view-data.js";
import { webText } from "./web-text.js";
import { GAME_DATA } from "./game-data.js";

// The sizes, segment counts, colour and name-card layout live in visual.json `remotePlayers`.
const BODY_HEIGHT = V.capsule.bodyHeight,
  RADIUS = V.capsule.radius,
  TAG_Y = V.tag.height;
const hue = (id) => ((id * V.capsule.hueStep) % 360) / 360;

// The server's display name when it sent one, otherwise 'Guest <id>'.
export const guestName = (id, name = null) => (typeof name === "string" && name ? name : webText("remote.guest", { id }));

function nameTexture(text) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = V.tag.canvas;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(13,24,27,.72)";
  ctx.fillRect(...V.tag.band);
  ctx.fillStyle = "#f1d28c";
  ctx.font = V.tag.fonts[0];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, V.tag.textX, V.tag.textY);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// `death` (optional, from the presence session): { step(view, entity, dt) -> true while a ragdoll owns the bones, release(view) }, the ragdoll
// death of physics-death.js. A player whose presence row says dead falls as a ragdoll when a body is free, else plays the baked death clip.
export function createRemotePlayersView({ scene, toRender, survivors = null, death = null }) {
  const group = new THREE.Group();
  group.name = "Other players"; // text-ok: scene-graph group name, never shown
  scene.add(group);
  const figures = new Map(); // id -> { root, parts: [disposables] }
  const body = new THREE.CapsuleGeometry(RADIUS, BODY_HEIGHT, V.capsule.capSegments, V.capsule.radialSegments),
    head = new THREE.SphereGeometry(V.head.radius, V.head.widthSegments, V.head.heightSegments);

  // The figure's root owns position, facing and the name tag; its LOOK is a child: the plain capsule (cheap), or, for the players the
  // caller picks as `full`, Characters' survivor kit: survivors.spawn(id) -> { root, update({ moving, facing }), dispose() }.
  function make(id) {
    const root = new THREE.Group();
    root.name = `Player ${id}`; // text-ok: scene-graph object name, never shown
    group.add(root);
    return { root, parts: [], label: null, tag: null, capsule: null, survivor: null };
  }

  function showCapsule(figure, id) {
    if (!figure.capsule) {
      const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(hue(id), V.capsule.saturation, V.capsule.lightness),
          toneMapped: false,
        }),
        look = new THREE.Group(),
        torso = new THREE.Mesh(body, material),
        skull = new THREE.Mesh(head, material);
      torso.position.y = RADIUS + BODY_HEIGHT / 2; // tuning-ok: the torso is centred on half its height
      skull.position.y = BODY_HEIGHT + RADIUS * 2 + V.head.radius; // tuning-ok: the capsule's two caps, then the head's radius
      look.add(torso, skull);
      figure.capsule = look;
      figure.parts.push(material);
    }
    if (!figure.capsule.parent) figure.root.add(figure.capsule);
  }

  // Wants the full look: use the kit if it gives a figure (the model may not be loaded yet), else stay on the capsule. Not wanted:
  // free the kit's figure and go back to the capsule, so only the chosen few ever cost the full model.
  function setLook(figure, id, full, kit) {
    if (figure.survivor && figure.kit !== kit) {
      // The kit was replaced (its library swapped) and took this figure with it: forget it, a new one is spawned below.
      figure.survivor.root.removeFromParent();
      figure.survivor.dispose();
      figure.survivor = null;
    }
    if (full && !figure.survivor) {
      const survivor = kit?.spawn?.(id) ?? null;
      if (survivor?.root) {
        figure.capsule?.removeFromParent();
        figure.root.add(survivor.root);
        figure.survivor = survivor;
        figure.kit = kit;
      }
    } else if (!full && figure.survivor) {
      figure.survivor.root.removeFromParent();
      figure.survivor.dispose();
      figure.survivor = null;
    }
    if (!figure.survivor) showCapsule(figure, id);
  }

  // The tag is rebuilt only when the label changes (a name can arrive after the figure first appears).
  function setLabel(figure, label) {
    if (figure.label === label) return;
    figure.label = label;
    if (figure.tag) {
      figure.root.remove(figure.tag.sprite);
      for (const part of figure.tag.parts) part.dispose();
      figure.tag = null;
    }
    const map = nameTexture(label);
    if (!map) return;
    const spriteMaterial = new THREE.SpriteMaterial({ map, depthWrite: false, toneMapped: false }),
      sprite = new THREE.Sprite(spriteMaterial);
    sprite.name = "Name tag"; // text-ok: scene-graph object name, never shown
    sprite.scale.set(...V.tag.scale, 1);
    sprite.position.y = TAG_Y;
    figure.root.add(sprite);
    figure.tag = { sprite, parts: [spriteMaterial, map] };
  }

  // A dead remote player: the ragdoll takes the survivor's bones (or, with no body free, the baked death clip plays once). Alive again, or the
  // survivor swapped: the body goes back to the pool and the survivor is rebuilt standing. Returns true while the figure must not be animated.
  let lastAt = null;
  function revive(figure, sample) {
    const c = figure.corpse;
    if (!c || (sample.dead && figure.survivor?.model === c.model)) return;
    death?.release(c);
    figure.corpse = null;
    if (!sample.dead && figure.survivor) {
      figure.survivor.root.removeFromParent(); // the fallen body is dropped; setLook builds a standing one
      figure.survivor.dispose();
      figure.survivor = null;
    }
  }
  function fall(figure, id, sample, dt) {
    const s = figure.survivor;
    if (!sample.dead || !s) return false;
    const c = (figure.corpse ??= { root: s.body, model: s.model, physicsDeath: undefined, baked: false });
    if (c.baked) return true;
    const entity = {
      id,
      remotePlayer: true,
      hp: 0,
      maxHP: 1,
      facing: { x: Math.sin(sample.facing), z: -Math.cos(sample.facing) },
    };
    if (death?.step(c, entity, dt)) return true;
    c.baked = true; // no body free, no chunk yet or a throw: the clip, and no ragdoll later mid-clip
    s.dieBaked();
    return true;
  }

  function drop(id) {
    const figure = figures.get(id);
    if (!figure) return;
    if (figure.corpse) death?.release(figure.corpse);
    group.remove(figure.root);
    for (const part of [...figure.parts, ...(figure.tag?.parts ?? [])]) part.dispose();
    figure.survivor?.dispose();
    figures.delete(id);
  }

  return {
    group,
    // samples: createRemotePlayers().sample(now): [{ id, x, z, facing, moving }] with x, z in metres. full: the set of ids that get
    // the survivor kit (null means everyone does, when there is a kit).
    update(samples, full = null) {
      const present = new Set(),
        kit = (typeof survivors === "function" ? survivors() : survivors) ?? null, // asked once a frame, not once a figure
        t = (globalThis.performance?.now?.() ?? Date.now()) / 1000,
        dt = Math.min(GAME_DATA.remoteSurvivors.maxFrameSeconds, lastAt === null ? 0 : Math.max(0, t - lastAt));
      lastAt = t;
      for (const sample of samples) {
        present.add(sample.id);
        const figure = figures.get(sample.id) ?? make(sample.id);
        figures.set(sample.id, figure);
        revive(figure, sample);
        setLook(figure, sample.id, full ? full.has(sample.id) : true, kit);
        setLabel(figure, guestName(sample.id, sample.name));
        figure.root.position.copy(toRender({ x: sample.x, z: sample.z }, 0));
        figure.root.rotation.y = sample.facing;
        figure.root.updateMatrixWorld(true); // the ragdoll reads the body's world frame this frame
        if (!fall(figure, sample.id, sample, dt)) figure.survivor?.update({ moving: sample.moving, facing: sample.facing });
        else if (figure.corpse.baked) figure.survivor.update({});
      }
      for (const id of [...figures.keys()]) if (!present.has(id)) drop(id);
    },
    get count() {
      return figures.size;
    },
    // id -> the name on each tag (also when no canvas exists to draw it, e.g. in tests).
    labels() {
      return new Map([...figures].map(([id, figure]) => [id, figure.label]));
    },
    dispose() {
      for (const id of [...figures.keys()]) drop(id);
      scene.remove(group);
      body.dispose();
      head.dispose();
    },
  };
}
