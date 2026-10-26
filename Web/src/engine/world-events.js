// W0 of the multiplayer proof: every state change another player could see or own (move, engage, damage, death,
// drop, pickup, travel) becomes ONE typed, sequenced world event. Pure module: no DOM, no THREE, no clock, no random.
//
// The events are DERIVED at the seam. Nothing in combat.js or the item layers emits them; the journal reads the
// legacy per-step `g.events` list and the dispatch results the run already produces, and maps a whitelist of them.
// The legacy events and single-player behaviour are untouched: the journal only reads the run and never writes it.
//
// All payload values are ABSOLUTE (hp after the hit, positions, owner), so the reducer needs no game rules and the
// phone / presence can apply remote events with the same `applyWorldEvent`.
//
// KNOWN LIMIT (until 2a PR3-5 put every layer on the central path): the layers still outside it (flame, locker,
// marked, story, railgun, hub, reaper, expedition, progression) only enter through the legacy-event mapping below.
// Anything they change that has no mapped legacy event is not in the journal. Also not covered: hp that rises
// (health regeneration, dressings), actors that appear mid-area without a spawn event, consumable supply drops and
// vest pickups (no drop event exists), marked hunters (their keys come from the process-local id), actors without a
// placementKey (the legacy opening group), floor items of layers with no drop event (the base flamethrower), hits
// whose weapon is not in WEAPON_IDS (the reaper): their weaponId is null.
import { PISTOL_ITEM_ID } from "../core/pistol-operation.js";
import { GAME_DATA } from "./game-data.js";
import { RIFLE_PROFILE, RANGED_WEAPON_CATALOG } from "./weapon-catalog.js";
import { BOSS_EQUIPMENT_PROFILES, EMBER_PROJECTOR_PROFILE } from "./boss-equipment-data.js";
import { UNIQUE_REWARDS } from "./unique-reward-runtime.js";
import { MELEE_VARIANTS } from "./melee-equipment-data.js";
import { BONE_SAW_RULES } from "./bone-saw.js";
import { creatureCatalogue, animalFoundationParameters } from "./creature-catalogue.js";
import { creatureDefinitions } from "./creature-definitions.js";
import { populationPlacements, populationAllowsDrone } from "./area-population.js";
import { AREA_DRONE_SPAWNS } from "../area-drone-spawns.js";
import { AREA_MOB_SPAWNS, residentEncounterHealth } from "../area-mob-spawns.js";
import { KNIFE_MOVES } from "../donor/knife.js";
import { WOLF_BITE } from "../wolf-native.js";
import { SALAMANDER_BITE } from "../salamander-native.js";
import { DRONE_RULES } from "../drone-mechanics.js";
import { RAT_BITE, DOG_BITE, ROACH_BITE } from "../combat.js";

// The game steps at a fixed 60 Hz (stepGame refuses any other dt); tests pin this against the real step.
export const TICK_HZ = 60;

// The drone is the one creature foundation whose weapon is the bolt (read from the catalogue rows, not named here).
const DRONE_FOUNDATION = creatureDefinitions.find((d) => d.stats.weapon === "bolt").id;

export const WORLD_EVENT_RULES = Object.freeze({
  playerKey: "player",
  // Positions, headings and hp are rounded to 1/quantum so a live value and its event always compare equal.
  quantum: 1000,
  // `move` is sent on change, at most once per this many ticks per actor (15 Hz at the 60 Hz step).
  moveEveryTicks: GAME_DATA.worldEvents.rules.moveEveryTicks,
  // The session keeps the newest events only; a replay from empty needs `retain: Infinity`.
  retainEvents: GAME_DATA.worldEvents.rules.retainEvents,
  // The journal is trimmed back to `retainEvents` once it holds this many times that.
  compactFactor: GAME_DATA.worldEvents.rules.compactFactor,
  // Every actor, instance and item key on the wire.
  keyPattern: /^[a-z0-9._:-]{1,96}$/,
});

