import { WEAPON_AUDIO } from "./engine/weapon-catalog.js";
import { GAME_DATA } from "./engine/game-data.js";

// data/audio.json: voice engine, loop levels and the synthesized cue rows.
const A = GAME_DATA.audio;
const bipolar = (unit) => unit * 2 - 1; // tuning-ok: maps 0..1 onto -1..1 (white noise samples)
// Use the actually presented sever outcome; replace its generic impact rather than doubling it.
export function presentationAudioEvents(events, severs) {
  if (!severs.length) return events;
  const victims = new Set(severs.map((e) => e.victimId));
  return [...events.filter((e) => !(["hit", "death"].includes(e.type) && victims.has(e.actor?.id))), ...severs];
}
// Selected donor cues only; metadata is pinned in public/audio/manifest.json.
export function donorCues(events) {
  const impacts = [],
    air = [];
  for (const event of events) {
    const heavy = event.audioWeight === "heavy" || event.moveId === "heavy_overhead" || event.action === "heavy";
    if (event.type === "sever-presented") impacts.push({ name: "hit_heavy", gain: A.cueGains.sever });
    else if (event.type === "hit" && !event.blocked && event.amount !== 0)
      impacts.push({ name: heavy ? "hit_heavy" : "hit_flesh", gain: A.cueGains.hit });
    else if (event.type === "parry") impacts.push({ name: "parry", gain: 1 });
    else if (event.type === "block") impacts.push({ name: "block", gain: 1 });
    else if (event.type === "guard-break") impacts.push({ name: "guard_break", gain: 1 });
    else if (event.type === "attack" || event.type === "enemy-attack")
      air.push({
        name: heavy ? "whoosh_heavy" : "whoosh_light",
        gain: heavy ? A.cueGains.whooshHeavy : A.cueGains.whooshLight,
      });
    else if (event.type === "dodge") air.push({ name: "roll", gain: A.cueGains.roll });
  }
  return [...impacts, ...air];
}
// iOS silences Web Audio while the ringer switch is off unless the page asks for
// playback audio. Older browsers have no audioSession, so only set it when present.
export function requestPlaybackAudioSession(nav = globalThis.navigator) {
  if (nav && "audioSession" in nav) nav.audioSession.type = "playback";
}

