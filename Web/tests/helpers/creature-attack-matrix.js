// Alpha item 3 (MEASURE ONLY): every live creature x every attack the player can hold.
// The matrix is built from existing rows, not hand-written lists:
//   creatures -> the real area spawn rows (AREA_MOB_SPAWNS / population policy / AREA_DRONE_SPAWNS) as
//                initialised by createGame, one representative per runtime rig;
//   melee     -> MELEE_VARIANTS (knife, cleaver, bone saw) and their move tables;
//   ranged    -> RANGED_WEAPON_CATALOG + BOSS_EQUIPMENT_PROFILES + the flame data row.
// Each cell performs the attack through stepGame (the real dispatch path) with the real actors
// supplying contact/trace services, and records whether the creature's hp dropped and whether
// repeated attacks kill it. Cells that fail are listed in KNOWN_GAPS (cell id -> cause) so the test
// is green and the gap list is explicit; when a gap is fixed the test fails until its row is removed.
//
// A cell is "ok" when the creature loses hp at some distance in the sweep AND repeated attacks kill it.
// Not covered here: the legacy base flamethrower (only reachable through a pre-184 save; it shares
// stepFlame with the Ember Projector), boss/marked-hunter/appearance-variant residents, creature
// counter-attacks (creatures are held inert so only the player's attack changes hp), and phone
// frame pacing or touch feel (desktop-driven actors; the touch rows only exercise the touch-target path).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry } from "../../../art/donor/probe.mjs";
import { createActors } from "../../src/actors.js";
import { disposeActorSources } from "../../src/actor-resources.js";
import { createGame, stepGame } from "../../src/combat.js";
import { createAreaRegistry } from "../../src/area-registry.js";
import { createGeometry } from "../../src/world-geometry.js";
import { validateAreaMetadata } from "../../src/engine/area-content.js";
import { hollowLocomotionFor } from "../../src/area-mob-spawns.js";
import { rigCapability } from "../../src/rig-capabilities.js";
import { MELEE_VARIANTS } from "../../src/melee-equipment.js";
import { CLEAVER_ITEM_ID } from "../../src/engine/unique-reward-runtime.js";
import { syncMeleeEquipment } from "../../src/melee-equipment.js";
import { fixture, armed as armedRifle } from "./rifle-fixture.js";
import { armedBossEquipment } from "./boss-equipment-fixture.js";
import { RANGED_WEAPON_CATALOG, RIFLE_ITEM_ID } from "../../src/engine/weapon-catalog.js";
import { BOSS_EQUIPMENT_PROFILES } from "../../src/engine/boss-equipment-data.js";
import { createMobileAimState } from "../../src/mobile-combat-aim.js";
import { PISTOL_ITEM_ID } from "../../src/core/pistol-operation.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../../public/" + path, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const content = validateAreaMetadata(read("world/area-content.json"), registry);
const assets = new URL("../../public/assets/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("manifest-hollow.json", assets)));

// ---------------------------------------------------------------------------------------------
// Known gaps: cell id ("<creature>/<attack>") -> cause. Empty means every cell must pass.
// ---------------------------------------------------------------------------------------------
const KNOWN_GAPS = {};

// ---------------------------------------------------------------------------------------------
// Creature rows: one live representative per runtime rig, taken from real area initialisation.
// ---------------------------------------------------------------------------------------------
const CREATURES = ["rat", "dog", "roach", "wolf", "salamander", "drone", "scavenger", "hollow"];
const CREATURE_RIG = {
  rat: "original-rat",
  dog: "original-dog",
  roach: "original-roach",
  wolf: "original-wolf",
  salamander: "giant-salamander",
  drone: "low-hover-drone",
  scavenger: "hollow-scavenger",
  hollow: "hollow-scavenger",
};
const EXPLORE_OPTIONS = (cycle) => ({
  pilot: "donor-knife",
  pistol: true,
  supplies: true,
  vest: true,
  areaResidents: true,
  openingGroup: false,
  residentPlacements: content.residents,
  animalVariants: true,
  animalCycle: cycle,
  rat: true,
  dog: true,
  roach: true,
  drone: true,
  encounter: {
    id: "hollow-scavengers",
    character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 },
  },
});
function liveCreatureRows() {
  const rows = new Map();
  for (const areaId of registry.ids)
    for (const cycle of ["A", "B"]) {
      const layout = read(registry.asset(registry.get(areaId).layoutRef).path),
        geometry = createGeometry(layout),
        world = {
          ...content,
          areaId,
          registry,
          spawn: geometry.ground(registry.get(areaId).entry),
          layout,
          geometry,
          progressionData: content.progression,
          expeditionData: content.expedition,
          residentPlacements: content.residents,
          lineClear: (a, b) => geometry.lineClear(a, b),
          move: (p, d, r) => geometry.move(p, d, r),
          travelAt: () => null,
        },
        g = createGame(world, EXPLORE_OPTIONS(cycle));
      for (const e of g.enemies) {
        if (e.bossProfile || e.markedHunter) continue;
        // Plain residents only: skip declared appearance/recipe variants (gaunt, Hale) for the human rows.
        if (e.rig === "hollow-scavenger" && (e.humanBodyRecipe || e.appearanceRef !== undefined)) continue;
        const name =
          e.rig === "hollow-scavenger"
            ? hollowLocomotionFor(e) === "crooked-hollow"
              ? "hollow"
              : "scavenger"
            : Object.keys(CREATURE_RIG).find((n) => CREATURE_RIG[n] === e.rig);
        if (!name) continue;
        if (!rows.has(name))
          rows.set(name, { name, areaId, cycle, placementKey: e.placementKey, template: structuredClone(e) });
      }
    }
  return rows;
}
const ROWS = liveCreatureRows();

