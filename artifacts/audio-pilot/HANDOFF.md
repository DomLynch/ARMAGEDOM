# Donor audio and effects — ready for Lead integration

Scoped adapter on world-web. Camera trial 2751ed7 is its parent and separate change.
No main/combat/actors/HUD/package edits, Unity runs or builds.

## Integration

Import existing createAudio from effects.js. After choosing the pilot, construct:

```js
const audio = createAudio({donor: game.pilot === 'donor-knife', baseUrl: document.baseURI});
```

Call `audio.unlock()` synchronously from Enter/Resume's user-gesture handler,
then await its boolean result. False leaves playback safely disabled; inspect
`audio.state.error` for asset/decode failures. Resume happens before network awaits.
Call `audio.play(game.events)` once per emitted event batch. Call `audio.pause()`
on menu/blur; `audio.reset?.()` on retry; `audio.dispose?.()` on teardown.
Unlock again from the Resume gesture after suspension. `setEnabled(false)` cancels
active voices. Reset stops voices and cancels pending load but retains a decoded
buffer; pause additionally suspends context. Neither automatically resumes.

Add `audio/manifest.json` and `audio/combat.wav` to the package allowlist; fetch
assets are not discovered by the JS bundler. Manifest URL is relative to baseUrl;
sprite URL is relative to the manifest. No donor source.ogg required at runtime.

## Behaviour and provenance

Donor Pommel is a forward90-degree close arc (1.3 x combatScale), not the legacy
4.2m full circle. Hit uses victim position metadata. Block/parry use defender
position and forward120-degree feedback. Default002 createAudio() and FX preserved.

Eight existing donor cues,36 ranges: hit_flesh/hit_heavy .3; block/parry/guard_break1;
whoosh_light .12; whoosh_heavy .18; roll .12. Blocked hits do not duplicate hit audio.
No crowd/arena/finishers/new generated sounds. Donor revision303af39e97b758f50a84935eeb0cac6196fe98ae.
Manifest pins original sprite, manifest, cue mapping, generator and CC0 source
recording attribution/hashes. Project-authored procedural Foley reused under owner
approval; no broader redistribution licence inferred. Selected WAV is mono48k
PCM16,1,848,908bytes. Only listed decoded source ranges plus40ms silence separators;
no pitch or normalization. Donor bus compression/reverb not ported; gains are dry.

## Evidence and remaining acceptance

39/39 lane checks pass;4 new tests cover donor/default Pommel, victim hit location,
cue ordering/gains/omissions and exact selected PCM hashes/asset schema. Diff clean.
Actual Chromium gesture/decode/play/pause/resume/reset/mute/dispose passes with0
page errors; browser.json and receipt.json pin evidence and runtime hashes.
Browser fixture: serve Web on127.0.0.1:8893 and run browser.cjs (bundled Playwright).
Lead still owns integrated rendered fight, audible device mix, mobile Safari/Android
and physical-phone acceptance. This is an adapter handoff, not a live release.
