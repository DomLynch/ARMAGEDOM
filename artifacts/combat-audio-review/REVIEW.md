# Combat18 audio review —5October2026

Read-only046 WIP snapshot; existing WebUI source preserved. Not new runtime implementation. SourceSHA256 e66cbec4f73eee39b6884dd96bfca55a52666526517ae363f01ac1caa47d391b. References ZIP179c75b5/runtimeab135cc9 and previous combat-impact a56a38b2 receipt reused. No new donor/media/build job.

## Confirmed concrete seam

Context private inside createDonorAudio closure, same original gesture unlock/networkgeneration owner. No public context getter required. Existing master outputGain .65 lazy once, connectedonce to existingcontext.destination. Current `setMode(value)` from existingmenu updates requestedmode and clears voices. `effectiveMode()` dynamically applies reducedmotionLow; Off wins; independent `setEnabled` mute unchanged. `play(events)` consumes accepted native perstep events. Do not introduce optionalplaymode because setter now exists. WebUI soleexistingeditor.

Bounded Web Audio scheduling probe against captured WIP (injected fake WebAudio nodes, not rendered/browser/ear acceptance):
- High pistol tone220→48Hz/.11s/gain.22 +cachednoise.065s/highpass900/gain.15:2sources.
- Low uses same2sources but gain*.4 (.088/.06); reducedmotion routes sameLow code.
- Off shot single basic tone240→55/.08/.085. No new required buttons/layout.
- Exactly1context/1noiseBuffer acrossHigh/Low/Off; repeated1000shots max16sources allocated/started (cap checked beforeallocation).
- Reset +delayed captured onended callbacks: voices0, everyownednode disconnectedonce. No outputduplication onemit. Existing generation guard unchanged.
- Melee hit+death remains1existingdonorWAV; pistol events excluded from donorCues input to avoid duplicateWAV. No added assets/PCM.

## Two robustness gaps observed; ordinary native pair not defective by inference

Standalone pistoldeath produces0sources. Two positivepistolhit events for victim7 plus one death7 produces6sources/killEvents2. Current native gun kill emits onepositivehit+death perstep, so these are adversarial batch findings, not proof normalnativekill is duplicated. Donor reference calls hit(killed) once; keep onelethalcueset pervictim batch. If standalone accepteddeath shouldalwayssound, concrete shortguidance below.

```js
const key = e => e.actor?.id ?? e.victimId ?? e.actor;
const lethal = new Map(events
  .filter(e => e.type === 'death' && e.weapon === 'pistol' && key(e) != null)
  .map(e => [key(e), e]));
const emitted = new Set();
// Existing positive/unblocked pistol hit branch:
const id = key(event), killed = id != null && lethal.has(id);
if (killed && emitted.has(id)) continue;
if (killed) emitted.add(id);
// Existing tone/noise branch emits once with killed; keep actual Low gain factor.
// After that loop, optional accepted death-only fallback, same killedcue emitter:
for (const [id, event] of lethal) if (!emitted.has(id)) {
  emitted.add(id);
  // Emit SAME kill cue once; increment killEvents once, not fake hitEvents.
}
```

Prefer tiny local `impactCue(killed)` emitter reused by hit and fallback, not secondcontext or publicaudioengine. In Off retainbasic singlehit/killtone; no proceduralmelee hit layering. Actual killconfirmation for melee remains existingWAV decision unless explicitly integrated; do not double thatWAV.

## Integration checks still needed

Probe is scheduling/lifecycle evidence only. Frozenfinal WebUI tests should cover blocked/zero hits, missing IDs, distinctvictims, positivehit+death once, death-only policy, optional nodeallocationfailure contained within audioowner, mute/pause/dispose/reunlock, cachednoise and delayedended callbacks. Existing aborteddecode test remainsvalid and mustnot be weakened; temporary probe does not override it. Actual compiled native shot/hit/kill and modecontrast/audioaudibility ondevice remain WebUI/Lead proof. Current mastergain .65 alsoattenuates oldmeleeWAV; reviewmix inrunninggame, not fake node confidence.