// ---------------------------------------------------------------------------------------------
// Harness: a real-geometry run fixture plus the real actors (contact / trace services).
// ---------------------------------------------------------------------------------------------
const previousDocument = globalThis.document;
// Canvas stand-in: the dog coat sampler reads the decoded RGBA the loader hands to drawImage.
globalThis.document = {
  createElement: () => {
    let image;
    return {
      getContext: () => ({
        drawImage(i) {
          image = i;
        },
        getImageData: () => ({ data: image?.data ?? new Uint8Array(4) }),
        createRadialGradient: () => ({ addColorStop() {} }),
        fillRect() {},
      }),
    };
  },
};
const models = new Map();
async function loadAsset(url) {
  const bytes = fs.readFileSync(new URL(url, assets)),
    gltf = await loadGeometry(bytes);
  if (url.endsWith("original-dog.glb")) {
    // Node has no image decoder: give the dog coat material its real decoded PNG as RGBA data. The GLB stores the coat as lossless
    // WebP (identical pixels); the fixture is the original PNG of the same image.
    const { PNG } = await import("pngjs"),
      material = { name: "Weathered brindle coat" },
      decoded = PNG.sync.read(fs.readFileSync(new URL("../fixtures/original-dog-coat.png", import.meta.url))),
      texture = new T.DataTexture(new Uint8Array(decoded.data), decoded.width, decoded.height, T.RGBAFormat);
    texture.colorSpace = T.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    gltf.scene.traverse((n) => {
      if (n.material?.name === material.name) n.material.map = texture;
    });
  }
  return gltf;
}
for (const [name, description] of Object.entries(manifest.models))
  models.set(name, {
    description,
    gltf: name === "vagrant-cleaver" ? models.get("vagrant").gltf : await loadAsset(description.url),
    equipment: description.equipment ? await loadAsset(description.equipment.url) : null,
  });
const sources = new Set([...models.values()].flatMap((m) => [m.gltf, m.equipment].filter(Boolean)));
after(() => {
  disposeActorSources(sources);
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});

const unit = (v) => {
  const n = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / n, z: v.z / n };
};
let nextId = 9000;