// The closed set. A world event is { seq, tick, areaId, serverTime, type, ...exactly these fields }.
// `areaId` is the area the event happened in (the destination for travel). `serverTime` is null until a server stamps it.
export const WORLD_EVENT_FIELDS = Object.freeze({
  move: ["actorKey", "pos", "heading", "state", "flags", "attackClass", "weaponId"],
  engage: ["instance", "sourceKey", "targetKey", "generation"],
  hit: ["targetKey", "sourceKey", "amount", "hpAfter", "weaponId", "attackClass", "sourcePos"],
  death: ["targetKey", "pos"],
  drop: ["itemId", "pos", "sourceKey", "ownerId", "mode"],
  pickup: ["itemId", "ownerKey", "ownerId", "mode"],
  // roster: [{ actorKey, pos, hp, alive }] for the arrival area, so the reducer needs no spawn rules.
  travel: ["actorKey", "fromAreaId", "pos", "roster"],
  // Remote presence lifecycle: the local journal never emits these; the reducer applies them.
  appear: ["actorKey", "pos", "facing", "modelRef", "appearanceRef", "weaponId"],
  leave: ["actorKey"],
  // Authoritative creature state from a server: never emitted by the phone; the reducer applies it as truth.
  spawn: ["instance", "hp", "maxHp", "alive", "generation"],
});
export const WORLD_EVENT_TYPES = Object.freeze(Object.keys(WORLD_EVENT_FIELDS));
// Numeric wire codes are table positions (1-based; 0 = none), so adding a row at the end never renumbers.
const codes = (names) => Object.freeze(Object.fromEntries(names.map((name, i) => [name, i + 1])));
export const WORLD_EVENT_CODES = codes(WORLD_EVENT_TYPES);
export const MOVE_STATES = Object.freeze(["idle", "walk", "run", "attack", "dodge", "guard", "hurt", "dead"]);
export const MOVE_STATE_CODES = codes(MOVE_STATES);
export const MOVE_FLAGS = Object.freeze({ swinging: 1, dead: 2, carrying: 4, exhausted: 8 }); // tuning-ok: wire bit flags
export const ATTACK_CLASSES = Object.freeze(["slash", "stab", "heavy", "shot"]);
export const ATTACK_CLASS_CODES = codes(ATTACK_CLASSES);
// The weapon strings a hit can carry. weaponRules() returns exactly these keys.
export const WEAPON_IDS = Object.freeze([
  "knife",
  "teeth",
  "bone-saw",
  "pistol",
  "rifle",
  "shotgun",
  "grenade",
  "rocket",
  "railgun",
  "flamethrower",
  "bolt",
]);
export const WEAPON_CODES = codes(WEAPON_IDS);
export const DROP_MODES = Object.freeze(["local", "server"]);

// Legacy event types that become world events (Web/src/data/worldEvents.json). Everything else is presentation or per-player state.
export const LEGACY_DROP_EVENTS = new Set(GAME_DATA.worldEvents.legacyDropEvents);
export const LEGACY_PICKUP_EVENTS = GAME_DATA.worldEvents.legacyPickupEvents;

const PLAYER = WORLD_EVENT_RULES.playerKey;
const STATE = MOVE_STATE_CODES;
// Maps, not object lookups: a weapon string from game data must never hit Object.prototype.
const WEAPON_BY_NAME = new Map(Object.entries(WEAPON_CODES));
const ATTACK_CLASS_BY_NAME = new Map(Object.entries(ATTACK_CLASS_CODES));
const EMPTY = Object.freeze([]);
const q = (n) => Math.round(n * WORLD_EVENT_RULES.quantum) / WORLD_EVENT_RULES.quantum + 0;
const qPoint = (p) => ({ x: q(p.x), z: q(p.z) });
const finitePoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const emptyView = () => ({ areaId: null, actors: {}, drops: {} });
const dropped = (areaId, p, mode = "local", ownerId = null) => ({
  status: "dropped",
  areaId,
  x: q(p.x),
  z: q(p.z),
  ownerKey: null,
  ownerId,
  mode,
});
const owned = (ownerKey, ownerId = null, mode = "local") => ({
  status: "owned",
  areaId: null,
  x: null,
  z: null,
  ownerKey,
  ownerId,
  mode,
});
const nameOf = (names, code) => (code > 0 ? names[code - 1] : null);

