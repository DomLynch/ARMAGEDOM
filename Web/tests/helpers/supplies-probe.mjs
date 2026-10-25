// Observable behaviour of the Westminster supply rules and the vest bag position, as plain JSON. tests/data-supplies.test.js compares it
// with tests/fixtures/supplies-pre-data.json, which this same file wrote on origin/main before AREA1_SUPPLIES and VEST_BAG_POSITION moved
// into data/supplies.json. No imports of the moved tables by name except through the modules that own them.
import { createGame } from "../../src/combat.js";
import { createHollowEncounter } from "../../src/hollow-encounter.js";
import { AREA1_SUPPLIES, createSuppliesState, issueSupply, collectSupply, isSuppliesState, legacyIssuedCount } from "../../src/supplies.js";
import { DEFAULT_LOOT_RULES } from "../../src/engine/area-loot.js";
import { encodeRun, restoreRun, applySavedRun, VEST_BAG_POSITION } from "../../src/pistol-save.js";

const world = () => ({
  areaId: "westminster",
  spawn: { x: 0, z: -6 },
  layout: { characterScale: 1.265 },
  move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
  lineClear: () => true,
  async loadArea(id, entry) {
    this.areaId = id;
    return entry;
  },
});
const game = () =>
  createGame(world(), {
    pilot: "donor-knife",
    pistol: true,
    supplies: true,
    vest: true,
    areaResidents: true,
    openingGroup: false,
    encounter: createHollowEncounter({ rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 }),
  });
const plain = (x) => JSON.parse(JSON.stringify(x));

export function supplyProbe() {
  const keys = Object.keys(AREA1_SUPPLIES);
  const out = { table: plain(AREA1_SUPPLIES), keys, vestBag: plain(VEST_BAG_POSITION), lootRules: plain(DEFAULT_LOOT_RULES) };
  // Each roamer on its own: what a kill issues, whether the ledger validates, and the pickup award.
  out.issued = Object.fromEntries(
    keys.map((placementKey) => {
      const state = issueSupply(createSuppliesState(), { placementKey, areaId: "westminster", position: { x: 1, z: 2 }, hp: 0 }).state;
      const award = collectSupply(state, {
        dropId: state.pending[0]?.id,
        areaId: "westminster",
        position: { x: 1, z: 2 },
        resources: { hp: 100, maxHP: 150, reserve: 0, pistolOwned: true },
        lineClear: () => true,
      });
      return [placementKey, { state: plain(state), valid: isSuppliesState(state), legacy: legacyIssuedCount(state), award: plain(award.award) }];
    }),
  );
  // The save round trip under the current save era: issue the three paying roamers, encode, restore, re-encode.
  const g = game();
  for (const placementKey of ["westminster-roamer-1", "westminster-roamer-3", "westminster-roamer-5"])
    g.supplies = issueSupply(g.supplies, { placementKey, areaId: "westminster", position: VEST_BAG_POSITION, hp: 0 }).state;
  const raw = encodeRun(g);
  const fresh = game();
  applySavedRun(fresh, restoreRun(fresh, raw));
  out.roundTrip = { raw: JSON.parse(raw), reencoded: JSON.parse(encodeRun(fresh)), same: encodeRun(fresh) === raw };
  return out;
}