function arena({ areaId = "east-bridge", make, arm } = {}) {
  const f =
    make?.() ??
    (() => {
      const plain = fixture({ areaId });
      plain.restore();
      return plain;
    })();
  const scene = new T.Scene();
  Object.assign(f.world, {
    scene,
    camera: new T.PerspectiveCamera(),
    toRender: (p, y = 0) => new T.Vector3(p.x, y, -p.z),
  });
  const actors = createActors(scene, f.world, { models, manifest, dispose() {} }, { visualScale: 1.3225 });
  const ctx = { f, actors, creature: null, spot: null };
  const g = f.g;
  g.enemies = [];
  g.wave = 1;
  g.nextWave = Infinity;
  actors.update(g, 0);
  g.ratContact = actors.ratContact();
  const services = {
    dispatchPistol: f.p.dispatchPistol,
    dispatchRifle: f.p.dispatchRifle,
    dispatchBossEquipment: f.p.dispatchBossEquipment,
    dispatchMarshalPistol: f.p.dispatchMarshalPistol,
    dispatchFlame: f.p.dispatchFlame,
    railgunSource: (x) => actors.railgunSource(x),
    railgunAimPoint: (x, id) => actors.railgunAimPoint(x, id),
    railgunTrace: (x, a, b) => actors.railgunTrace(x, a, b) ?? [],
    sawContact: (x, a, v) => actors.sawContact(x, a, v) ?? false,
    rocketSource: (x) => actors.rocketSource(x),
    rocketAimHeight: (x, a, b, id) => actors.rocketAimHeight(x, a, b, id),
    grenadeSource: (x) => actors.grenadeSource(x),
    grenadeTrace: (x, a, b) => actors.grenadeTrace(x, a, b),
    grenadeFollow: (x, a, e) => actors.grenadeFollow(x, a, e),
    flameSource: () => actors.flameSource(),
    bossFlameSource: (a) => actors.flameSource(a.id),
    flameAimEligible: (x, t) => actors.flameAimEligible(x, t) ?? false,
  };
  ctx.services = services;
  ctx.step = (intent = {}) => {
    const run = f.g,
      e = ctx.creature;
    // Keep the player alive and the creature inert so only the player's attack can change its hp.
    run.player.hp = run.player.maxHP ?? run.player.hp;
    if (e && e.hp > 0) {
      // Never ready to attack; stagger and hit responses play out naturally.
      e.ready = 1e6;
      e.moveSpeed = 0;
      e.swing = null;
      run.player.hurtUntil = 0;
      if (ctx.spot) e.pos = { ...ctx.spot };
    }
    stepGame(run, intent, 1 / 60, services);
    f.p.persistRun(run);
    actors.events(run);
    actors.update(run, 1 / 60, 0, { presentationDt: 1 / 60 });
  };
  ctx.dispose = () => actors.dispose?.();
  arm?.(ctx);
  return ctx;
}

// Put a fresh copy of the creature row `gap` metres from the player on clear ground, in line of clear.
function place(ctx, row, gap) {
  const { f } = ctx,
    g = f.g,
    geometry = f.world.geometry;
  if (!ctx.anchor) ctx.anchor = { ...g.player.pos };
  // A fresh living copy of the row for every placement (a previous trial may have killed the last one).
  const e = (ctx.creature = structuredClone(row.template));
  e.id = nextId++;
  if (e.areaId !== undefined) e.areaId = f.world.areaId; // the row was initialised in its own area
  e.home = { ...ctx.anchor };
  e.patrol = [{ ...ctx.anchor }, { ...ctx.anchor }];
  g.enemies = [e];
  g.corpses = [];
  // Killing the last enemy ends the encounter; the next trial needs a live run again.
  Object.assign(g, { finished: false, won: false, encounterActive: true, encounterCleared: false });
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      player = { x: ctx.anchor.x + Math.cos(a) * gap, z: ctx.anchor.z + Math.sin(a) * gap };
    if (!geometry.clear(player, g.player.radius) || !f.world.lineClear(player, ctx.anchor)) continue;
    ctx.spot = { ...ctx.anchor };
    e.pos = { ...ctx.anchor };
    e.hp = e.maxHP;
    g.corpses = [];
    const toCreature = unit({ x: ctx.anchor.x - player.x, z: ctx.anchor.z - player.z });
    g.player.pos = player;
    g.player.facing = toCreature;
    e.facing = { x: -toCreature.x, z: -toCreature.z };
    const p = g.player;
    Object.assign(p, {
      swing: null,
      ready: 0,
      heavyReady: 0,
      specialReady: 0,
      buffer: null,
      hurtUntil: 0,
      stamina: 100,
    });
    return toCreature;
  }
  return null;
}

