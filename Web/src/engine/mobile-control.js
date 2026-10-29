import { stopBoneSaw } from "./bone-saw.js";
import { selectedBossRanged } from "./boss-weapon-runtime.js";
import { createMobileAimState, stepMobileAim } from "../mobile-combat-aim.js";
import { selectedRangedProfile, chainedSight, bodies } from "../pistol-targeting.js";
import { validDirection } from "./enemy-core.js";
export function resetMobileControls(g) {
  if (g) {
    stopBoneSaw(g, g.player, "input-clear");
    g.touchTarget = null;
    g.touchTargetReady = false;
  }
  if (!g?.mobileAim) return;
  g.mobileAim = createMobileAimState(Math.atan2(g.player.facing.x, g.player.facing.z));
  g.mobileAiming = false;
  g.player.velocity = { x: 0, z: 0 };
}
export function mobileControl(g, intent, dt, services) {
  if (!g.mobileAim) return intent;
  const p = g.player,
    heading = Math.atan2(p.facing.x, p.facing.z);
  if (intent.mobile && !intent.moveHeld) p.velocity = { x: 0, z: 0 };
  const flame = !!g.flame?.equipped,
    manualFlame = flame && intent.manualFlameAim && validDirection(intent.aim);
  if ((!intent.mobile && !flame) || intent.cancel || (validDirection(intent.aim) && !manualFlame)) {
    g.mobileAim = createMobileAimState(heading);
    g.mobileAiming = false;
    if (intent.cancel) p.velocity = { x: 0, z: 0 };
    return intent;
  }
  const areaId = g.world.areaId,
    visible = intent.combatVisibleIds ?? intent.pistolVisibleIds;
  const ranged = !!selectedBossRanged(g) || !!g.pistol?.equipped || !!g.rifle?.selected || !!g.flame?.equipped,
    busy = !!p.swing || g.time < p.dodgeUntil || g.time < p.hurtUntil || (!!intent.guard && !ranged);
  if (busy) g.mobileAim = { ...g.mobileAim, heading };
  const result = stepMobileAim(g.mobileAim, {
    dt,
    move: intent.move ?? { x: 0, z: 0 },
    position: p.pos,
    targets: bodies(g).map((e) => ({
      id: e.placementKey,
      pos: e.pos,
      hp: e.hp,
      hostile: e.hostile !== false,
      visible: e.visible !== false && (!visible || visible.includes(e.id)),
      areaId: e.areaId ?? areaId,
      radius: e.radius,
    })),
    areaId,
    lineClear: chainedSight(g),
    mobile: !!intent.mobile,
    moveHeld: !!intent.moveHeld,
    alive: p.hp > 0,
    assistEnabled: g.mobileAssistEnabled,
    pistolEquipped: ranged,
    rangedRange: !flame ? selectedRangedProfile(g)?.rules.range : null,
    flameRange: flame ? g.world.flameData?.contact.range : null,
    fireHeld:
      ranged &&
      ((intent.held ?? []).includes("fire") || (intent.actions ?? []).includes("fire")),
    manualHeading: manualFlame ? Math.atan2(intent.aim.x, intent.aim.z) : null,
    flameEligible: services.flameAimEligible
      ? (key) =>
          services.flameAimEligible(
            g,
            bodies(g).find((e) => e.placementKey === key),
          )
      : undefined,
  });
  g.mobileAim = result.state;
  g.mobileAiming = !!intent.mobile;
  if (intent.mobile && !intent.moveHeld) p.velocity = { x: 0, z: 0 };
  if (!busy) p.facing = { ...result.direction };
  return { ...intent, move: result.move, aim: busy ? null : { ...p.facing } };
}