/** "player" is the LOCAL player only; a remote player's events carry a server-assigned key. */
export const isLocalActorKey = (key) => key === PLAYER;
export const instanceKey = (areaId, placementKey) => areaId + ":" + placementKey;

// An actor's key, cached per object: creatures keep their area for life, so the prefix never goes stale.
const keys = new WeakMap();
export function actorKey(g, actor) {
  if (!actor) return null;
  if (actor === g.player) return PLAYER;
  let key = keys.get(actor);
  if (key === undefined) {
    key =
      typeof actor.placementKey === "string" && !actor.markedHunter && g.world.areaId
        ? instanceKey(g.world.areaId, actor.placementKey)
        : null;
    keys.set(actor, key);
  }
  return key;
}

function actorRows(g) {
  const rows = new Map();
  for (const actor of [g.player, ...(g.enemies ?? []), ...(g.corpses ?? [])]) {
    const key = actorKey(g, actor);
    if (key && !rows.has(key) && finitePoint(actor.pos))
      rows.set(key, { actorKey: key, pos: qPoint(actor.pos), hp: Math.max(0, q(actor.hp)), alive: actor.hp > 0 });
  }
  return [...rows.values()].sort((a, b) => (a.actorKey < b.actorKey ? -1 : 1));
}

// Item states owned by the existing layers: pending = on the floor, owned = collected.
function itemRows(g) {
  const rows = [];
  const add = (itemId, areaId, state) =>
    state && rows.push({ itemId, areaId, status: state.status, at: state.dropPosition });
  if (g.pistol)
    add(PISTOL_ITEM_ID, g.pistol.pickupAreaId, {
      status: g.pistol.collected ? "owned" : "pending",
      dropPosition: g.pistol.pickupPos,
    });
  add(RIFLE_PROFILE.itemId, RIFLE_PROFILE.source.areaId, g.rifle);
  for (const [field, state] of Object.entries(g.bossEquipment ?? {}))
    if (BOSS_EQUIPMENT_PROFILES[field])
      add(BOSS_EQUIPMENT_PROFILES[field].itemId, BOSS_EQUIPMENT_PROFILES[field].source.areaId, state);
  for (const reward of Object.values(UNIQUE_REWARDS)) add(reward.itemId, reward.areaId, g.uniqueReward);
  if (g.world.flameData?.pickupId && g.flameFuel?.collected)
    rows.push({ itemId: g.world.flameData.pickupId, areaId: null, status: "owned", at: null });
  return rows.sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
}

/** The shared-visible state of the live run, in the same shape the reducer builds from events. */
export function projectWorld(g) {
  const view = emptyView();
  view.areaId = g.world.areaId ?? null;
  for (const a of actorRows(g)) view.actors[a.actorKey] = { x: a.pos.x, z: a.pos.z, hp: a.hp, alive: a.alive };
  for (const it of itemRows(g)) {
    if (it.status === "pending" && finitePoint(it.at)) view.drops[it.itemId] = dropped(it.areaId, it.at);
    else if (it.status === "owned") view.drops[it.itemId] = owned(PLAYER);
  }
  return view;
}