// Repeat one attack input every tick for up to `ticks`; report the first damage tick and the kill.
function spam(ctx, intentFor, ticks, stopOnHit = false) {
  const e = ctx.creature,
    start = e.hp,
    p = ctx.f.g.player,
    stance = { pos: { ...p.pos }, facing: { ...p.facing } };
  let first = null;
  for (let i = 0; i < ticks && e.hp > 0 && !(stopOnHit && e.hp < start); i++) {
    // Each new swing starts from the same stance; a swing's own step-in is left alone. Chained swings
    // never leave p.swing empty, so the stance also returns once the active frames are over.
    const spent = p.swing?.timing && p.swing.ageTicks >= p.swing.timing.windup + p.swing.timing.active;
    if (!p.swing || spent) {
      p.pos = { ...stance.pos };
      p.facing = { ...stance.facing };
    }
    p.stamina = 100;
    p.specialReady = 0; // Special's long cooldown is not under test; a kill must not depend on waiting it out
    ctx.step(intentFor(i));
    if (first === null && e.hp < start) first = i;
  }
  return { hit: e.hp < start, first, hp: e.hp, killed: e.hp <= 0 };
}

// Repeated attacks until dead, from the middle, nearest, farthest and quarter-way distances that damaged
// it (contact near the edge of reach can be hit-and-miss; any distance that kills counts).
function attemptKill(contextFor, row, reach, driveFor, ticks) {
  let last = { killed: false, hp: null, first: null };
  const picks = [0.5, 0, 1, 0.25, 0.75].map((f) => reach[Math.round(f * (reach.length - 1))]);
  for (const gap of new Set(picks)) {
    if (gap === undefined) break;
    const ctx = contextFor();
    last = spam(ctx, driveFor(ctx, place(ctx, row, gap)), ticks);
    if (last.killed) break;
  }
  return last;
}

// ---------------------------------------------------------------------------------------------
// Attack rows, derived from the weapon data rows. Each row says how to stand up a run holding the
// weapon (make/arm: the existing fixtures and dispatchers), what input drives one attack (drive),
// and how long to wait for a first hit / for a kill.
// ---------------------------------------------------------------------------------------------
const MELEE_ACTIONS = ["slash", "stab", "heavy", "special"];
const MELEE_GAPS = Array.from({ length: 20 }, (_, i) => Math.round((0.45 + i * 0.15) * 100) / 100);
const RANGED_GAPS = [1, 2, 3, 4.5, 6, 8];
const ATTACKS = [];
const bossFieldOf = (itemId) =>
  Object.keys(BOSS_EQUIPMENT_PROFILES).find((k) => BOSS_EQUIPMENT_PROFILES[k].itemId === itemId);

for (const [variant, row] of Object.entries(MELEE_VARIANTS)) {
  if (row.modelVariantId === "bone-saw") {
    // The saw is a held cut; Stab/Heavy/Special are consumed by the saw intent (boneSawIntent).
    ATTACKS.push({
      id: "bone-saw-cut",
      gaps: MELEE_GAPS,
      scanTicks: 110,
      killTicks: 1500,
      fresh: false,
      make: () => armedBossEquipment("surgicalKnife"),
      drive: (ctx, aim) => () => ({ held: ["slash"], aim }),
    });
    continue;
  }
  const prefix = variant === "knife" ? "knife" : "cleaver";
  for (const action of MELEE_ACTIONS)
    ATTACKS.push({
      id: `${prefix}-${action}`,
      gaps: MELEE_GAPS,
      scanTicks: 110,
      killTicks: action === "special" ? 4000 : 1500, // the slower Pommel needs longer to wear down 120 hp
      fresh: false,
      arm: (ctx) => {
        if (variant !== CLEAVER_ITEM_ID) return;
        const g = ctx.f.g,
          data = ctx.f.world.uniqueRewardData;
        g.uniqueReward = {
          version: 1,
          status: "owned",
          dropPosition: null,
          rewardReceipt: data.receiptId,
          selectedMeleeVariant: variant,
        };
        syncMeleeEquipment(g);
      },
      drive: (ctx, aim) => () => ({ actions: [action], aim }),
    });
}