export function createDonorAudio({ baseUrl = globalThis.document?.baseURI } = {}) {
  let context = null,
    enabled = true,
    paused = false,
    buffer = null,
    manifest = null,
    loading = null,
    aborter = null,
    generation = 0,
    error = null,
    mode = "high",
    noiseBuffer = null,
    output = null,
    played = 0,
    shotEvents = 0,
    hitEvents = 0,
    killEvents = 0;
  let sawMotor = null,
    railgunHum = null;
  const sawActors = new Set();
  const voicesFull = () => active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= A.engine.voiceCapacity;
  function stopSaw() {
    if (!sawMotor) return;
    try {
      sawMotor.source.stop();
    } catch {}
    sawMotor.source.disconnect();
    sawMotor.gain.disconnect();
    sawMotor = null;
  }
  function startSaw() {
    if (sawMotor || !enabled || context?.state !== "running") return;
    const source = context.createOscillator(),
      gain = context.createGain();
    source.type = "sawtooth";
    source.frequency.value = A.saw.frequency;
    gain.gain.value = effectiveMode() === "off" ? A.saw.gainOff : A.saw.gain;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    sawMotor = { source, gain };
  }
  function stopRailgunHum() {
    if (!railgunHum) return;
    try {
      railgunHum.source.stop();
    } catch {}
    railgunHum.source.disconnect();
    railgunHum.gain.disconnect();
    railgunHum = null;
  }
  function startRailgunHum(seconds) {
    if (railgunHum || !enabled || context?.state !== "running" || voicesFull()) return;
    const source = context.createOscillator(),
      gain = context.createGain();
    source.type = "sine";
    source.frequency.setValueAtTime(A.railgunHum.fromHz, context.currentTime);
    source.frequency.linearRampToValueAtTime(A.railgunHum.toHz, context.currentTime + seconds);
    gain.gain.value = A.railgunHum.gain;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    railgunHum = { source, gain };
  }
  const active = new Set(),
    lastVariants = new Map();
  function stop() {
    stopRailgunHum();
    stopSaw();
    sawActors.clear();
    generation++;
    aborter?.abort();
    loading = null;
    for (const voice of active) {
      try {
        voice.source.stop();
      } catch {}
      voice.cleanup();
    }
    active.clear();
  }
  const effectiveMode = () =>
    mode === "off"
      ? "off"
      : mode === "high" && !(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
        ? "high"
        : "low";
  function emit(source, duration, volume, filter = null, offset = null) {
    if (voicesFull()) {
      source.disconnect();
      filter?.disconnect();
      return;
    }
    if (!output) {
      output = context.createGain();
      output.gain.value = A.engine.outputGain;
      output.connect(context.destination);
    }
    const gain = context.createGain(),
      at = context.currentTime;
    gain.gain.setValueAtTime(A.engine.floorGain, at);
    gain.gain.exponentialRampToValueAtTime(
      volume * (effectiveMode() === "low" ? A.engine.lowModeFactor : 1),
      at + A.engine.attackSeconds,
    );
    gain.gain.exponentialRampToValueAtTime(A.engine.floorGain, at + duration);
    source.connect(filter ?? gain);
    if (filter) filter.connect(gain);
    gain.connect(output);
    let ended = false;
    const voice = {
      source,
      gain,
      filter,
      cleanup() {
        if (ended) return;
        ended = true;
        source.onended = null;
        active.delete(voice);
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      },
    };
    active.add(voice);
    played++;
    source.onended = voice.cleanup;
    if (offset === null) {
      source.start(at);
      source.stop(at + duration + A.engine.stopPadSeconds);
    } else source.start(at, offset, duration);
  }
  function tone(from, to, duration, gain, type = "triangle") {
    if (voicesFull()) return;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(from, context.currentTime);
    source.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
    emit(source, duration, gain);
  }
  // One data row ({ from, to, seconds, gain, type? }), with the gain or length replaced where a mode asks for it.
  const toneRow = (row, gain = row.gain, seconds = row.seconds) => tone(row.from, row.to, seconds, gain, row.type);
  const noiseRow = (row) => noise(row.seconds, row.gain, row.cutoff);
  function noise(duration, gain, frequency) {
    if (voicesFull()) return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * A.engine.noiseBufferSeconds),
        context.sampleRate,
      );
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = bipolar(Math.random());
    }
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter();
    source.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = frequency;
    emit(source, duration, gain, filter);
  }
  async function load() {
    const token = generation;
    aborter = new AbortController();
    const signal = aborter.signal;
    const url = new URL("audio/manifest.json", baseUrl),
      response = await fetch(url, { signal });
    if (!response.ok) throw Error(`Donor audio manifest HTTP ${response.status}`);
    const next = await response.json(),
      audio = await fetch(new URL(next.url, url), { signal });
    if (!audio.ok) throw Error(`Donor audio HTTP ${audio.status}`);
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    if (token !== generation || signal.aborted) return false;
    manifest = next;
    buffer = decoded;
    return true;
  }
  // iOS moves a playing context to "interrupted" (call, Siri, alarm, other audio) or the system suspends it. While the
  // player is still in the game, ask to come back at once; iOS may refuse outside a gesture, and then the next touch
  // (every control's pointerdown and every release call unlock) does it. Our own pause() must not be undone here.
  function watchState(ctx) {
    ctx.addEventListener?.("statechange", () => {
      if (context !== ctx || paused || !enabled || globalThis.document?.hidden) return;
      if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => {});
    });
  }
  return {
    get state() {
      return {
        railgunChargeActive: !!railgunHum,
        sawMotorActive: !!sawMotor,
        ready: !!buffer,
        context: context?.state ?? "locked",
        enabled,
        activeVoices: active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0),
        voiceCapacity: A.engine.voiceCapacity,
        mode: effectiveMode(),
        played,
        shotEvents,
        hitEvents,
        killEvents,
        noiseCached: !!noiseBuffer,
        error,
      };
    },
    // deferLoad: resume the context inside the gesture but leave the cue file for a later unlock() (the Enter click starts the game's own
    // downloads; the 0.3 MB of cues waits until the game can take input). Without it the first unlock() also loads the cues.
    async unlock({ deferLoad = false } = {}) {
      const token = generation;
      try {
        requestPlaybackAudioSession();
        paused = false;
        if (!context) {
          context = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
          watchState(context);
        }
        // Resume directly within the gesture call, before awaiting network/decode.
        await context.resume();
        if (token !== generation) return false;
        if (!buffer && !deferLoad) {
          if (!loading) {
            // An aborted decode can finish after the next gesture starts a load.
            const pending = load().finally(() => {
              if (loading === pending) loading = null;
            });
            loading = pending;
          }
          if (!(await loading)) return false;
        }
        error = null;
        return token === generation && context.state === "running";
      } catch (e) {
        if (token === generation && e.name !== "AbortError") error = e.message;
        return false;
      }
    },
    // Fetch and decode the cue file if a deferred unlock() left it: touches nothing else (a paused or suspended context stays that way).
    async preload() {
      if (buffer) return true;
      if (!context) return false;
      const token = generation;
      try {
        if (!loading) {
          const pending = load().finally(() => {
            if (loading === pending) loading = null;
          });
          loading = pending;
        }
        return await loading;
      } catch (e) {
        if (token === generation && e.name !== "AbortError") error = e.message;
        return false;
      }
    },
    play(events) {
      if (!enabled || !buffer || context?.state !== "running") return;
      try {
        const id = (e) => e.actor?.id ?? e.victimId,
          killed = new Set(
            events
              .filter((e) => e.type === "death" && ["pistol", "rifle", "shotgun"].includes(e.weapon) && id(e) != null)
              .map(id),
          ),
          playedLethal = new Set(),
          off = effectiveMode() === "off";
        function hitCue(lethal, countHit = true) {
          if (countHit) hitEvents++;
          if (lethal) killEvents++;
          if (off) toneRow(lethal ? A.hit.off.lethal : A.hit.off.normal);
          else {
            const row = lethal ? A.hit.lethal : A.hit.normal;
            toneRow(row.tone);
            noiseRow(row.noise);
            if (lethal) toneRow(row.ring);
          }
        }
        for (const event of events) {
          if (event.type === "railgun-charge-start") startRailgunHum(event.seconds);
          else if (event.type === "railgun-charge-stop") stopRailgunHum();
          else if (event.type === "railgun-shot") {
            stopRailgunHum();
            shotEvents++;
            toneRow(A.railgunShot.crack);
            toneRow(A.railgunShot.thump);
            noiseRow(A.railgunShot.noise);
          } else if (event.type === "saw-start") {
            sawActors.add(event.actor.id);
            startSaw();
          } else if (event.type === "saw-stop") {
            sawActors.delete(event.actor.id);
            if (!sawActors.size) stopSaw();
          }
          if (event.type === "sever-presented") {
            hitEvents++;
            killEvents++;
          } else if (event.type === "shot" || event.type === "reaper-shot" || event.type === "boss-shotgun-shot") {
            shotEvents++;
            const cue = WEAPON_AUDIO[event.weapon];
            const fallback = A.shot.fallback;
            tone(
              off ? A.shot.off.from : (cue?.from ?? fallback.from),
              off ? A.shot.off.to : (cue?.to ?? fallback.to),
              off ? A.shot.off.seconds : (cue?.seconds ?? fallback.seconds),
              off ? A.shot.off.gain : (cue?.gain ?? fallback.gain),
            );
            if (!off)
              noise(
                cue?.noiseSeconds ?? fallback.noiseSeconds,
                cue?.noiseGain ?? fallback.noiseGain,
                cue?.cutoff ?? fallback.cutoff,
              );
          } else if (event.type === "rocket-launch" || event.type === "boss-rocket-launch") {
            shotEvents++;
            toneRow(A.rocketLaunch.tone);
            if (!off) noiseRow(A.rocketLaunch.noise);
          } else if (event.type === "trap-crate-open") toneRow(GAME_DATA.trapCrates.audio.open);
          else if (event.type === "trap-crate-beep") toneRow(GAME_DATA.trapCrates.audio.beep);
          else if (event.type === "grenade-blast" || event.type === "boss-rocket-blast" || event.type === "trap-crate-blast") {
            const cue = WEAPON_AUDIO.grenade;
            tone(cue.from, cue.to, off ? A.grenadeOff.seconds : cue.seconds, off ? A.grenadeOff.gain : cue.gain);
            if (!off) noise(cue.noiseSeconds, cue.noiseGain, cue.cutoff);
          } else if (event.type === "pickup") toneRow(A.pickup);
          else if (
            event.type === "hit" &&
            !event.blocked &&
            event.amount > 0 &&
            ["pistol", "rifle", "shotgun"].includes(event.weapon)
          ) {
            const key = id(event),
              lethal = key != null && killed.has(key);
            if (lethal) {
              if (playedLethal.has(key)) continue;
              playedLethal.add(key);
            }
            hitCue(lethal);
          }
        }
        for (const key of killed) if (!playedLethal.has(key)) hitCue(true, false);
        for (const cue of donorCues(events.filter((e) => !["pistol", "rifle", "shotgun"].includes(e.weapon)))) {
          const variants = manifest.cues[cue.name];
          if (!variants?.length) continue;
          // Rotate existing takes without repeating the preceding take; no new sound/pitch layers.
          const index = ((lastVariants.get(cue.name) ?? -1) + 1) % variants.length;
          lastVariants.set(cue.name, index);
          if (voicesFull()) continue;
          const [offset, duration] = variants[index],
            source = context.createBufferSource();
          source.buffer = buffer;
          emit(source, duration, cue.gain, null, offset);
        }
      } catch (e) {
        error = e.message;
        stop();
      }
    },
    silenceRailgun() {
      stopRailgunHum();
    },
    silenceSaw() {
      sawActors.clear();
      stopSaw();
    },
    setMode(value) {
      mode = ["high", "low", "off"].includes(value) ? value : "low";
      stop();
    },
    setEnabled(value) {
      enabled = !!value;
      if (!enabled) stop();
    },
    pause() {
      paused = true;
      stop();
      return context?.suspend();
    },
    reset() {
      stop();
      lastVariants.clear();
    },
    dispose() {
      stop();
      buffer = noiseBuffer = null;
      manifest = null;
      output?.disconnect();
      output = null;
      return context?.close();
    },
  };
}
