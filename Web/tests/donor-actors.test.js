import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { createGame, enemy } from "../src/combat.js";

test("matched actor integration preserves native scale, equipment and completed death playback across retry", async (t) => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/assets/donor/manifest.json", import.meta.url),
    ),
  );
  const load = async (name) =>
    loadGeometry(
      readFileSync(new URL("../public/assets/donor/" + name, import.meta.url)),
    );
  const [hero, goblin, knife] = await Promise.all([
    load("warrior.glb"),
    load("goblin.glb"),
    load("knife.glb"),
  ]);
  const oldDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
      }),
    }),
  };
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  const library = {
    manifest,
    models: new Map([
      [
        "vagrant",
        { gltf: hero, equipment: knife, description: manifest.models.vagrant },
      ],
      ["goblin", { gltf: goblin, description: manifest.models.goblin }],
    ]),
    dispose() {},
  };
  const scene = new THREE.Scene(),
    world = {
      layout: { characterScale: 1.265 },
      toRender: ({ x, z }) => new THREE.Vector3(x, 0, -z),
    };
  const actors = createActors(scene, world, library),
    g = createGame(world, { pilot: "donor-knife" });
  const foe = Object.assign(enemy(0, { x: 0, z: 0 }), {
    rig: "goblin",
    hp: 0,
    response: { clip: "Death", start: 0, ticks: 144 },
  });
  g.corpses = [foe];
  g.finished = true;
  actors.update(g, 0);
  const player = actors.views.get(0),
    dead = actors.views.get(foe.id);
  assert.equal(
    player.model.getObjectByName("WeaponDrawn").parent.name,
    "hand_r",
  );
  assert.equal(
    player.motion.actions.get("Heavy").getClip(),
    knife.animations.find((c) => c.name === "Heavy"),
  );
  assert.equal(
    dead.root.scale.x,
    1.265,
    "Goblin visual scale must not receive capsule multiplier",
  );
  assert.equal(dead.motion.currentClip, "Death");
  assert.equal(dead.motion.currentPhase, 0);
  actors.update(g, 0.5);
  assert.ok(
    dead.motion.currentPhase > 0,
    "death must advance after simulation ends",
  );
  const phase = dead.motion.currentPhase;
  actors.update(g, 0);
  assert.equal(dead.motion.currentPhase, phase, "paused death must stay still");
  actors.reset();
  assert.equal(scene.children.length, 0);
  assert.ok(
    hero.scene.getObjectByName("SwordDrawn"),
    "cached source must remain untouched",
  );
  assert.ok(knife.scene.getObjectByName("WeaponDrawn"));
  actors.update(createGame(world, { pilot: "donor-knife" }), 0);
  assert.equal(actors.views.size, 1);
  assert.equal(actors.views.get(0).motion.currentClip, "Armed");
  actors.dispose();
});