/** The reducer. Mutates and returns `view`. Throws on a type outside the closed set. */
export function applyWorldEvent(view, e) {
  switch (e.type) {
    case "travel":
      view.areaId = e.areaId;
      view.actors = {};
      for (const a of e.roster) view.actors[a.actorKey] = { x: a.pos.x, z: a.pos.z, hp: a.hp, alive: a.alive };
      break;
    case "move":
      view.actors[e.actorKey] = { hp: null, alive: true, ...view.actors[e.actorKey], x: e.pos.x, z: e.pos.z };
      break;
    case "hit":
      view.actors[e.targetKey] = { x: null, z: null, alive: true, ...view.actors[e.targetKey], hp: e.hpAfter };
      break;
    case "death":
      view.actors[e.targetKey] = { ...view.actors[e.targetKey], x: e.pos.x, z: e.pos.z, hp: 0, alive: false };
      break;
    case "drop":
      view.drops[e.itemId] = dropped(e.areaId, e.pos, e.mode, e.ownerId);
      break;
    case "pickup":
      view.drops[e.itemId] = owned(e.ownerKey, e.ownerId, e.mode);
      break;
    case "appear":
      view.actors[e.actorKey] = { x: e.pos.x, z: e.pos.z, hp: null, alive: true };
      break;
    case "leave":
      delete view.actors[e.actorKey];
      break;
    case "spawn": {
      // Server truth: hp, alive and the generation replace whatever the phone predicted.
      const known = view.actors[e.instance];
      view.actors[e.instance] = {
        x: known?.x ?? null,
        z: known?.z ?? null,
        hp: e.hp,
        alive: e.alive,
        maxHp: e.maxHp,
        generation: e.generation,
      };
      break;
    }
    case "engage":
      break;
    default:
      throw TypeError("Unknown world event type " + e.type);
  }
  return view;
}

/** Rebuild the view from nothing but the events. */
export function replayWorld(events) {
  const view = emptyView();
  for (const e of events) applyWorldEvent(view, e);
  return view;
}

const KEY_FIELDS = ["actorKey", "sourceKey", "targetKey", "instance", "ownerKey", "itemId"];
/** Exact field check for one event; the journal and the tests both use it. */
export function validateWorldEvent(e) {
  const fields = WORLD_EVENT_FIELDS[e?.type];
  if (!fields) return false;
  const names = Object.keys(e).sort().join(",");
  return (
    Number.isInteger(e.seq) &&
    Number.isInteger(e.tick) &&
    typeof e.areaId === "string" &&
    WORLD_EVENT_RULES.keyPattern.test(e.areaId) &&
    e.serverTime === null &&
    names === ["seq", "tick", "areaId", "serverTime", "type", ...fields].sort().join(",") &&
    KEY_FIELDS.every((f) => !(f in e) || e[f] === null || WORLD_EVENT_RULES.keyPattern.test(e[f]))
  );
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw TypeError("Non-finite number in world view");
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k]))
      .join(",") +
    "}"
  );
}

/** FNV-1a (32 bit) over the canonical JSON, as 8 hex digits. */
export function worldDigest(view) {
  const text = canonicalJson(view);
  let h = 0x811c9dc5; // tuning-ok: FNV-1a offset basis
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193); // tuning-ok: FNV-1a prime
  return (h >>> 0).toString(16).padStart(8, "0"); // tuning-ok: 8 hex digits of a 32-bit hash
}

// ---------------------------------------------------------------------------------------------
// Rules derived from the game's own tables, for a server to check events against.
// ---------------------------------------------------------------------------------------------

/**
 * Per weapon: the largest damage a single hit can carry, the highest hit rate and the longest reach, read from the
 * real tables (knife and melee-variant moves, creature bites, bone saw, ranged catalogue, Ember Projector, drone).
 * A field is null where the code has no value for it. The values are the TABLE values: progression bonuses
 * (effectiveWeaponDamage) are applied at hit time and are not in the tables. The reaper has no weaponId (null).
 */
