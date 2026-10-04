// The library owns source resources; actor clones own only their copied materials
// and skeletons. Shared textures/geometries stay alive across encounter retries.
export function disposeActorSources(sources) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  const images = new Set();
  for (const source of sources) {
    for (const scene of source.scenes ?? [source.scene]) {
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.skeleton) skeletons.add(object.skeleton);
        for (const material of [object.material].flat()) {
          if (!material) continue;
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value?.isTexture) textures.add(value);
          }
        }
      });
    }
  }
  for (const texture of textures) {
    for (const image of [texture.source?.data].flat()) {
      if (typeof image?.close === "function") images.add(image);
    }
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
