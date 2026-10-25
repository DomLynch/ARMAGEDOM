import { WEAPON_AUDIO } from "./engine/weapon-catalog.js";
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
    if (event.type === "sever-presented") impacts.push({ name: "hit_heavy", gain: 0.5 });
    else if (event.type === "hit" && !event.blocked && event.amount !== 0)
      impacts.push({ name: heavy ? "hit_heavy" : "hit_flesh", gain: 0.3 });
    else if (event.type === "parry") impacts.push({ name: "parry", gain: 1 });
    else if (event.type === "block") impacts.push({ name: "block", gain: 1 });
    else if (event.type === "guard-break") impacts.push({ name: "guard_break", gain: 1 });
    else if (event.type === "attack" || event.type === "enemy-attack")
      air.push({ name: heavy ? "whoosh_heavy" : "whoosh_light", gain: heavy ? 0.18 : 0.12 });
    else if (event.type === "dodge") air.push({ name: "roll", gain: 0.12 });
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
    source.frequency.value = 185;
    gain.gain.value = effectiveMode() === "off" ? 0.015 : 0.035;
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
    if (
      railgunHum ||
      !enabled ||
      context?.state !== "running" ||
      active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= 16
    )
      return;
    const source = context.createOscillator(),
      gain = context.createGain();
    source.type = "sine";
    source.frequency.setValueAtTime(90, context.currentTime);
    source.frequency.linearRampToValueAtTime(360, context.currentTime + seconds);
    gain.gain.value = 0.025;
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
    if (active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= 16) {
      source.disconnect();
      filter?.disconnect();
      return;
    }
    if (!output) {
      output = context.createGain();
      output.gain.value = 0.65;
      output.connect(context.destination);
    }
    const gain = context.createGain(),
      at = context.currentTime;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume * (effectiveMode() === "low" ? 0.4 : 1), at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
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
      source.stop(at + duration + 0.01);
    } else source.start(at, offset, duration);
  }
  function tone(from, to, duration, gain, type = "triangle") {
    if (active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= 16) return;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(from, context.currentTime);
    source.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
    emit(source, duration, gain);
  }
  function noise(duration, gain, frequency) {
    if (active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= 16) return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.16), context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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
        voiceCapacity: 16,
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
          if (off) tone(lethal ? 1450 : 1000, lethal ? 550 : 800, lethal ? 0.09 : 0.035, 0.062, "sine");
          else {
            tone(lethal ? 160 : 280, lethal ? 55 : 130, lethal ? 0.14 : 0.065, 0.16);
            noise(lethal ? 0.085 : 0.03, 0.1, 1700);
            if (lethal) tone(1000, 1500, 0.09, 0.065, "sine");
          }
        }
        for (const event of events) {
          if (event.type === "railgun-charge-start") startRailgunHum(event.seconds);
          else if (event.type === "railgun-charge-stop") stopRailgunHum();
          else if (event.type === "railgun-shot") {
            stopRailgunHum();
            shotEvents++;
            tone(1100, 65, 0.18, 0.16, "sawtooth");
            tone(660, 110, 0.2, 0.08);
            noise(0.06, 0.12, 1800);
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
            tone(
              off ? 240 : (cue?.from ?? 220),
              off ? 55 : (cue?.to ?? 48),
              off ? 0.08 : (cue?.seconds ?? 0.11),
              off ? 0.085 : (cue?.gain ?? 0.22),
            );
            if (!off) noise(cue?.noiseSeconds ?? 0.065, cue?.noiseGain ?? 0.15, cue?.cutoff ?? 900);
          } else if (event.type === "rocket-launch" || event.type === "boss-rocket-launch") {
            shotEvents++;
            tone(160, 55, 0.12, 0.22);
            if (!off) noise(0.09, 0.18, 850);
          } else if (event.type === "grenade-blast" || event.type === "boss-rocket-blast") {
            const cue = WEAPON_AUDIO.grenade;
            tone(cue.from, cue.to, off ? 0.1 : cue.seconds, off ? 0.06 : cue.gain);
            if (!off) noise(cue.noiseSeconds, cue.noiseGain, cue.cutoff);
          } else if (event.type === "pickup") tone(660, 880, 0.16, 0.025, "sine");
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
          if (active.size + (sawMotor ? 1 : 0) + (railgunHum ? 1 : 0) >= 16) continue;
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
