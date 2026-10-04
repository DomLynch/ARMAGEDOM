import * as THREE from "three";
import { createWorld } from "./world.js";
import { loadActors, createActors } from "./actors.js";
import { createGame, stepGame } from "./combat.js";
import { attachInput } from "./input.js";
import { createHUD } from "./hud.js";
import { createEffects, createAudio } from "./effects.js";
const canvas = document.getElementById("world"),
  enter = document.getElementById("enter"),
  baseUrl = new URL("./", document.baseURI);
const pilot = { pilot: "donor-knife" };
// Scale bodies and equipped gear independently of camera framing and combat.
const actorVisualScale = 1.1;
const actorManifest = "assets/donor/manifest.json";
const audio = createAudio({ donor: true, baseUrl });
let renderer,
  world,
  actors,
  effects,
  game,
  input,
  pendingLibrary,
  loaded = false,
  loading = false,
  paused = false,
  contextLost = false,
  last = 0,
  accumulator = 0;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera();
const hemi = new THREE.HemisphereLight(0xb9bec9, 0x4b3828, 1.6),
  sun = new THREE.DirectionalLight(0xffd7a0, 2.3);
sun.position.set(-7, 12, 6);
scene.add(hemi, sun);
const rim = new THREE.PointLight(0xd4c7a5, 3.2, 5, 2);
scene.add(rim);
function pause(value) {
  paused = value;
  accumulator = 0;
  last = 0;
  input?.clear();
  if (game) {
    game.player.buffer = null;
    game.player.guarding = false;
    game.player.parryUntil = 0;
  }
  if (value) audio.pause();
  if (renderer && loaded) renderer.setAnimationLoop(value ? null : frame);
}
const hud = createHUD({
  onRetry: restart,
  onPause: pause,
  onSound: (value) => audio.setEnabled(value),
});
function restart() {
  if (!loaded) return;
  input.clear();
  actors.reset();
  effects.reset();
  audio.reset();
  game = createGame(world, pilot);
  world.update(game.player.pos, 0, innerWidth, innerHeight, true);
  actors.update(game, 0);
  hud.update(game);
  accumulator = 0;
  audio.unlock().catch(() => {});
}
input = attachInput({
  canvas,
  onInteraction: () => audio.unlock().catch(() => {}),
  onMenu: () => {
    hud.toggleMenu();
    if (!paused) audio.unlock().catch(() => {});
  },
  onRetry: restart,
  isPaused: () => !loaded || paused || contextLost || game?.finished,
});
document
  .getElementById("resume")
  .addEventListener("click", () => audio.unlock().catch(() => {}));
document
  .getElementById("close-menu")
  .addEventListener("click", () => audio.unlock().catch(() => {}));
const touchPreview = new URLSearchParams(location.search).get("touch") === "1";
if (touchPreview) document.body.classList.add("touch");
function resize() {
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    world?.update(game?.player.pos ?? world.spawn, 0, innerWidth, innerHeight);
  }
  input?.clear();
  accumulator = 0;
  hud.resize();
  if (renderer && world && !contextLost) renderer.render(scene, camera);
}
window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  if (loaded && !paused) hud.toggleMenu();
});
function toDomain(v) {
  return {
    x: v.x * world.cameraRight.x - v.y * world.cameraForward.x,
    z: v.x * world.cameraRight.z - v.y * world.cameraForward.z,
  };
}
function intent() {
  const raw = input.take(),
    value = {
      ...raw,
      move: toDomain(raw.move),
      aim: raw.aim ? toDomain(raw.aim) : null,
    };
  if (raw.mouse) {
    const bounds = canvas.getBoundingClientRect(),
      point = world.screenToGround(
        ((raw.mouse.x - bounds.left) / bounds.width) * 2 - 1,
        1 - ((raw.mouse.y - bounds.top) / bounds.height) * 2,
      );
    if (point)
      value.aim = {
        x: point.x - game.player.pos.x,
        z: point.z - game.player.pos.z,
      };
  }
  return value;
}
function frame(ms) {
  const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
  last = ms;
  if (!world || !game || contextLost) return;
  if (loaded && !paused && !game.finished) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      stepGame(game, intent(), 1 / 60);
      effects.events(game);
      audio.play(game.events);
      accumulator -= 1 / 60;
      if (game.finished) {
        input.clear();
        break;
      }
    }
  }
  world.update(game.player.pos, paused ? 0 : dt, innerWidth, innerHeight);
  actors?.update(game, paused ? 0 : dt);
  effects?.update(game);
  rim.position
    .copy(world.toRender(game.player.pos, 2.4))
    .add(new THREE.Vector3(0, 0, 0.8));
  hud.update(game);
  renderer.render(scene, camera);
}
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  contextLost = true;
  pause(true);
  loaded = false;
  document.getElementById("entry").hidden = false;
  document.getElementById("hud").hidden = true;
  hud.failed("Graphics paused. Reload this page to restore your fight.");
  enter.textContent = "Reload game";
});
canvas.addEventListener("webglcontextrestored", () => location.reload());
enter.addEventListener("click", async () => {
  if (contextLost) {
    location.reload();
    return;
  }
  if (loading) return;
  loading = true;
  enter.disabled = true;
  enter.textContent = "Loading Westminster…";
  const start = performance.now();
  const audioReady = audio.unlock();
  try {
    renderer ??= new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    resize();
    hud.loading("Loading London and the original character rigs…");
    const results = await Promise.allSettled([
      createWorld({ THREE, renderer, scene, camera, baseUrl }),
      loadActors(
        baseUrl,
        (name) =>
          hud.loading(`${name.toUpperCase()} ready · loading encounter…`),
        actorManifest,
      ),
    ]);
    if (results.some((r) => r.status === "rejected")) {
      if (results[0].status === "fulfilled") results[0].value.dispose();
      if (results[1].status === "fulfilled") results[1].value.dispose();
      throw results.find((r) => r.status === "rejected").reason;
    }
    const [nextWorld, library] = results.map((r) => r.value);
    world = nextWorld;
    pendingLibrary = library;
    game = createGame(world, pilot);
    actors = createActors(scene, world, library, { visualScale: actorVisualScale });
    pendingLibrary = null;
    effects = createEffects(scene, world);
    actors.update(game, 0);
    renderer.setAnimationLoop(frame);
    if (!library.complete)
      throw Error(
        "Enemy exports are still being validated. This private candidate is not a complete fight yet.",
      );
    loaded = true;
    hud.ready();
    hud.loading("");
    document.getElementById("version").textContent =
      "Three.js · Larger characters trial 004";
    resize();
    renderer.render(scene, camera);
    const enterToFirstRenderMs = Math.round(performance.now() - start);
    if (!(await audioReady) && audio.state.error)
      console.warn("ARMAGEDOM_AUDIO_FAILED", audio.state.error);
    console.info(
      "ARMAGEDOM_READY",
      JSON.stringify({
        enterToFirstRenderMs,
        actorScale: world.layout.characterScale,
        actorVisualScale,
        zoom: world.layout.zoom,
        models: [...library.models.keys()],
        pilot: game.pilot,
        audio: audio.state,
        devicePixelRatio: renderer.getPixelRatio(),
      }),
    );
  } catch (error) {
    console.error("ARMAGEDOM_LOAD_FAILED", error);
    hud.failed(error.message);
    if (!loaded) {
      actors?.dispose();
      pendingLibrary?.dispose();
      pendingLibrary = null;
      effects?.dispose();
      world?.dispose();
      actors = effects = world = game = null;
      renderer?.setAnimationLoop(null);
      audio.reset();
    }
  } finally {
    loading = false;
  }
});
