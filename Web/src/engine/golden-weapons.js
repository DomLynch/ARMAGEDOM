import { GAME_DATA, fillText } from "./game-data.js";
import { freshMarked } from "./marked.js";
// Golden weapons (data/goldenWeapons.json): a rare cosmetic gold skin for a gun the player owns. Same stats; only the look changes.
// The unlocked set is saved as `marked.golden` (a list of weapon keys). Once unlocked the skin is always on (no Gear toggle).
const GOLD = GAME_DATA.goldenWeapons;
export const GOLDEN_WEAPON_OUTCOME = GOLD.outcomeId;
const read = (root, path) => path.reduce((node, key) => node?.[key], root);

export const goldenKeys = (g) => g?.marked?.golden ?? [];
export const isGolden = (g, key) => goldenKeys(g).includes(key);
/** The weapon key a tile / item id belongs to, or null when that weapon has no golden variant. */
export const goldenKeyOfItem = (itemId) => Object.keys(GOLD.weapons).find((key) => GOLD.weapons[key].itemId === itemId) ?? null;
export const isGoldenItem = (g, itemId) => {
  const key = goldenKeyOfItem(itemId);
  return key !== null && isGolden(g, key);
};
/** Weapon keys the player owns, in data order. */
export const ownedGoldenCandidates = (g) =>
  Object.keys(GOLD.weapons).filter((key) => {
    const { path, equals } = GOLD.weapons[key].owned;
    return read(g, path) === equals;
  });

/**
 * The golden-weapon outcome, as a plan that changes nothing: `roll` is a number in [0, 1) from the caller's own (seeded) random.
 * Picks an owned gun that is not gold yet; when every owned gun is gold (or none is owned) it pays the fallback cash instead.
 * Returns { kind: "golden", weaponKey, marked, text } or { kind: "cash", amount, marked, text }; `marked` is the next saved Marked state.
 */
export function planGoldenWeapon(g, roll) {
  const marked = g.marked ?? freshMarked(),
    have = goldenKeys(g),
    pool = ownedGoldenCandidates(g).filter((key) => !have.includes(key));
  if (pool.length) {
    const weaponKey = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, roll) * pool.length))];
    return {
      kind: "golden",
      weaponKey,
      marked: { ...marked, golden: [...have, weaponKey] },
      text: fillText(GOLD.text.unlocked, { name: GOLD.weapons[weaponKey].name }),
    };
  }
  const max = g.world?.markedData?.maxMoney ?? Infinity,
    amount = Math.max(0, Math.min(GOLD.fallbackCash, max - marked.carried));
  return {
    kind: "cash",
    amount,
    marked: { ...marked, carried: marked.carried + amount },
    text: fillText(GOLD.text.cashFallback, { amount }),
  };
}
/** Applies the outcome to the live run: new Marked state, a toast, an event. The normal autosave then stores it. */
export function grantGoldenWeapon(g, roll) {
  const plan = planGoldenWeapon(g, roll);
  g.marked = plan.marked;
  g.message = plan.text;
  g.messageUntil = (g.time ?? 0) + GOLD.noticeSeconds;
  g.events?.push({ type: GOLDEN_WEAPON_OUTCOME, kind: plan.kind, weaponKey: plan.weaponKey ?? null, amount: plan.amount ?? 0 });
  return plan;
}
/** The star and word a golden gun's Gear tile shows (data text). */
export const goldenTileMarks = () => ({ marker: GOLD.text.marker, label: GOLD.text.goldTileLabel });

/** A repeatable roll in [0, 1) from a label and the run's own counters, so the same run state always rolls the same number. */
export function goldenRoll(g, label) {
  const { seed, prime, modulus, ticksPerSecond } = GOLD.roll,
    text = `${label}|${g.kills ?? 0}|${Math.floor((g.time ?? 0) * ticksPerSecond)}`;
  let h = seed;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), prime) >>> 0;
  return h / modulus;
}
/** Boss loot: a small chance, from data, that a defeated boss leaves a golden gun. Returns the plan or null. */
export function rollBossGolden(g, bossKey) {
  if (goldenRoll(g, "boss:" + bossKey) >= GOLD.bossChance) return null;
  return grantGoldenWeapon(g, goldenRoll(g, "pick:" + bossKey));
}
/** After each step: every boss defeated in that step's events gets its roll. Returns how many guns were granted. */
export function grantBossGolden(g) {
  let granted = 0;
  for (const e of g.events ?? []) if (e.type === "boss-defeated" && rollBossGolden(g, e.placementKey)) granted++;
  return granted;
}
/** The loot outcome for an id this module owns (null for any other): fn(g, row) returns true when it granted something. The airdrop registers this one. */
export const lootOutcome = (id) =>
  id === GOLDEN_WEAPON_OUTCOME ? (g, row) => !!grantGoldenWeapon(g, goldenRoll(g, row?.key ?? "loot")) : null;

/** The gold look as a three.js material: a copy of the weapon's own material with the data's colour, metalness, roughness, emissive. */
export function goldMaterial(source, look = GOLD.material) {
  const gold = source.clone();
  gold.color.set(look.color);
  gold.metalness = look.metalness;
  gold.roughness = look.roughness;
  gold.emissive.set(look.emissive);
  gold.emissiveIntensity = look.emissiveIntensity;
  for (const slot of ["map", "metalnessMap", "roughnessMap", "emissiveMap"]) gold[slot] = null; // the plain texture would tint the gold
  gold.needsUpdate = true;
  return gold;
}
/** Swaps every mesh under `root` between its own materials and gold copies; the gold copies are made once and kept. */
export function createGoldSkin(root, look = GOLD.material) {
  const rows = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    const plain = node.material,
      gold = Array.isArray(plain) ? plain.map((m) => goldMaterial(m, look)) : goldMaterial(plain, look);
    rows.push({ node, plain, gold });
  });
  let on = false;
  return {
    get on() {
      return on;
    },
    set(next) {
      if (next === on) return;
      on = next;
      for (const row of rows) row.node.material = on ? row.gold : row.plain;
    },
    shimmer(time) {
      const wave = Math.sin(time * look.shimmerSpeed) * look.shimmerAmplitude;
      for (const row of rows) for (const m of [row.gold].flat()) m.emissiveIntensity = look.emissiveIntensity + wave;
    },
    dispose() {
      this.set(false);
      for (const row of rows) for (const m of [row.gold].flat()) m.dispose();
    },
  };
}
/** Per frame, for the player's view: keep each owned gun's mount gold exactly when its skin is unlocked. */
export function syncGoldenSkins(view, g) {
  view.goldSkins ??= new Map();
  for (const [key, weapon] of Object.entries(GOLD.weapons)) {
    const mount = read(view, weapon.mount),
      want = isGolden(g, key);
    let skin = view.goldSkins.get(key);
    if (!mount || (!want && !skin?.on)) continue;
    if (!skin || skin.root !== mount) {
      skin?.dispose();
      skin = Object.assign(createGoldSkin(mount), { root: mount });
      view.goldSkins.set(key, skin);
    }
    skin.set(want);
    if (want) skin.shimmer(g.time ?? 0);
  }
}
