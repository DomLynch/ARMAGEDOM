// Shared linear falloff; hosts own occlusion, paid resources and exactly-once IO.
export function radialBlastHits(position, areaId, victims, { radius, maxDamage }) {
  const hits = [];
  for (const victim of victims) {
    if (victim.areaId !== areaId || victim.hp <= 0 || !victim.eligible) continue;
    const damage =
      maxDamage * Math.max(0, 1 - Math.hypot(victim.position.x - position.x, victim.position.z - position.z) / radius);
    if (damage > 0) hits.push({ victimId: victim.victimId, damage });
  }
  return hits;
}
