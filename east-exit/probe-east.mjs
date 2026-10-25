import { probe } from "/Users/domininclynch/Developer/armagedom/.claude/worktrees/arma-art-fc3cad/Web/scripts/exit-probe.mjs";
const reach = Number(process.argv[4] ?? 18);
const r = probe(process.argv[2] ?? "east", process.argv[3] ?? "east-bridge", reach);
const near = r.stalled.filter((s) => s.distToTrigger < 6);
const cl = new Map();
for (const s of near) {
  const k = `${Math.round(s.stuckAt.x)},${Math.round(s.stuckAt.z)}`;
  cl.set(k, (cl.get(k) ?? 0) + 1);
}
const hist = {};
for (const s of r.stalled) hist[Math.floor(s.distToTrigger / 2) * 2] = (hist[Math.floor(s.distToTrigger / 2) * 2] ?? 0) + 1;
console.log(JSON.stringify({ trigger: r.trigger, starts: r.starts, reached: r.reached, stalled: r.stalled.length, byDistance: hist, nearClusters: [...cl.entries()] }));
const g = r.geo;
// Blockers near the trigger.
const c = r.centre;
const close = g.blockers
  .map((poly, i) => ({ i, d: Math.min(...poly.map((p) => Math.hypot(p.x - c.x, p.z - c.z))), n: poly.length, c: poly.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ") }))
  .filter((b) => b.d < 8)
  .sort((a, b) => a.d - b.d);
console.log(JSON.stringify(close, null, 1));
