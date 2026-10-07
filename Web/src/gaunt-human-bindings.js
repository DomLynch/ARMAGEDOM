// Body presentation only; retain each resident's role, supplies and saved identity.
const bindings = Object.freeze({
  westminster: 'westminster-roamer-1',
  east: 'east-roamer-1',
  south: 'south-roamer-9',
});
export const GAUNT_HUMAN_CYCLES = Object.freeze({A: bindings, B: bindings});

export function gauntHumanRecipe(cycle, areaId, entity) {
  const key = GAUNT_HUMAN_CYCLES[cycle]?.[areaId];
  return typeof key === 'string' && entity?.kind >= 0 && entity.rig === 'hollow-scavenger'
    && key === entity.placementKey
    ? 'human-gaunt-skulker' : null;
}
