// Procedural claw-gouge geometry for the heat tally (look in data/heat.json). Pure: no canvas, no three. Every stroke is generated from a
// seed, so the ragged edges are our own and stay the same each frame. Canvas units are pixels, y down, origin at the group's centre.

// A small seeded random generator (mulberry32) so a mark keeps its torn edge as the count grows.
export function seeded(seed) {
  let a = seed >>> 0; // tuning-ok: the standard 32-bit generator constants below are not tunable
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RAD = Math.PI / 180; // tuning-ok: degrees to radians

// One ragged gouge: pointed at both ends, widest near the entry, edges jittered, with the odd torn spike or bite.
export function gougeOutline(rand, g) {
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
      calm = Math.min(1, (w / g.widthPx) * 2); // tuning-ok: the points at both ends stay sharp, ramping over the first and last half-widths
    for (const [side, out] of [
      [-1, left],
      [1, right],
    ]) {
      let off = (side * w) / 2 + (rand() - 0.5) * 2 * g.edgeJitterPx * calm; // tuning-ok: centred jitter
      if (rand() < g.notchProb) off += (rand() - 0.35) * g.notchPx * 2 * calm; // tuning-ok: mostly bites, sometimes spikes
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
    const tilt = (m.baseTiltDeg + (rand() - 0.5) * 2 * m.tiltJitterDeg) * RAD, // tuning-ok: centred jitter
      x = (i - (marks - 1) / 2) * m.spacingPx, // tuning-ok: the marks are centred on the group
      dir = { x: Math.sin(tilt), y: Math.cos(tilt) },
      from = { x: x - (dir.x * m.lengthPx) / 2, y: -(dir.y * m.lengthPx) / 2 }, // tuning-ok: centred on the group
      to = { x: x + (dir.x * m.lengthPx) / 2, y: (dir.y * m.lengthPx) / 2 },
      gouges = [{ ...base, from, to }],
      c = look.companions;
    for (const off of c.offsetsPx) {
      const shift = { x: -dir.y * off, y: dir.x * off }, // perpendicular to the drag
        a = along({ x: from.x + shift.x, y: from.y + shift.y }, { x: to.x + shift.x, y: to.y + shift.y }, c.startShare),
        b = along(a, { x: to.x + shift.x, y: to.y + shift.y }, c.lengthShare);
      // tuning-ok: the thin prongs follow the main bend, half as ragged
      gouges.push({ ...base, widthPx: c.widthPx, bendPx: m.bendPx * 0.5, edgeJitterPx: m.edgeJitterPx * 0.5, from: a, to: b });
    }
    slots.push({ index: i, kind: "mark", gouges, rand });
  }
  return slots;
}
