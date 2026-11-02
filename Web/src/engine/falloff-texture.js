// The soft round sprite texture the pooled fire draws share (engine/flame-effect.js, engine/burn-presentation.js): white RGB, alpha falling off
// from the centre as (1 - r) ** falloffPower, scaled to peakAlpha (0 to 255). `T` is the three.js namespace, injected like the other engine views.
export function falloffTexture(T, { size, falloffPower, peakAlpha }) {
  const pixels = new Uint8Array(size * size * 4), // tuning-ok: four bytes (RGBA) per pixel
    half = size / 2; // tuning-ok: the texture centre is half its size
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4, // tuning-ok: four bytes (RGBA) per pixel
        r = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half); // tuning-ok: 0.5 = the pixel's centre
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 255; // tuning-ok: RGBA channel offsets, white
      pixels[at + 3] = Math.round(Math.max(0, 1 - r) ** falloffPower * peakAlpha); // tuning-ok: alpha is channel 3
    }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}
