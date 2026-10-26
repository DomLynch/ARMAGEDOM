import { closed, freeze } from "./content-schema.js";
import { FLAME_PILOT_PROFILE } from "./flame-fuel-state.js";
import { GAME_DATA } from "./game-data.js";
// visual.json flameEffect.particles; the palette is stored as hex strings and read as three.js colour numbers.
const PARTICLES = GAME_DATA.visual.flameEffect.particles;
export const FLAME_VISUAL_DATA = freeze({ ...structuredClone(PARTICLES), palette: PARTICLES.palette.map((hex) => Number(`0x${hex}`)) });
export const FLAME_MODEL_REF = "player-flamethrower";
export function validateFlameData(input, registry) {
  if (input === undefined) return null;
  closed(input, ["version", "pickupId", "areaId", "position", "modelRef"]);
  closed(input.position, ["x", "z"]);
  if (
    input.version !== 1 ||
    input.pickupId !== FLAME_PILOT_PROFILE.pickupId ||
    input.modelRef !== FLAME_MODEL_REF ||
    registry.get(input.areaId)?.visibility !== "public" ||
    !Object.values(input.position).every((n) => Number.isFinite(n) && Math.abs(n) <= 200)
  )
    throw Error("Invalid registered flamethrower");
  return freeze({ ...FLAME_PILOT_PROFILE, ...structuredClone(input), pickupRadius: 1.3 });
}
export function validateFlameGeometry(data, registry, areaId, geometry) {
  if (!data || data.areaId !== areaId) return;
  const p = data.position,
    point = geometry.point(p);
  if (
    !geometry.clear(p, data.pickupRadius) ||
    !geometry.lineClear(geometry.ground(registry.get(areaId).entry), p) ||
    registry
      .links(areaId)
      .some((link) =>
        Object.entries(link.condition).every(([key, value]) =>
          key === "xMin"
            ? point.x > value
            : key === "xMax"
              ? point.x < value
              : key === "yMin"
                ? point.y > value
                : point.y < value,
        ),
      )
  )
    throw Error("Blocked flamethrower pickup");
}
