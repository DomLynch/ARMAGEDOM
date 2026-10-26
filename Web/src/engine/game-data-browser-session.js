// browserSession.json: the page's scene set-up (engine/browser-session.js): actor scale, pixel-ratio cap, the on-screen message time and the
// three starting lights. The hemisphere and sun intensities are areaRuntime defaultLighting (applyAreaLighting changes them per area).
// The validator lives here so the loader (engine/game-data.js) stays under its size limit; game-data.js re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

export function validateBrowserSession(d) {
  closed(d, ["schema_version", "actorVisualScale", "maxPixelRatio", "messageSeconds", "syncedNoticeSeconds", "sceneLights"]);
  for (const [name, min, max] of [["actorVisualScale", 0.1, 4], ["maxPixelRatio", 1, 4], ["messageSeconds", 1, 60], ["syncedNoticeSeconds", 1, 60]])
    if (!Number.isFinite(d[name]) || d[name] < min || d[name] > max) fail("browserSession", `${name} must be ${min} to ${max}`);
  const l = d.sceneLights;
  closed(l, ["hemiSky", "hemiGround", "sunColor", "sunPosition", "rimColor", "rimIntensity", "rimDistance", "rimDecay"]);
  for (const name of ["hemiSky", "hemiGround", "sunColor", "rimColor"])
    if (typeof l[name] !== "string" || !/^#[0-9a-f]{6}$/.test(l[name])) fail("browserSession", `sceneLights.${name} must be #rrggbb`);
  if (!Array.isArray(l.sunPosition) || l.sunPosition.length !== 3 || !l.sunPosition.every((n) => Number.isFinite(n) && Math.abs(n) <= 100))
    fail("browserSession", "sceneLights.sunPosition must be three numbers within 100");
  if (!Number.isFinite(l.rimIntensity) || l.rimIntensity < 0 || l.rimIntensity > 20) fail("browserSession", "sceneLights.rimIntensity");
  if (!Number.isFinite(l.rimDistance) || l.rimDistance <= 0 || l.rimDistance > 100) fail("browserSession", "sceneLights.rimDistance");
  if (!Number.isFinite(l.rimDecay) || l.rimDecay < 0 || l.rimDecay > 10) fail("browserSession", "sceneLights.rimDecay");
}
