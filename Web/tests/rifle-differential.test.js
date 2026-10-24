import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fixture } from "./helpers/rifle-fixture.js";
import { RIFLE_SAVE_KEY } from "../src/engine/rifle-core.js";
import { FLAME_SAVE_KEY } from "../src/engine/flame-core.js";
import { RIFLE_ITEM_ID } from "../src/engine/weapon-catalog.js";
// Differential definition of "no behaviour change" for the rifle layer. The golden was recorded from the
// pre-migration module; the migrated layer must replay it exactly. Re-record only with UPDATE_GOLDEN=1 and a reason.
const goldenUrl = new URL("./fixtures/rifle-golden.json", import.meta.url);
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/rifle166-earned-v9.json", import.meta.url)));
const sha = (raw) => (raw == null ? null : createHash("sha256").update(raw).digest("hex"));
const envelope = [
  "version",
  "pistol",
  "hp",
  "supplies",
  "vest",
  "droneDeaths",
  "animalCycle",
  "progression",
  "expedition",
  "uniqueReward",
  "flameFuel",
  "rifle",
];
function snapshot(f, step, result) {
  const g = f.g;
  return {
    step,
    result: result && { ok: result.ok, code: result.code, changed: result.changed, events: result.events },
    state: g.rifle,
    weapon: g.player.weapon,
    pistolEquipped: g.pistol?.equipped,
    action: g.rifleAction,
    dropEvents: g.events.filter((e) => e.type === "rifle-drop").length,
    saveSha: sha([...f.records.values()][0]),
    keys: [...f.records.keys()].sort(),
  };
}
function scenario() {
  const steps = [],
    f = fixture();
  f.restore();
  steps.push(snapshot(f, "fresh"));
  f.quota(true);
  steps.push({ ...snapshot(f, "kill-quota-fail"), killed: f.kill() });
  f.quota(false);
  steps.push({ ...snapshot(f, "kill-persist"), persisted: f.p.persistRun(f.g) });
  steps.push(snapshot(f, "kill-persist-again"));
  const at = f.g.rifle.dropPosition;
  f.g.player.pos = { x: at.x + 3, z: at.z };
  const claim = () => f.p.dispatchRifle(f.g, { type: "claimPickup", pickupId: RIFLE_ITEM_ID }, true);
  steps.push(snapshot(f, "claim-too-far", claim()));
  f.g.player.pos = { ...at };
  f.quota(true);
  steps.push(snapshot(f, "claim-quota-fail", claim()));
  f.quota(false);
  steps.push(snapshot(f, "claim", claim()));
  steps.push(snapshot(f, "claim-again", claim()));
  steps.push(
    snapshot(f, "equip-bad", f.p.dispatchRifle(f.g, { type: "equip", itemId: RIFLE_ITEM_ID, equipped: "yes" }, true)),
  );
  steps.push(snapshot(f, "equip", f.equip(true)));
  steps.push(snapshot(f, "equip-again", f.equip(true)));
  for (const [name, advance] of [
    ["fire", 1],
    ["fire-too-soon", 0],
  ]) {
    f.g.time += advance;
    f.g.tick += advance * 60;
    steps.push(snapshot(f, name, f.fire()));
  }
  steps.push(snapshot(f, "reload", f.reload()));
  f.quota(true);
  f.g.time += 5;
  f.g.tick += 300;
  steps.push(snapshot(f, "fire-quota-fail", f.fire()));
  f.quota(false);
  steps.push(snapshot(f, "unequip", f.equip(false)));
  steps.push(snapshot(f, "re-equip", f.equip(true)));
  steps.push({ ...snapshot(f, "retry"), retried: f.p.retry() });
  steps.push(snapshot(f, "after-retry"));
  const restoreFrom = (name, records) => {
    const r = fixture({ records: new Map(records) });
    r.restore();
    steps.push({ ...snapshot(r, name), invalid: !!r.g.runSaveInvalid });
  };
  restoreFrom("cold-restore", f.records);
  const hub = JSON.parse([...f.records.values()][0]),
    v9 = Object.fromEntries(envelope.map((k) => [k, hub[k]]));
  v9.version = 9;
  restoreFrom("restore-v9-direct", [[RIFLE_SAVE_KEY, JSON.stringify(v9)]]);
  restoreFrom("restore-v9-genuine", [[RIFLE_SAVE_KEY, legacy.rawV9]]);
  restoreFrom("restore-legacy-v8", [[FLAME_SAVE_KEY, legacy.rawV8]]);
  const bad = structuredClone(v9);
  bad.rifle.status = "bogus";
  restoreFrom("restore-tampered", [[RIFLE_SAVE_KEY, JSON.stringify(bad)]]);
  const missing = structuredClone(v9);
  delete missing.rifle;
  restoreFrom("restore-missing-field", [[RIFLE_SAVE_KEY, JSON.stringify(missing)]]);
  const selectedWithPistol = structuredClone(v9);
  selectedWithPistol.rifle.selected = true;
  selectedWithPistol.pistol.equipped = true;
  restoreFrom("restore-selected-with-pistol", [[RIFLE_SAVE_KEY, JSON.stringify(selectedWithPistol)]]);
  return steps;
}
test("rifle layer replays its recorded behaviour", () => {
  const trace = JSON.parse(JSON.stringify(scenario()));
  if (process.env.UPDATE_GOLDEN === "1") {
    fs.writeFileSync(goldenUrl, JSON.stringify(trace, null, 1) + "\n");
    return;
  }
  assert.deepEqual(trace, JSON.parse(fs.readFileSync(goldenUrl, "utf8")));
});