const rangedCatalogRows = Object.values(RANGED_WEAPON_CATALOG);
const rangedRows = [...rangedCatalogRows, BOSS_EQUIPMENT_PROFILES.emberProjector];
for (const row of rangedRows) {
  const field = bossFieldOf(row.itemId),
    gaps = RANGED_GAPS.filter((gap) => gap <= row.rules.range * 1.5),
    // Hitscan weapons resolve on the first tick; projectiles, flames and charges need longer.
    // Launchers, grenades and the railgun carry only a handful of rounds: a fresh run per distance.
    base = {
      gaps,
      scanTicks: ["pistol", "rifle", "shotgun"].includes(field ?? row.weaponKey) ? 100 : 150,
      killTicks: 2400,
      fresh: ["rocketLauncher", "grenade", "commanderPistol"].includes(field),
    };
  if (row.itemId === PISTOL_ITEM_ID)
    ATTACKS.push({
      ...base,
      id: "pistol-fire",
      areaId: "westminster",
      arm: (ctx) => {
        const g = ctx.f.g;
        g.player.pos = { ...g.pistol.pickupPos };
        ctx.step({ actions: ["pickup"] });
        assert.equal(g.pistol.equipped, true);
      },
      drive: (ctx, aim) => () => ({ actions: ["fire"], aim }),
    });
  else if (row.itemId === RIFLE_ITEM_ID)
    ATTACKS.push({
      ...base,
      id: "rifle-fire",
      make: () => {
        const f = armedRifle();
        f.g.rifleAssetReady = true;
        return f;
      },
      drive: (ctx, aim) => () => ({ actions: ["fire"], aim }),
    });
  else if (field === "shotgun" || field === "rocketLauncher")
    ATTACKS.push({
      ...base,
      id: `${field}-fire`,
      make: () => armedBossEquipment(field),
      drive: (ctx, aim) => () => ({
        actions: ["fire"],
        aim,
        aimPoint: { ...ctx.creature.pos },
        aimTargetId: ctx.creature.id,
      }),
    });
  else if (field === "grenade")
    ATTACKS.push({
      ...base,
      id: "grenade-throw",
      scanTicks: 200,
      make: () => armedBossEquipment(field),
      drive: (ctx, aim) => () => ({
        actions: ["fire"],
        aim,
        aimPoint: { ...ctx.creature.pos },
        aimTargetId: ctx.creature.id,
      }),
    });
  else if (field === "commanderPistol") {
    const chargeTicks = Math.ceil(row.charge.seconds * 60),
      cycle = chargeTicks + 14;
    // Without a selected target the shot flies level from the muzzle; selecting the target pitches it
    // at the posed body (railgunAimPoint), so both inputs are rows.
    for (const touch of [false, true])
      ATTACKS.push({
        ...base,
        id: touch ? "railgun-charged-shot-touch" : "railgun-charged-shot",
        scanTicks: cycle * 2,
        make: () => armedBossEquipment(field),
        drive: (ctx, aim) => (i) => {
          const k = i % cycle,
            e = { kind: "fire", lifetime: 1 + Math.floor(i / cycle) },
            target = ctx.creature;
          return {
            aim,
            ...(touch
              ? {
                  touchTargetSelection: {
                    id: target.id,
                    key: target.placementKey ?? String(target.id),
                    areaId: ctx.f.world.areaId,
                  },
                }
              : {}),
            actionEdges: {
              started: k === 0 ? [e] : [],
              held: k <= chargeTicks ? [e] : [],
              released: k === chargeTicks + 1 ? [e] : [],
            },
          };
        },
      });
  } else if (field === "emberProjector") {
    // Desktop: held Fire along the mouse aim. The flame only pitches down at a tap-selected target
    // (flameAimPose), so the touch input mode is a second row.
    ATTACKS.push({
      ...base,
      id: "ember-flame",
      make: () => armedBossEquipment(field),
      drive: (ctx, aim) => () => ({ held: ["fire"], aim }),
    });
    ATTACKS.push({
      ...base,
      id: "ember-flame-touch",
      make: () => armedBossEquipment(field),
      arm: (ctx) => {
        ctx.f.g.mobileAim = createMobileAimState(Math.atan2(ctx.f.g.player.facing.x, ctx.f.g.player.facing.z));
      },
      drive: (ctx, aim) => () => {
        const e = ctx.creature;
        return {
          mobile: true,
          held: ["fire"],
          touchTargetSelection: { id: e.id, key: e.placementKey ?? String(e.id), areaId: ctx.f.world.areaId },
        };
      },
    });
  } else throw Error("No arming recipe for weapon row " + row.itemId + ": add one to the creature attack matrix");
}

