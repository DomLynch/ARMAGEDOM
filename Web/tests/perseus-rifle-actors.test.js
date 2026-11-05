// The area-travel crash: actors.js builds the rifle-family poses on the player view during update, and the Perseus skeleton threw.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createActors } from "../src/actors.js";
import { disposeActorSources } from "../src/actor-resources.js";
import { createGame } from "../src/combat.js";
import { createHollowEncounter } from "../src/hollow-encounter.js";

const base = new URL("../public/assets/", import.meta.url),
  manifest = JSON.parse(fs.readFileSync(new URL("manifest-hollow.json", base))),
  read = (description) => loadGeometry(fs.readFileSync(new URL(description.url, base)));

test("the real actors build holds the rifle, shotgun, rocket launcher and LMG on the Perseus player, again after a rebuild", async (t) => {
  const old = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
    }),
  };
  t.after(() => (old === undefined ? delete globalThis.document : (globalThis.document = old)));
  const models = new Map();
  for (const name of ["vagrant", "player-rifle", "player-shotgun", "player-rocket-launcher"])
    models.set(name, { description: manifest.models[name], gltf: await read(manifest.models[name]), equipment: null });
  t.after(() => disposeActorSources(new Set([...models.values()].map((r) => r.gltf))));
  const gun = (modelRef) => ({ modelRef, rules: { reload: 1 } }),
    world = {
      areaId: "east",
      layout: { characterScale: 1.265 },
      spawn: { x: 0, z: 0 },
      move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
      lineClear: () => true,
      geometry: { clear: () => true, lineClear: () => true },
      toRender: (p, h = 0) => new T.Vector3(p.x, h, -p.z),
      rifleData: { modelRef: "player-rifle" },
      bossEquipmentData: {
        commanderPistol: { ...gun("player-rifle"), weaponKey: "railgun" },
        shotgun: gun("player-shotgun"),
        rocketLauncher: gun("player-rocket-launcher"),
      },
    },
    g = createGame(world, {
      pilot: "donor-knife",
      encounter: createHollowEncounter({ rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 }),
      pistol: true,
      supplies: true,
      finishers: true,
      areaResidents: true,
      openingGroup: false,
    });
  g.enemies = [];
  g.rifle ??= {};
  g.bossEquipment = { commanderPistol: {}, shotgun: {}, rocketLauncher: {} };
  for (const select of [
    () => (g.rifle.selected = true),
    () => ((g.rifle.selected = false), (g.bossEquipment.shotgun.selected = true)),
    () => ((g.bossEquipment.shotgun.selected = false), (g.bossEquipment.rocketLauncher.selected = true)),
    () => ((g.bossEquipment.rocketLauncher.selected = false), (g.bossEquipment.commanderPistol.selected = true)),
  ]) {
    select();
    for (let rebuild = 0; rebuild < 2; rebuild++) {
      const actors = createActors(new T.Scene(), world, { manifest, models, dispose() {} }, { visualScale: 1.3225 });
      actors.update(g, 0);
      actors.update(g, 1 / 60);
      const view = actors.views.get(0);
      assert(
        view.riflePose && view.shotgunPose && view.rocketPose && view.railgunPose,
        "every pose built on Perseus",
      );
      actors.dispose();
    }
  }
});