export function weaponRules() {
  const rows = new Map(
    WEAPON_IDS.map((id) => [id, { weaponId: id, maxDamagePerHit: null, maxHitsPerS: null, reachM: null }]),
  );
  const add = (id, damage, hitsPerS, reach) => {
    const row = rows.get(id);
    if (!row) return;
    for (const [field, value] of [
      ["maxDamagePerHit", damage],
      ["maxHitsPerS", hitsPerS],
      ["reachM", reach],
    ])
      if (Number.isFinite(value)) row[field] = Math.max(row[field] ?? -Infinity, value);
  };
  const move = (id, m) => add(id, m.damage, TICK_HZ / (m.windupTicks + m.activeTicks + m.recoveryTicks), m.range);
  for (const m of Object.values(KNIFE_MOVES)) move("knife", m);
  for (const variant of Object.values(MELEE_VARIANTS))
    for (const m of Object.values(variant.moves ?? {})) move("knife", m);
  for (const bite of [RAT_BITE, DOG_BITE, ROACH_BITE, WOLF_BITE, SALAMANDER_BITE]) move("teeth", bite);
  add("bone-saw", BONE_SAW_RULES.damage, 1 / BONE_SAW_RULES.interval, BONE_SAW_RULES.range);
  // The Arc Gun's reach is its first-body range plus every hop. Its rate stays 1 / cadence: the server's rate is per spawn (per
  // engagement) and a chain hits each body at most once per shot, so the extra bodies of one shot do not raise it.
  for (const row of Object.values(RANGED_WEAPON_CATALOG))
    add(
      row.weaponKey,
      row.rules.damage,
      1 / row.rules.cadence,
      row.rules.range + (row.arc?.jumps ?? 0) * (row.arc?.hopRange ?? 0),
    );
  const ember = EMBER_PROJECTOR_PROFILE.rules;
  add("flamethrower", ember.damage, 1 / ember.interval, ember.range);
  add(
    "bolt",
    DRONE_RULES.damage,
    1 / (DRONE_RULES.warningSeconds + DRONE_RULES.recoverySeconds),
    DRONE_RULES.boltRange,
  );
  return [...rows.values()];
}

/**
 * One row per placed creature of the shipped content for a species cycle ("A" or "B"):
 * { instance, kind, area, maxHp, respawnS, lootKind, reach }. `kind` is the runtime rig the game spawns.
 * respawnS is null for every row (the game has no respawn). lootKind is the loot table of a placement that has a
 * rule, else null. reach: native animals use their contact reach, scavengers the longest knife move, bosses their
 * longest attack, the drone its bolt range.
 */
