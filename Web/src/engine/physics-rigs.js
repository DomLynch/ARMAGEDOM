// Which manifest models ragdoll on death and with what: the model's bone map and body row, from data/physicsRigs.json (`live: true` rows only).
// Shared by the loader (physics-death.js) and the lazy chunk (physics-death-impl.js); pure lookups, no physics import.
// Two kinds of row: a humanoid (rig family bone map + a measured body row) and a chain creature (`chain`: the package's own body of that name, loaded
// by the impl; `partAlias` maps the shared hit-part ids, e.g. spine2, onto the chain's own part ids).
import { GAME_DATA } from "./game-data.js";

const RIGS = GAME_DATA.physicsRigs,
  CFG = GAME_DATA.physicsDeath,
  records = new Map();

// { model, key, ... } for a live model, else null (the baked death plays). `key` names the body: ragdolls of one body share a pool.
export function rigOf(model) {
  if (records.has(model)) return records.get(model);
  const m = RIGS.models[model];
  let record = null;
  if (m?.live && m.chain)
    record = {
      model,
      key: `chain:${m.chain}`,
      chain: m.chain,
      partAlias: m.partAlias ?? {},
      impulseReferenceKg: RIGS.impulseReferenceKg,
    };
  else if (m?.live) {
    const family = RIGS.rigs[m.rig];
    record = {
      model,
      key: m.body,
      nodePrefix: family.nodePrefix,
      parts: family.parts === "physicsDeath.parts" ? CFG.parts : family.parts,
      virtual: family.virtual ?? {},
      body: m.body === "physicsBody" ? GAME_DATA.physicsBody.row : RIGS.bodies[m.body],
    };
  }
  records.set(model, record);
  return record;
}
// One record per distinct live body, for the pools.
export const liveBodies = () => [
  ...new Map(
    Object.keys(RIGS.models)
      .map(rigOf)
      .filter(Boolean)
      .map((r) => [r.key, r]),
  ).values(),
];
