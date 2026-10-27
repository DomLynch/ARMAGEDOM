// goldenWeapons.json: the golden-weapon loot outcome, which guns can turn gold, and the gold material (engine/golden-weapons.js).
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const hex = /^#[0-9a-f]{6}$/;
const path = (list) => Array.isArray(list) && list.length > 0 && list.every((p) => typeof p === "string" && /^[A-Za-z]+$/.test(p));

export function validateGoldenWeapons(d) {
  closed(d, ["schema_version", "outcomeId", "noticeSeconds", "fallbackCash", "weapons", "material", "text"]);
  if (!/^[a-z][a-z0-9-]*$/.test(d.outcomeId)) fail("goldenWeapons", "outcomeId must be a lowercase id");
  if (!Number.isFinite(d.noticeSeconds) || d.noticeSeconds < 0.5 || d.noticeSeconds > 30)
    fail("goldenWeapons", "noticeSeconds must be 0.5 to 30");
  if (!Number.isSafeInteger(d.fallbackCash) || d.fallbackCash < 0) fail("goldenWeapons", "fallbackCash must be a whole number");
  const keys = Object.keys(d.weapons);
  if (!keys.length || keys.some((k) => !/^[a-z]+$/.test(k) || k.length > 24)) fail("goldenWeapons", "weapons need short lowercase keys");
  for (const w of Object.values(d.weapons)) {
    closed(w, ["itemId", "name", "owned", "mount"]);
    closed(w.owned, ["path", "equals"]);
    if (!/^[a-z0-9-]+-v\d+$/.test(w.itemId) || typeof w.name !== "string" || !w.name) fail("goldenWeapons", "weapon id or name");
    if (!path(w.owned.path) || !path(w.mount)) fail("goldenWeapons", "weapon paths");
  }
  const m = d.material;
  closed(m, ["color", "metalness", "roughness", "emissive", "emissiveIntensity", "shimmerAmplitude", "shimmerSpeed"]);
  if (!hex.test(m.color) || !hex.test(m.emissive)) fail("goldenWeapons", "material colours must be #rrggbb");
  for (const k of ["metalness", "roughness"]) if (!(m[k] >= 0 && m[k] <= 1)) fail("goldenWeapons", `${k} must be 0 to 1`);
  for (const k of ["emissiveIntensity", "shimmerAmplitude", "shimmerSpeed"])
    if (!Number.isFinite(m[k]) || m[k] < 0 || m[k] > 5) fail("goldenWeapons", `${k} must be 0 to 5`);
  closed(d.text, ["unlocked", "cashFallback", "marker", "goldTileLabel"]);
  for (const v of Object.values(d.text)) if (typeof v !== "string" || !v) fail("goldenWeapons", "text must be strings");
}
