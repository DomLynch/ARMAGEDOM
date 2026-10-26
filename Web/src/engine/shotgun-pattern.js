import { GAME_DATA } from "./game-data.js";
const point = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const targetId = (id) => (typeof id === "string" && id.length > 0) || (typeof id === "number" && Number.isFinite(id));
const fields = ["pelletCount", "pelletDamage", "range", "spreadDegrees"],
  // The one registered profile: the shotgun payload in data/weapons.json. A caller's profile must match it field for field.
  registered = () => GAME_DATA.weapons.ranged["south-stalker-shotgun-v1"].payload;
export function traceShotgun(origin, aim, targets, lineClear, profile, traceRay) {
  if (
    !point(origin) ||
    !point(aim) ||
    !Array.isArray(targets) ||
    typeof lineClear !== "function" ||
    typeof traceRay !== "function" ||
    !profile ||
    Object.getPrototypeOf(profile) !== Object.prototype ||
    Reflect.ownKeys(profile).length !== fields.length ||
    !fields.every((key) => {
      const d = Object.getOwnPropertyDescriptor(profile, key);
      return d?.enumerable && "value" in d && d.value === registered()[key];
    })
  )
    return null;
  const length = Math.hypot(aim.x, aim.z);
  if (!(length > 1e-8) || !Number.isFinite(length)) return null;
  if (
    targets.some((target) => !target || !targetId(target.id)) ||
    new Set(targets.map((t) => t.id)).size !== targets.length
  )
    return null;
  const known = new Set(targets.map((t) => t.id)),
    pellets = [],
    hits = new Map(),
    x = aim.x / length,
    z = aim.z / length;
  try {
    for (let i = 0; i < profile.pelletCount; i++) {
      const degrees = -profile.spreadDegrees / 2 + (i * profile.spreadDegrees) / (profile.pelletCount - 1), // tuning-ok: a fan centred on the aim
        angle = (degrees * Math.PI) / 180, // tuning-ok: degrees to radians
        c = Math.cos(angle),
        s = Math.sin(angle);
      const trace = traceRay(
        { x: origin.x, z: origin.z },
        { x: x * c - z * s, z: x * s + z * c },
        structuredClone(targets),
        lineClear,
        { range: profile.range },
      );
      if (
        !trace ||
        !point(trace.origin) ||
        !point(trace.end) ||
        !point(trace.direction) ||
        (trace.targetId !== null && (!targetId(trace.targetId) || !known.has(trace.targetId)))
      )
        return null;
      pellets.push(structuredClone(trace));
      if (trace.targetId !== null) {
        const row = hits.get(trace.targetId) ?? { targetId: trace.targetId, damage: 0, pellets: 0 };
        row.damage += profile.pelletDamage;
        row.pellets++;
        hits.set(trace.targetId, row);
      }
    }
    return { pellets, hits: [...hits.values()] };
  } catch {
    return null;
  }
}
