# One knife encounter — Combat handoff, 2026-10-04

Base: a2acec135ef4c85a6cb452f27042a8849b1268fa. Donor: 303af39e97b758f50a84935eeb0cac6196fe98ae.
`provenance.json` pins the selected source and authored assets. `knife-paths.js` contains only four unchained paths for hero and Goblin; originals remain read-only.

## Integration entry

Lead activates **both initial load and retry** with `createGame(world, {pilot:'donor-knife'})` only alongside Character's matching warrior+knife/Goblin assets and motion. Default `createGame(world)` keeps the original002 profile. Both use the same stepGame/world/entity loop; never call a second duel engine. Pilot requires 1/60-second calls (existing main accumulator does this); larger/skipped ticks throw before mutation.

Pilot starts after ordinary input/movement and the existing2-second encounter delay. spawnWave places one120HP Goblin through `world.move(player.pos,{x:0,z:4},.4)`, preserving actual Westminster road clearance. Player150HP. Goblin follows the current collision/movement API with authored slash/stab/slash/heavy pattern; no imported duel AI, ranks or ring. Last opponent death ends encounter; player death wins precedence for lethal trades. Normal loot/state APIs remain in the shared loop; this one-enemy pilot invents no new progression.

## Character mapping

| Slot | moveId | clip | windup/active/recovery ticks | source contact |
| --- | --- | --- | --- | --- |
| Slash | alternating light_right/light_left | Attack/Return | 14/6/16 | .34 |
| Stab | thrust | Riposte | 12/4/20 | .34 |
| Heavy | heavy_overhead | Heavy | 22/5/26 | .48 |
| Special | skill_pommel | Skill_Pommel | 18/4/18 | .45 |
| Dodge | roll | Roll | 36 total; safe ages4–20 inclusive | linear authored roll |
| Guard | held guard and fresh parry | Guard/Parry/BlockImpact | parry10, cooldown30, parry stun90 | outcome-specific |

Special mapping is confirmed by donor `POMMEL_BASH` including knife, `PLAYER_CLIPS` and `attackSpecs.pommel.source=18/40`. It is an authored90-degree close cone at1.3m, not a360-degree shockwave and not a blade-path hit. The player knife equip overrides warrior Heavy; Character must include that exact override.

Entity fields: `rig:'hero'|'goblin'`, `weapon:'knife'`, `combatScale` equals London characterScale (1.265 by default), `bodyScale` is1 for hero/.78 for Goblin capsule proportions. Goblin GLB is already short: do not multiply its model root by .78 again. Root rig model scale and simulation blade scale must match. `swing` exposes action, moveId, clip, path, sourceContact, timing={windup,active,recovery} in ticks, ageTicks, start/hitAt/end in seconds. Path-backed clips must use exported `swingProgress(ageTicks/total,windup/total,sourceContact)`; no inherited procedural Machete overlay on donor attacks. Pommel uses its authored .45 contact map. Held attacks repeat unchained base timings; no chamber/charge or accelerated chains.

`worldBlade` reflects localX consistently with existing actor yaw `atan2(facing.x,-facing.z)` and world.toRender(x,y,-z). Missing rig/path bake throws; no hero fallback for Goblin. Contact is swept between old/new attacker and victim transforms at<=2cm steps against an upright scaled capsule. Per-swing victim IDs prevent repeats; stab picks nearest contacted victim. Obstacles are checked by world.lineClear. Contacts are decided before damage, preserving simultaneous trades. Direction stays at press-time aim during the committed swing; lunges/shoves use world.move.

`response={clip,start,ticks}` exposes Hit/Death/Parry/BlockImpact/Deflected. Live enemies are removed on death; their entity references remain in `game.corpses` with144-tick Death response until retry. Lead actor integration must include corpses and allow death presentation to advance after `game.finished` while simulation stays frozen. Existing actors.js will otherwise remove the victim immediately. No browser/death-render acceptance is claimed by this source handoff.

## Defence and HUD/audio contract

Guard adapts donor finite120-degree frontal coverage to the existing single Guard button; five-side directional guarding is not imported. Fresh press opens10 ticks only if30-tick parry cooldown elapsed. Successful parry stops damage and stuns attacker90ticks. Holding past window blocks; first3 block ticks halve guard cost and stop chip. Regular light/thrust chips0; heavy chips .2, Special .4. Insufficient guard spends up to60capacity and allows full damage/stagger. Guard uses existing100capacity bar,40/s regen after45-tick spend delay, half rate while held; no new stamina/posture economy/UI. A released missed parry sets guardExposedUntil for8ticks: guard is unavailable, attacks/dodge remain available (donor human guard semantics); this is separate from guardBrokenUntil and must not display BROKEN. Roll moves5.2m/s, locks direction at press, retreats opposite current aim when stationary, has vulnerable startup/tail, and cannot cancel a committed attack/hurt. Startup damage interrupts roll.

`game.cooldowns={heavy:0,special:15,dodge:.6}` is authoritative metadata for HUD. Heavy is gated by its full53-tick commitment, without an added1.6s cooldown. Special spends15s at commitment even on a whiff; dodge gated until36-tick roll ends. HUD's existing hardcoded1.6/7/1.05 periods must be adapted by Web/UI/Lead; this lane does not edit HUD.

Outcome event `actor` retains existing presentation semantics: hit/death actor=victim, parry/block actor=defender. `attackerId` and `victimId` identify damage parties explicitly; never infer attacker from hit.actor. `position` is victim ground position, not precision anatomical contact. moveId/weapon=knife/material=iron are present for sounds. Attack/enemy-attack actor=attacker. Existing effects/audio must adapt: Special FX currently draws4.2m360degree shockwave, and oscillator cues are not donor sprite sounds. World/Audio owns focused matching impact/whoosh/parry/block cues and gesture-unlock checks.

## Decisive source checks and remaining acceptance

28 pilot checks plus35 original Web checks:63 total. Red-green covered premature/cone contact, actual blocked Westminster spawn, roll startup interruption, blocked chip incorrectly staggering, guard/dodge/cooldown and corpse retention. Real Westminster layout/createGeometry headless fight clears at12.93simulated seconds, player30HP,12incoming and12outgoing hits; every live entity stayed within registered circle-clear road. This is CPU simulation evidence, not animation, frame timing, audio or browser proof.

Lead integrates Character motion/assets and Web/UI metadata; Auditor reviews this focused diff. Next actual browser acceptance: forward/scale and rendered blade-to-bake parity, proper grip, all six actions, held guard/parry/dodge, two-thumb/keyboard+mouse, menu/rotation/background safety, death animation/retry and full London fight with matching audio. Then served exact-version and physical iPhone/Android/owner feel. No publishing, build, Unity or paid job ran in this lane.
