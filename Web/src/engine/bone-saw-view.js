import { traceGrenadeSurface } from "./grenade-surface.js";
import * as T from "three";
import { rigCapability } from "../rig-capabilities.js";
// Rigid original geometry, local Y follows the existing Knife hand/contact axis.
export function createBoneSaw() {
  const root = new T.Group();
  root.name = "WeaponDrawn";
  const steel = new T.MeshStandardMaterial({ color: 0xadb5bc, metalness: 0.8, roughness: 0.33 }),
    body = new T.MeshStandardMaterial({ color: 0x28494b, metalness: 0.5, roughness: 0.5 }),
    grip = new T.MeshStandardMaterial({ color: 0x141719, roughness: 0.9 });
  const part = (geo, mat, x, y, z) => {
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  part(new T.BoxGeometry(0.085, 0.24, 0.075), grip, 0, 0.1, 0);
  part(new T.BoxGeometry(0.17, 0.22, 0.13), body, 0, 0.3, 0);
  part(new T.CylinderGeometry(0.065, 0.065, 0.2, 10), steel, 0, 0.3, 0).rotation.z = Math.PI / 2;
  const blade = new T.Group();
  blade.name = "Bone Saw reciprocating blade";
  root.add(blade);
  const mesh = new T.Mesh(new T.BoxGeometry(0.065, 0.47, 0.018), steel);
  mesh.position.y = 0.62;
  blade.add(mesh);
  const toothGeo = new T.ConeGeometry(0.022, 0.045, 3);
  for (let i = 0; i < 11; i++) {
    const tooth = new T.Mesh(toothGeo, steel);
    tooth.position.set(0.047, 0.42 + i * 0.041, 0);
    tooth.rotation.z = -Math.PI / 2;
    blade.add(tooth);
  }
  root.userData.sawBlade = blade;
  root.userData.contact = { from: 0.4, to: 0.9 };
  root.userData.saw = true;
  let disposed = false;
  root.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    root.traverse((m) => {
      if (m.geometry) geometries.add(m.geometry);
    });
    for (const g of geometries) g.dispose();
    for (const m of [steel, body, grip]) m.dispose();
  };
  return root;
}
export function animateBoneSaw(root, time, active) {
  const blade = root?.userData.sawBlade;
  if (blade) blade.position.y = active ? Math.sin(time * 170) * 0.016 : 0;
}

export function boneSawContact(blade, views, target) {
  if (!blade?.userData.saw) return false;
  // A lowStrike body sits below the hand-height blade (the knife answers with its low strike moves);
  // the saw has no low pose, so its blade also reaches the ground beneath each blade point.
  const low = rigCapability(target.rig, "lowStrike"),
    a = new T.Vector3(),
    b = new T.Vector3(),
    floor = new T.Vector3();
  for (const x of [-0.035, 0, 0.035]) {
    blade.localToWorld(a.set(x, 0.4, 0));
    blade.localToWorld(b.set(x, 0.9, 0));
    if (traceGrenadeSurface(views, [target], a, b)) return true;
    if (low)
      for (const point of [a, b])
        if (traceGrenadeSurface(views, [target], point, floor.set(point.x, 0, point.z))) return true;
  }
  return false;
}
