import { GAME_DATA } from "./game-data.js";

// Procedural claw-gouge geometry for the heat tally (look and random numbers in data/heat.json). Pure: no canvas, no three. Every stroke is
// generated from a seed, so the ragged edges are our own and stay the same each frame. Canvas units are pixels, y down, origin at the
// group's centre.
const HEAT = GAME_DATA.heat,
  RAD = Math.PI / 180;

// A small seeded linear congruential generator (rng row), so a mark keeps its torn edge as the count grows.
export function seeded(seed, rng = HEAT.rng) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, rng.multiplier) + rng.increment) >>> 0;
    return a / rng.modulus;
  };
}

// One ragged gouge: pointed at both ends, widest near the entry, edges jittered, with the odd torn spike or bite.
export function gougeOutline(rand, g, look = HEAT.look) {
  const dx = g.to.x - g.from.x,
    dy = g.to.y - g.from.y,
    len = Math.hypot(dx, dy) || 1,
    nx = -dy / len,
    ny = dx / len,
    left = [],
    right = [];
  for (let i = 0; i <= g.segments; i++) {
    const t = i / g.segments,
      bend = g.bendPx * Math.sin(Math.PI * t),
      cx = g.from.x + dx * t + nx * bend,
      cy = g.from.y + dy * t + ny * bend,
      w = g.widthPx * Math.pow(Math.sin(Math.PI * Math.pow(t, g.entryPower)), g.bodyPower),
      calm = Math.min(1, (w / g.widthPx) * g.tipSharpness); // the points at both ends stay sharp
    for (const [side, out] of [
      [-1, left],
      [1, right],
    ]) {
      let off = side * w * look.centre + (rand() - rand()) * g.edgeJitterPx * calm;
      if (rand() < g.notchProb) off += (rand() - g.notchBias) * g.notchPx * calm; // mostly bites, sometimes spikes
      out.push({ x: cx + nx * off, y: cy + ny * off });
    }
  }
  return left.concat(right.reverse());
}

const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Where one group's gouges lie: the first `n` slots of a group, the last slot of a full group being the strike through the others.
// Returns [{ index, kind: "mark"|"strike", gouges: [spec], rand }]; the caller picks each slot's seed through randFor(index).
export function groupSlots(look, groupSize, n, randFor) {
  const m = look.mark,
    marks = groupSize - 1,
    slots = [],
    base = {
      widthPx: m.widthPx,
      bendPx: m.bendPx,
      segments: m.segments,
      edgeJitterPx: m.edgeJitterPx,
      notchProb: m.notchProb,
      notchPx: m.notchPx,
      notchBias: m.notchBias,
      tipSharpness: m.tipSharpness,
      entryPower: m.entryPower,
      bodyPower: m.bodyPower,
    };
  for (let i = 0; i < Math.min(n, groupSize); i++) {
    const rand = randFor(i);
    if (i === marks) {
      const s = look.strike,
        a = s.angleDeg * RAD,
        d = { x: Math.cos(a), y: -Math.sin(a) }; // up and to the right for a positive angle
      slots.push({
        index: i,
        kind: "strike",
        gouges: [
          {
            ...base,
            widthPx: s.widthPx,
            bendPx: s.bendPx,
            from: { x: d.x * s.halfLengthPx, y: d.y * s.halfLengthPx },
            to: { x: -d.x * s.halfLengthPx, y: -d.y * s.halfLengthPx },
          },
        ],
        rand,
      });
      continue;
    }
    const tilt = (m.baseTiltDeg + (rand() - rand()) * m.tiltJitterDeg) * RAD,
      x = (i - (marks - 1) * look.centre) * m.spacingPx, // the marks are centred on the group
      dir = { x: Math.sin(tilt), y: Math.cos(tilt) },
      reach = m.lengthPx * look.centre,
      from = { x: x - dir.x * reach, y: -dir.y * reach },
      to = { x: x + dir.x * reach, y: dir.y * reach },
      gouges = [{ ...base, from, to }],
      c = look.companions;
    for (const off of c.offsetsPx) {
      const shift = { x: -dir.y * off, y: dir.x * off }, // perpendicular to the drag
        a = along({ x: from.x + shift.x, y: from.y + shift.y }, { x: to.x + shift.x, y: to.y + shift.y }, c.startShare),
        b = along(a, { x: to.x + shift.x, y: to.y + shift.y }, c.lengthShare);
      // The thin prongs follow the main bend and tear less.
      gouges.push({ ...base, widthPx: c.widthPx, bendPx: m.bendPx * c.followShare, edgeJitterPx: m.edgeJitterPx * c.followShare, from: a, to: b });
    }
    slots.push({ index: i, kind: "mark", gouges, rand });
  }
  return slots;
}