// ---------------------------------------------------------------------------------------------
// The matrix: every creature x every attack. Cell status: ok | no-hit | hit-no-kill.
// ---------------------------------------------------------------------------------------------
const ONLY = process.env.CAM_ONLY?.split(","); // debugging filters only; the committed run covers everything
const ONLY_ATTACK = process.env.CAM_ATTACK?.split(",");
const cells = new Map();

function measureCell(attack, row) {
  const contexts = [];
  const open = () => {
    const ctx = arena({ areaId: attack.areaId, make: attack.make, arm: attack.arm });
    contexts.push(ctx);
    return ctx;
  };
  const reach = [];
  let shared = null;
  for (const gap of attack.gaps) {
    // Ammunition-limited weapons get a fresh run per distance so a miss never starves the next one.
    const ctx = attack.fresh ? open() : (shared ??= open());
    const aim = place(ctx, row, gap);
    if (aim && spam(ctx, attack.drive(ctx, aim), attack.scanTicks, true).hit) reach.push(gap);
  }
  const kill = reach.length ? attemptKill(open, row, reach, attack.drive, attack.killTicks) : { killed: false };
  for (const ctx of contexts) ctx.dispose();
  return { hit: reach.length > 0, reach, killed: kill.killed, hpLeft: kill.hp };
}

const statusOf = (cell) => (!cell.hit ? "no-hit" : cell.killed ? "ok" : "hit-no-kill");

// CI shards by file, so the matrix is registered in `parts` thin test files: part k owns every attack whose
// index % parts === k. Part 0 also owns the coverage test. Cells, KNOWN_GAPS and assertions are unchanged.
export function defineMatrix(part, parts) {
  const mine = ATTACKS.filter((_, i) => i % parts === part);
  for (const attack of mine) {
    if (ONLY_ATTACK && !ONLY_ATTACK.includes(attack.id)) continue;
    test(`attack ${attack.id} against every creature`, { timeout: 900000 }, () => {
      const unexpected = [];
      for (const row of ROWS.values()) {
        if (ONLY && !ONLY.includes(row.name)) continue;
        const cell = measureCell(attack, row),
          id = `${row.name}/${attack.id}`,
          status = statusOf(cell);
        cells.set(id, { ...cell, status });
        console.log(
          "CELL",
          id,
          status,
          JSON.stringify({ n: cell.reach.length, lo: cell.reach[0], hi: cell.reach.at(-1), hpLeft: cell.hpLeft }),
        );
        if (Object.hasOwn(KNOWN_GAPS, id) ? status === "ok" : status !== "ok")
          unexpected.push(
            Object.hasOwn(KNOWN_GAPS, id) ? `${id} now passes: remove it from KNOWN_GAPS` : `${id}: ${status}`,
          );
      }
      assert.deepEqual(unexpected, []);
    });
  }

  if (part === 0)
    test("matrix covers every live creature and every weapon row", () => {
      assert.deepEqual([...ROWS.keys()].sort(), [...CREATURES].sort());
      for (const id of Object.keys(KNOWN_GAPS)) {
        const [creature, attack] = id.split("/");
        assert(
          CREATURES.includes(creature) && ATTACKS.some((a) => a.id === attack),
          `KNOWN_GAPS row ${id} names no cell`,
        );
      }
      console.log(
        "CREATURE_ROWS",
        JSON.stringify(
          [...ROWS.values()].map((r) => ({
            name: r.name,
            area: r.areaId,
            cycle: r.cycle,
            key: r.placementKey,
            lowStrike: rigCapability(r.template.rig, "lowStrike"),
          })),
        ),
      );
      console.log("ATTACK_ROWS", JSON.stringify(ATTACKS.map((a) => a.id)));
      if (ONLY || ONLY_ATTACK) return;
      assert.equal(
        cells.size,
        CREATURES.length * mine.length,
        "every creature x attack cell of this part was measured",
      );
      const tally = {};
      for (const cell of cells.values()) tally[cell.status] = (tally[cell.status] ?? 0) + 1;
      console.log(
        "MATRIX_SUMMARY",
        JSON.stringify({
          creatures: CREATURES.length,
          attacks: ATTACKS.length,
          cells: cells.size,
          ...tally,
          knownGaps: Object.keys(KNOWN_GAPS).length,
        }),
      );
    });
}
