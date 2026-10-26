// Authored ingredients only; World allocates these IDs from the full roster.
import { GAME_DATA } from "./engine/game-data.js";
// The ingredient rows live in Web/src/data/visual.json `faces` (read through game-data.js); the recipes below are derived from them.
const FACES = GAME_DATA.visual.faces;
export const FACE_APPEARANCE_VERSION = FACES.version;
export const ORIGINAL_FACE_ID = "face-original";
const freeze = (o) => Object.freeze(o);
export const FACE_HEADS = FACES.heads;
export const FACE_HAIRS = FACES.hairs;
export const FACE_SKINS = FACES.skins;
export const FACE_WEATHERING = FACES.weathering;
// Alternate head shapes and stride through complexion/hair contrasts. Every
// approved combination appears once; ordering is part of this library version.
// One recipe per head x hair x skin (2 x 5 x 5 = 50); the strides below cycle the hair, skin and weathering lists, whose sizes are the moduli.
// The stride and shift numbers are appearance.json `faceRecipeCycle`.
const HAIRS = FACE_HAIRS.length,
  SKINS = FACE_SKINS.length,
  WEATHERS = FACE_WEATHERING.length,
  HEADS = FACE_HEADS.length,
  CYCLE = GAME_DATA.appearance.faceRecipeCycle;
export const FACE_RECIPES = freeze(
  Array.from({ length: HEADS * HAIRS * SKINS }, (_, i) => {
    const side = i % HEADS,
      head = FACE_HEADS[side],
      k = Math.floor(i / HEADS),
      hair = FACE_HAIRS[((k % HAIRS) * CYCLE.hairStride + side * CYCLE.sideShift) % HAIRS],
      skin = FACE_SKINS[(Math.floor(k / HAIRS) * CYCLE.skinStride + (k % HAIRS) + side * CYCLE.sideShift) % SKINS];
    return freeze({
      id: `face-${head.id}-${hair}-${skin.id}`,
      headPreset: head.id,
      hairPreset: hair,
      skinPreset: skin.id,
      weatheringPreset:
        FACE_WEATHERING[(Math.floor(k / HAIRS) + (k % HAIRS) + side * CYCLE.weatherSideShift) % WEATHERS],
    });
  }),
);
const original = freeze({
  id: ORIGINAL_FACE_ID,
  headPreset: "original",
  hairPreset: "original",
  skinPreset: "original",
  weatheringPreset: "original",
});
const lookup = new Map([[ORIGINAL_FACE_ID, original], ...FACE_RECIPES.map((r) => [r.id, r])]);
export function faceRecipeFor(id) {
  const r = lookup.get(id);
  if (!r) throw Error("Unknown face recipe: " + id);
  return r;
}
