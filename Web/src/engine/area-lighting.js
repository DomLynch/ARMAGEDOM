import { GAME_DATA } from "./game-data.js";
// Intensities only: keep existing light types, colours, fog and exposure. The default is data/areaRuntime.json defaultLighting.
export const DEFAULT_LIGHTING = GAME_DATA.areaRuntime.defaultLighting;
export function validateAreaLighting(input, registry) {
  const fail = () => {
    throw Error("Invalid area lighting preset");
  };
  const closed = (value, fields) => {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== fields.length ||
      fields.some((k) => !Object.hasOwn(value, k))
    )
      fail();
  };
  if (input === undefined) return Object.freeze(Object.fromEntries(registry.ids.map((id) => [id, DEFAULT_LIGHTING])));
  closed(input, ["presets", "areas"]);
  for (const map of [input.presets, input.areas]) if (!map || Object.getPrototypeOf(map) !== Object.prototype) fail();
  const presets = Object.create(null);
  for (const [id, value] of Object.entries(input.presets)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail();
    closed(value, ["fillIntensity", "keyIntensity"]);
    if (!Object.values(value).every((n) => Number.isFinite(n) && n >= 0 && n <= 4)) fail();
    presets[id] = Object.freeze({ ...value });
  }
  const result = Object.create(null);
  for (const [area, ref] of Object.entries(input.areas)) {
    if (!registry.has(area) || typeof ref !== "string" || !Object.hasOwn(presets, ref)) fail();
    result[area] = presets[ref];
  }
  for (const id of registry.ids) result[id] ??= DEFAULT_LIGHTING;
  return Object.freeze(result);
}
export function applyAreaLighting(scene, world, areaId = world.areaId) {
  const preset = world.areaLighting?.[areaId] ?? DEFAULT_LIGHTING;
  for (const light of scene.children) {
    if (light.isHemisphereLight) light.intensity = preset.fillIntensity;
    else if (light.isDirectionalLight) light.intensity = preset.keyIntensity;
  }
  return preset;
}
