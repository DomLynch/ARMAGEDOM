// Draws the other players of my area (W2): a simple figure per player, a name tag above it, positions from createRemotePlayers().
// Presentation only: no collision, no hits, no effect on the game state. A figure is a pooled group removed (and disposed) when its
// player leaves the layer.
import * as THREE from "three";

const BODY_HEIGHT = 1.0,
  RADIUS = 0.3,
  TAG_Y = 2.05;
const hue = (id) => ((id * 47) % 360) / 360;

// The server's display name when it sent one, otherwise 'Guest <id>'.
export const guestName = (id, name = null) => (typeof name === "string" && name ? name : `Guest ${id}`);

function nameTexture(text) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(13,24,27,.72)";
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = "#f1d28c";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 33);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function createRemotePlayersView({ scene, toRender, survivors = null }) {
  const group = new THREE.Group();
  group.name = "Other players";
  scene.add(group);
  const figures = new Map(); // id -> { root, parts: [disposables] }
  const body = new THREE.CapsuleGeometry(RADIUS, BODY_HEIGHT, 4, 8),
    head = new THREE.SphereGeometry(0.2, 12, 8);

  // The figure's root owns position, facing and the name tag; its LOOK is a child: the plain capsule (cheap), or, for the players the
  // caller picks as `full`, Characters' survivor kit: survivors.spawn(id) -> { root, update({ moving, facing }), dispose() }.
  function make(id) {
    const root = new THREE.Group();
    root.name = `Player ${id}`;
    group.add(root);
    return { root, parts: [], label: null, tag: null, capsule: null, survivor: null };
  }

  function showCapsule(figure, id) {
    if (!figure.capsule) {
      const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(hue(id), 0.45, 0.55),
          toneMapped: false,
        }),
        look = new THREE.Group(),
        torso = new THREE.Mesh(body, material),
        skull = new THREE.Mesh(head, material);
      torso.position.y = RADIUS + BODY_HEIGHT / 2;
      skull.position.y = BODY_HEIGHT + RADIUS * 2 + 0.2;
      look.add(torso, skull);
      figure.capsule = look;
      figure.parts.push(material);
    }
    if (!figure.capsule.parent) figure.root.add(figure.capsule);
  }

  // Wants the full look: use the kit if it gives a figure (the model may not be loaded yet), else stay on the capsule. Not wanted:
  // free the kit's figure and go back to the capsule, so only the chosen few ever cost the full model.
  function setLook(figure, id, full) {
    const kit = (typeof survivors === "function" ? survivors() : survivors) ?? null;
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
    sprite.name = "Name tag";
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = TAG_Y;
    figure.root.add(sprite);
    figure.tag = { sprite, parts: [spriteMaterial, map] };
  }

  function drop(id) {
    const figure = figures.get(id);
    if (!figure) return;
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
      const present = new Set();
      for (const sample of samples) {
        present.add(sample.id);
        const figure = figures.get(sample.id) ?? make(sample.id);
        figures.set(sample.id, figure);
        setLook(figure, sample.id, full ? full.has(sample.id) : true);
        setLabel(figure, guestName(sample.id, sample.name));
        figure.root.position.copy(toRender({ x: sample.x, z: sample.z }, 0));
        figure.root.rotation.y = sample.facing;
        figure.survivor?.update({ moving: sample.moving, facing: sample.facing });
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
