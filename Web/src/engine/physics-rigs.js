// Which manifest models ragdoll on death and with what: the model's bone map and body row, from data/physicsRigs.json (`live: true` rows only).
// Shared by the loader (physics-death.js) and the lazy chunk (physics-death-impl.js); pure lookups, no physics import.
import { GAME_DATA } from "./game-data.js";

const RIGS = GAME_DATA.physicsRigs,
  CFG = GAME_DATA.physicsDeath,
  records = new Map();

// { model, key, nodePrefix, parts, body } for a live model, else null (the baked death plays). `key` names the body row: ragdolls of one body share a pool.
export function rigOf(model) {
  if (records.has(model)) return records.get(model);
  const m = RIGS.models[model],
    family = m?.live ? RIGS.rigs[m.rig] : null,
    record = family && {
      model,
      key: m.body,
      nodePrefix: family.nodePrefix,
      parts: family.parts === "physicsDeath.parts" ? CFG.parts : family.parts,
      body: m.body === "physicsBody" ? GAME_DATA.physicsBody.row : RIGS.bodies[m.body],
    };
  records.set(model, record ?? null);
  return record ?? null;
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
