// Curated sRGB swatches become linear glTF-style factors ONCE at import.
// Apply only to private garment material clones; keep vertex grime/maps intact.
// The swatch rows and the family pairings live in Web/src/data/visual.json `clothing` (read through game-data.js).
import { GAME_DATA } from "./engine/game-data.js";
const CLOTHING = GAME_DATA.visual.clothing;
export const CLOTHING_PALETTE_VERSION = CLOTHING.version;
const linear = (hex) =>
  Object.freeze(
    [16, 8, 0].map((shift) => {
      const c = ((parseInt(hex, 16) >> shift) & 255) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }),
  );
const entries = (prefix, rows) =>
  Object.freeze(
    rows.flatMap(([family, ...hexes]) =>
      hexes.map((hex, i) =>
        Object.freeze({ id: `${prefix}-${family}-${String(i + 1).padStart(2, "0")}`, family, linear: linear(hex) }),
      ),
    ),
  );
export const TOP_COLOURS = entries("top", CLOTHING.tops);
export const TROUSER_COLOURS = entries("trousers", CLOTHING.trousers);
// Family direction is curated (in the data); tonal separation below keeps both garments readable.
const partners = CLOTHING.partners;
const luminance = (rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
export const PAIRINGS = Object.freeze(
  Object.fromEntries(
    TOP_COLOURS.map((top) => [
      top.id,
      Object.freeze(
        TROUSER_COLOURS.filter(
          (trousers) =>
            partners[top.family].includes(trousers.family) &&
            Math.abs(luminance(top.linear) - luminance(trousers.linear)) >= 0.035,
        ).map((trousers) => trousers.id),
      ),
    ]),
  ),
);
const trousersById = new Map(TROUSER_COLOURS.map((row) => [row.id, row]));
const outfits = new Map(
  TOP_COLOURS.map((top) => [
    top.id,
    new Map(
      PAIRINGS[top.id].map((trouserId) => [
        trouserId,
        Object.freeze({
          id: `${top.id}/${trouserId}`,
          topId: top.id,
          trouserId,
          jacket: top.linear,
          trousers: trousersById.get(trouserId).linear,
        }),
      ]),
    ),
  ]),
);
// Cached immutable objects/colour arrays, including when called repeatedly.
export function outfitFor(topId, trouserId) {
  const outfit = outfits.get(topId)?.get(trouserId);
  if (!outfit) throw Error("Unknown or unapproved clothing pairing");
  return outfit;
}
