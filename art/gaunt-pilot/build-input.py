from pathlib import Path
import shutil, hashlib, json
root=Path(__file__).resolve().parents[2]
stage=Path(__file__).resolve().parent/'input'
mapping={
 'world.js':'Web/src/world.js','world-geometry.js':'Web/src/world-geometry.js',
 'world/manifest.json':'Web/public/world/manifest.json','world/westminster/layout.json':'Web/public/world/westminster/layout.json','world/westminster/backdrop.webp':'Web/public/world/westminster/backdrop.webp',
 'hollow-scavenger.glb':'Web/public/assets/hollow-scavenger/hollow-scavenger.glb','knife.glb':'Web/public/assets/hollow-scavenger/knife.glb',
}
for p in ['Web/package.json','Web/package-lock.json','Web/src/gaunt-shape.js','Web/src/gaunt-motion.js','Web/src/donor-motion.js','Web/src/face-appearance.js','Web/src/face-recipes.js','Web/tests/gaunt-pilot.test.js']:mapping[p]=p
for target,source in mapping.items():
 destination=stage/target;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/source,destination)
print(json.dumps({p:hashlib.sha256((stage/p).read_bytes()).hexdigest() for p in mapping},indent=2))
