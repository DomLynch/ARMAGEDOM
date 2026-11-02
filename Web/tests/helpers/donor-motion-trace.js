import * as THREE from "three";
import { DonorMotion, donorSwingPhase } from "../../src/donor-motion.js";

const round = (n) => Math.round(n * 1e9) / 1e9;
const names = [
  "Idle",
  "Walk",
  "Run",
  "StrafeLeft",
  "StrafeRight",
  "Guard",
  "Death",
  "Dodge",
  "Stab",
  "Slash",
  "Hit",
  "Attack",
];

function clip(name, duration) {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack(".position", [0, duration], [0, 0, 0, 0, 1, 0]),
  ]);
}

function build(motion) {
  const root = new THREE.Group(),
    model = new THREE.Group();
  root.add(model);
  const clips = names.map((n, i) => clip(n, 0.8 + i * 0.1));
  const description = {
    motion,
    clips: {
      idle: "Idle",
      walk: "Walk",
      run: "Run",
      strafeLeft: "StrafeLeft",
      strafeRight: "StrafeRight",
      guard: "Guard",
      death: "Death",
      dodge: "Dodge",
      stab: "Stab",
      slash: "Slash",
      hit: "Hit",
    },
  };
  return { root, motion: new DonorMotion(root, model, clips, description) };
}

// Presentation numbers in donor-motion.js: the swing-phase curve, the saw poses and the locomotion clock.
export function donorMotionTrace() {
  const out = { swing: [], saw: [], moves: [] };
  for (const [timing, source] of [
    [{ windup: 14, active: 6, recovery: 16 }, 0.34],
    [{ windup: 22, active: 5, recovery: 26 }, 0.48],
    [{ windup: 12, active: 4, recovery: 20 }, 0],
    [{ windup: 18, active: 4, recovery: 18 }, 1],
  ])
    for (let age = -2; age <= 70; age += 1.5) out.swing.push(round(donorSwingPhase(age, timing, source)));
  for (const phase of ["windup", "active", "recovery"]) {
    const { motion } = build("hero");
    motion.update({ hp: 100, sawPhase: { phase }, dodgeUntil: 0 }, 1, 1 / 60);
    out.saw.push([motion.currentClip, round(motion.currentPhase)]);
  }
  const scenarios = [
    { motion: "hero", speed: 0.04, face: 0 },
    { motion: "hero", speed: 0.06, face: 0 },
    { motion: "hero", speed: 3, face: 0 },
    { motion: "hero", speed: 4.1, face: 0 },
    { motion: "hero", speed: 4.2, face: 0 },
    { motion: "hero", speed: 6, face: 0, running: true },
    { motion: "hero", speed: 6, face: 0, stride: 1.3 },
    { motion: "hero", speed: 2, side: -1 },
    { motion: "hero", speed: 2, side: 1, guarding: true },
    { motion: "hero", speed: 0, guarding: true },
    { motion: "rat", speed: 0.04 },
    { motion: "wolf", speed: 0.06 },
  ];
  for (const s of scenarios) {
    const { root, motion } = build(s.motion);
    root.scale.setScalar(1.265);
    const entity = { hp: 100, swing: null, guarding: !!s.guarding, running: !!s.running, dodgeUntil: 0 };
    if (s.stride) motion.description.stride = s.stride;
    motion.update(entity, 0, 0);
    const trail = [];
    for (let tick = 1; tick <= 40; tick++) {
      const step = s.speed / 60;
      if (s.side) root.position.x += s.side * step;
      else root.position.z += step;
      motion.update(entity, tick / 60, 1 / 60);
      trail.push([motion.currentClip, round(motion.currentPhase)]);
    }
    out.moves.push({ s, trail });
    motion.dispose();
  }
  return out;
}
