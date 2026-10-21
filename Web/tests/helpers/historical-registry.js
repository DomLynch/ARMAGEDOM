import {createAreaRegistry} from '../../src/area-registry.js';
import {areaDefinitions} from '../../src/area-definitions.js';
// Old content catalogues own their original set of areas, not later Hub rows.
export function historicalRegistry(ids) {
  const selected = new Set(ids);
  return createAreaRegistry({areas: areaDefinitions.filter(row => selected.has(row.id))
    .map(row => ({...row, exits: row.exits.filter(exit => selected.has(exit.target))}))});
}

// Atlas coordinates are presentation configuration, not historical save bytes.
export function currentAtlas(content) {
  const result = structuredClone(content);
  result.expedition.atlas = Object.fromEntries(Object.keys(result.expedition.atlas)
    .map((id, index) => [id, {column: index % 3, row: Math.floor(index / 3)}]));
  return result;
}
