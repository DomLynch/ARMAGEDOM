// The visible tell of a star variant: the actor's own cloned materials get a warm tint and an emissive glow, using the same colour and
// emissive fields the damage flash and marked-hunter tint already use (actors.js restores them from the values captured afterwards).
export function applyStarTell(material, star) {
  const { emissive, intensity, tint, tintMix } = star.tell;
  if (material.emissive) {
    material.emissive.set(`#${emissive}`);
    material.emissiveIntensity = intensity;
  }
  if (material.color) material.color.lerp(material.color.clone().set(`#${tint}`), tintMix);
}
