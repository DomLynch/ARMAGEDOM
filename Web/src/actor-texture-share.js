// Several actor GLBs ship byte-identical images (the player and the hollow body share the Photo, PhotoEyes and PhotoTeeth maps; the player and the
// hunter share Wrap; the two bosses share the knife maps). GLTFLoader decodes each file on its own, so every copy would be uploaded to the GPU
// separately. After a file loads, each texture is swapped for the first texture the library saw with the same image bytes and the same sampler
// state; the later copy is released before it was ever uploaded. Pixels do not change.

// The image bytes of every texture a glTF file refers to, hashed once per image.
async function imageHashes(parser) {
  const json = parser.json,
    hashes = new Map();
  for (const [index, texture] of (json.textures ?? []).entries()) {
    const source =
        texture.source ?? Object.values(texture.extensions ?? {}).find((e) => e?.source !== undefined)?.source,
      image = json.images?.[source];
    if (image?.bufferView === undefined) continue;
    if (!hashes.has(source)) {
      const bytes = await parser.getDependency("bufferView", image.bufferView);
      hashes.set(source, toHex(await crypto.subtle.digest("SHA-256", bytes)) + ":" + bytes.byteLength);
    }
    hashes.set("texture" + index, hashes.get(source));
  }
  return hashes;
}
const toHex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join(""); // tuning-ok: a hex byte is two digits

// Everything that changes how a texture samples or decodes; two textures only merge when all of it matches.
function samplerKey(texture) {
  return JSON.stringify([
    texture.colorSpace,
    texture.flipY,
    texture.wrapS,
    texture.wrapT,
    texture.minFilter,
    texture.magFilter,
    texture.anisotropy,
    texture.channel,
    texture.generateMipmaps,
    texture.premultiplyAlpha,
    texture.offset.toArray(),
    texture.repeat.toArray(),
    texture.center.toArray(),
    texture.rotation,
  ]);
}

// pool: Map of "<image hash>|<sampler key>" -> the shared texture, owned by the actor library.
// Returns how many textures were replaced. A file without a parser (a test double) is left alone.
export async function shareIdenticalTextures(gltf, pool) {
  const parser = gltf?.parser;
  // crypto.subtle only exists on secure origins; on a plain-http LAN test page every texture simply stays its own.
  if (!parser?.json || !parser.associations || !gltf.scene || !globalThis.crypto?.subtle) return 0;
  // A file whose bytes cannot be read keeps its own textures: sharing is an optimisation, never a reason to fail a load.
  const hashes = await imageHashes(parser).catch(() => null);
  if (!hashes) return 0;
  const replaced = new Map(),
    materials = new Set();
  gltf.scene.traverse((object) => {
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  for (const material of materials)
    for (const [slot, texture] of Object.entries(material)) {
      if (!texture?.isTexture) continue;
      if (!replaced.has(texture)) {
        const hash = hashes.get("texture" + parser.associations.get(texture)?.textures);
        if (!hash) {
          replaced.set(texture, texture);
        } else {
          const key = hash + "|" + samplerKey(texture),
            shared = pool.get(key);
          if (!shared) pool.set(key, texture);
          replaced.set(texture, shared ?? texture);
        }
      }
      if (replaced.get(texture) !== texture) material[slot] = replaced.get(texture);
    }
  // Release the superseded copies and the decoded bitmaps only they used.
  const kept = new Set(),
    dropped = new Set();
  for (const material of materials)
    for (const texture of Object.values(material)) if (texture?.isTexture) kept.add(texture.source);
  for (const [from, to] of replaced) {
    if (from === to) continue;
    dropped.add(from);
  }
  for (const texture of dropped) {
    const image = texture.source?.data;
    texture.dispose();
    if (!kept.has(texture.source) && typeof image?.close === "function") image.close();
  }
  return dropped.size;
}