export function worldSpawnRows(content, cycle = "A") {
  const rows = [],
    areas = new Set([
      ...Object.keys(AREA_MOB_SPAWNS),
      ...Object.keys(AREA_DRONE_SPAWNS),
      ...Object.keys(content.residents ?? {}),
    ]),
    knifeReach = Math.max(...Object.values(KNIFE_MOVES).map((m) => m.range));
  for (const area of [...areas].sort()) {
    const canonical = content.residents?.[area] ?? AREA_MOB_SPAWNS[area] ?? [];
    const placed = populationPlacements(content.populationData, area, cycle, canonical),
      // Extra drones, as initializeAreaResidents adds them.
      drones = (AREA_DRONE_SPAWNS[area] ?? [])
        .filter(
          (d) =>
            populationAllowsDrone(content.populationData, area, d.key) &&
            !placed.some((p) => p.foundationRef === DRONE_FOUNDATION && p.key === d.key),
        )
        .map((d) => ({ ...d, foundationRef: DRONE_FOUNDATION }));
    for (const row of [...placed, ...drones]) {
      const foundationRef = row.foundationRef ?? "hollow-scavenger",
        foundation = creatureCatalogue.get(foundationRef),
        boss = row.bossRef ? content.bossData?.profiles[row.bossRef] : null;
      let reach = knifeReach;
      if (boss) reach = Math.max(...Object.values(boss.attacks ?? {}).map((a) => a.range), boss.weapon?.range ?? 0);
      else if (foundation.runtimeIdentity === DRONE_FOUNDATION) reach = DRONE_RULES.boltRange;
      else if (foundation.runtimeIdentity !== "hollow-scavenger")
        reach = animalFoundationParameters(foundationRef, 1).contactGoalReach;
      rows.push({
        instance: instanceKey(area, row.key),
        kind: boss ? boss.modelRef : foundation.runtimeIdentity,
        area,
        maxHp: boss ? boss.health : residentEncounterHealth(row, foundation.stats.health),
        respawnS: null,
        lootKind: content.lootRules?.[row.key]?.tableRef ?? null,
        reach,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The journal.
// ---------------------------------------------------------------------------------------------

/**
 * The journal of one run. `ingest` is the only way events get in and `record` is the only place `seq` is assigned.
 * ingest(g, legacyEvents, dispatchResults):
 *   legacyEvents    the step's g.events (an array = a step boundary: area change and `move` sampling run), or null
 *                   for a dispatch-only call mid-step (no sampling);
 *   dispatchResults [{ command, result }] as returned by the run's dispatchers.
 * A different `g` starts a new journal epoch (new run): events and seq restart, with an arrival `travel`.
 * A step in which nothing happened allocates nothing.
 */
export function createJournal({ retain = WORLD_EVENT_RULES.retainEvents } = {}) {
  let events = [],
    seq = 0,
    view = emptyView(),
    run = null,
    tick = 0,
    area = null;
  // actor -> last sent values and the previous sample (numbers only, so a quiet step allocates nothing).
  const records = new Map(),
    engaged = new Set();

  function record(type, payload, areaId = area) {
    const e = { seq: seq + 1, tick, areaId, serverTime: null, type, ...payload };
    if (!validateWorldEvent(e)) throw TypeError("Malformed world event " + type);
    seq = e.seq;
    applyWorldEvent(view, e);
    events.push(e);
    if (events.length >= retain * WORLD_EVENT_RULES.compactFactor) events = events.slice(-retain);
    return e;
  }
  function find(g, id) {
    return [...(g.enemies ?? []), ...(g.corpses ?? [])].find((a) => a.id === id) ?? null;
  }
  // The dead actor nearest to a drop is its source (drops are placed at the corpse).
  function nearestCorpse(g, p) {
    const dead = [...(g.enemies ?? []), ...(g.corpses ?? [])]
      .filter((a) => a.hp <= 0 && actorKey(g, a) && finitePoint(a.pos))
      .map((a) => ({ key: actorKey(g, a), d: Math.hypot(a.pos.x - p.x, a.pos.z - p.z) }))
      .sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : 1));
    return dead[0]?.key ?? null;
  }

  // What `move` carries, measured into the record's n* fields without allocating.
  function measure(g, actor, rec) {
    rec.nx = q(actor.pos.x);
    rec.nz = q(actor.pos.z);
    rec.nh = q(Math.atan2(actor.facing?.x ?? 0, actor.facing?.z ?? 0));
    const moved = rec.nx !== rec.px || rec.nz !== rec.pz;
    rec.ns = actor.swing
      ? STATE.attack
      : g.time < actor.dodgeUntil
        ? STATE.dodge
        : actor.guarding
          ? STATE.guard
          : g.time < actor.hurtUntil
            ? STATE.hurt
            : moved
              ? actor.running
                ? STATE.run
                : STATE.walk
              : STATE.idle;
    rec.nf =
      (actor.swing ? MOVE_FLAGS.swinging : 0) |
      (actor.hp <= 0 ? MOVE_FLAGS.dead : 0) |
      (actor.stamina <= 0 ? MOVE_FLAGS.exhausted : 0);
    rec.na = (rec.ns === STATE.attack && ATTACK_CLASS_BY_NAME.get(actor.swing?.action)) || 0;
    rec.nw = WEAPON_BY_NAME.get(actor.weapon) || 0;
  }
  const differs = (r) =>
    r.nx !== r.x || r.nz !== r.z || r.nh !== r.h || r.ns !== r.s || r.nf !== r.f || r.na !== r.a || r.nw !== r.w;
  function adopt(rec) {
    rec.x = rec.nx;
    rec.z = rec.nz;
    rec.h = rec.nh;
    rec.s = rec.ns;
    rec.f = rec.nf;
    rec.a = rec.na;
    rec.w = rec.nw;
  }
  function track(g, actor, key) {
    const rec = {
      key,
      x: 0,
      z: 0,
      h: 0,
      s: 0,
      f: 0,
      a: 0,
      w: 0,
      nx: 0,
      nz: 0,
      nh: 0,
      ns: 0,
      nf: 0,
      na: 0,
      nw: 0,
      px: q(actor.pos.x),
      pz: q(actor.pos.z),
      tick: -Infinity,
    };
    measure(g, actor, rec);
    adopt(rec);
    records.set(actor, rec);
    return rec;
  }
  function enter(g) {
    records.clear();
    for (const actor of [g.player, ...(g.enemies ?? [])]) {
      const key = actorKey(g, actor);
      if (key && finitePoint(actor.pos)) track(g, actor, key);
    }
    record("travel", {
      actorKey: PLAYER,
      fromAreaId: view.areaId,
      pos: qPoint(g.player.pos),
      roster: actorRows(g),
    });
  }
  function begin(g) {
    events = [];
    seq = 0;
    view = emptyView();
    run = g;
    engaged.clear();
    enter(g);
    // Items already on the floor or owned when the journal starts.
    for (const [itemId, d] of Object.entries(projectWorld(g).drops))
      if (d.status === "dropped")
        record("drop", { itemId, pos: { x: d.x, z: d.z }, sourceKey: null, ownerId: null, mode: "local" }, d.areaId);
      else record("pickup", { itemId, ownerKey: d.ownerKey, ownerId: null, mode: "local" });
  }
  function mapDrop(g, ev) {
    if (typeof ev.itemId !== "string" || typeof ev.areaId !== "string" || !finitePoint(ev.position)) return;
    const have = view.drops[ev.itemId],
      pos = qPoint(ev.position);
    if (have?.status === "dropped" && have.areaId === ev.areaId && have.x === pos.x && have.z === pos.z) return;
    record(
      "drop",
      { itemId: ev.itemId, pos, sourceKey: nearestCorpse(g, pos), ownerId: null, mode: "local" },
      ev.areaId,
    );
  }
  function mapPickup(ev) {
    const itemId = ev[LEGACY_PICKUP_EVENTS[ev.type]];
    if (typeof itemId !== "string") return;
    const have = view.drops[itemId];
    if (have?.status === "owned" && have.ownerKey === PLAYER) return;
    record("pickup", { itemId, ownerKey: PLAYER, ownerId: null, mode: "local" });
  }
  function mapHit(g, ev, hpAfter) {
    const targetKey = actorKey(g, ev.actor);
    if (!targetKey || !Number.isFinite(ev.amount)) return;
    const attacker = ev.attackerId != null ? find(g, ev.attackerId) : null,
      source = ev.actor === g.player ? attacker : ev.attackerId != null ? attacker : g.player,
      sourceKey = actorKey(g, source),
      pair = [sourceKey, targetKey].sort().join(">");
    if (sourceKey && !engaged.has(pair)) {
      engaged.add(pair);
      record("engage", {
        instance: targetKey === PLAYER ? sourceKey : targetKey,
        sourceKey,
        targetKey,
        generation: null,
      });
    }
    const weapon = ev.weapon ?? (source === g.player ? g.player.weapon : null);
    record("hit", {
      targetKey,
      sourceKey,
      amount: q(ev.amount),
      hpAfter,
      weaponId: WEAPON_BY_NAME.has(weapon) ? weapon : null,
      attackClass: ev.attackClass ?? null,
      sourcePos: finitePoint(source?.pos) ? qPoint(source.pos) : null,
    });
  }
  function mapLegacy(g, legacy) {
    if (legacy.length === 0) return;
    // hpAfter per hit: the actor's hp at the end of the step, walked back through the step's later hits.
    const after = new Map(),
      running = new Map();
    for (let i = legacy.length - 1; i >= 0; i--) {
      const ev = legacy[i];
      if (ev?.type !== "hit" || !ev.actor) continue;
      const hp = running.has(ev.actor) ? running.get(ev.actor) : Math.max(0, ev.actor.hp);
      after.set(ev, q(hp));
      running.set(ev.actor, hp + (Number.isFinite(ev.amount) ? ev.amount : 0));
    }
    for (const ev of legacy) {
      if (ev?.type === "hit") mapHit(g, ev, after.get(ev));
      else if (ev?.type === "death") {
        const targetKey = actorKey(g, ev.actor);
        if (targetKey && view.actors[targetKey]?.alive !== false && finitePoint(ev.actor.pos))
          record("death", { targetKey, pos: qPoint(ev.actor.pos) });
      } else mapStateEvents(g, [ev]);
    }
  }
  // Drops and pickups arrive both in the step's g.events and in dispatch results; the journal state dedupes them.
  function mapStateEvents(g, list) {
    for (const ev of list)
      if (LEGACY_DROP_EVENTS.has(ev?.type)) mapDrop(g, ev);
      else if (ev && Object.hasOwn(LEGACY_PICKUP_EVENTS, ev.type)) mapPickup(ev);
  }
  function sample(g, actor) {
    let rec = records.get(actor);
    if (rec === undefined) {
      const key = actorKey(g, actor);
      if (!key || !finitePoint(actor.pos)) return;
      // A creature that appeared after arrival: send it at once.
      rec = track(g, actor, key);
      rec.x = NaN;
    } else measure(g, actor, rec);
    if (differs(rec) && tick - rec.tick >= WORLD_EVENT_RULES.moveEveryTicks) {
      adopt(rec);
      rec.tick = tick;
      record("move", {
        actorKey: rec.key,
        pos: { x: rec.x, z: rec.z },
        heading: rec.h,
        state: nameOf(MOVE_STATES, rec.s),
        flags: rec.f,
        attackClass: nameOf(ATTACK_CLASSES, rec.a),
        weaponId: nameOf(WEAPON_IDS, rec.w),
      });
    }
    rec.px = rec.nx;
    rec.pz = rec.nz;
  }
  function ingest(g, legacyEvents = null, dispatchResults = EMPTY) {
    if (!g?.world || !g.player) return;
    tick = g.tick ?? tick;
    area = g.world.areaId ?? null;
    if (g !== run) begin(g);
    else if (legacyEvents !== null && area !== view.areaId) enter(g);
    for (let i = 0; i < dispatchResults.length; i++)
      if (dispatchResults[i].result?.ok) mapStateEvents(g, dispatchResults[i].result.events ?? EMPTY);
    if (legacyEvents === null) return;
    mapLegacy(g, legacyEvents);
    if (g.player.hp > 0) sample(g, g.player);
    const enemies = g.enemies;
    if (enemies) for (let i = 0; i < enemies.length; i++) if (enemies[i].hp > 0) sample(g, enemies[i]);
  }
  return {
    ingest,
    get events() {
      return events;
    },
    get view() {
      return view;
    },
    get lastSeq() {
      return seq;
    },
    digest: () => worldDigest(view),
    /** How many actors have a change still waiting for the move rate cap. */
    pending(g) {
      let n = 0;
      for (const actor of [g.player, ...(g.enemies ?? [])]) {
        const rec = records.get(actor);
        if (rec && actor.hp > 0) {
          measure(g, actor, rec);
          if (differs(rec)) n++;
        }
      }
      return n;
    },
  };
}

/**
 * Wrap a run's dispatchers so their results reach the journal. The result is returned unchanged; a dispatcher that
 * the persistence object does not have is skipped. Used where the session builds its persistence (run-views.js).
 */
export function withWorldJournal(persistence, session, names = WORLD_DISPATCHERS) {
  const wrapped = { ...persistence };
  for (const name of names)
    if (typeof persistence[name] === "function")
      wrapped[name] = (g, command, ...rest) => {
        const result = persistence[name](g, command, ...rest);
        session.worldJournal?.ingest(g, null, [{ command, result }]);
        return result;
      };
  return wrapped;
}
export const WORLD_DISPATCHERS = GAME_DATA.worldEvents.dispatchers;
