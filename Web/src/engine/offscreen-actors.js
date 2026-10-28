// Off-screen hostile presentation throttle. Living enemies outside the camera view (plus a margin), or farther than a set distance
// from the player, skip the animation mixer, skeleton and matrix work on most frames and are hidden from the renderer, so ten
// residents per area cost about what three did. AI, movement and combat are untouched: this only decides how often the picture is
// refreshed. When an actor comes back into view (or is due its reduced-rate update) it is updated at once with the time it missed, so
// it does not pop. Numbers live in data/offscreenActors.json.
import { createActorLod } from "./actor-lod.js";
import { QUALITY } from "./quality-tier.js";

export { validateOffscreenActors } from "./game-data-offscreen.js";

// One throttle per actors manager. `begin` once per update; `skip` per living enemy; `takePending` when it is updated.
export function createOffscreenThrottle(THREE, rules) {
  const frustum = new THREE.Frustum(),
    matrix = new THREE.Matrix4(),
    sphere = new THREE.Sphere(),
    lod = createActorLod(rules.lod);
  let ready = false,
    frame = 0,
    px = 0,
    pz = 0;
  return {
    begin(camera, playerPos) {
      frame++;
      lod.sweep();
      ready = !!camera?.projectionMatrix && !!camera.matrixWorldInverse && !!playerPos;
      if (!ready) return;
      px = playerPos.x;
      pz = playerPos.z;
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
    },
    // True when this actor's presentation can be skipped this frame. Keeps the actor hidden while off screen.
    skip(entity, view, dt) {
      if (!ready) return false;
      const dx = entity.pos.x - px,
        dz = entity.pos.z - pz,
        tier = QUALITY.row(),
        distance = Math.hypot(dx, dz) / tier.distanceScale; // a weak device sees every actor farther away (data/qualityTier.json)
      lod.update(view, distance);
      if (!rules.enabled) return false;
      let onScreen = distance <= rules.fullRateRadius;
      if (!onScreen && distance <= rules.farDistance) {
        sphere.center.set(entity.pos.x, 0, -entity.pos.z);
        sphere.radius = rules.marginMetres + entity.radius;
        onScreen = frustum.intersectsSphere(sphere);
      }
      // The ground shadow is its own scene object: it is shown and hidden with the body, or a far enemy leaves a lone blob behind.
      // (The game has no shadow-map pass; the shadow is this one blob draw, which a far actor also skips.)
      const show = (visible) => {
        view.root.visible = visible;
        if (view.shadow) view.shadow.visible = visible && distance <= rules.shadowMaxDistance * tier.shadowScale;
      };
      if (onScreen) {
        show(true);
        // In view but far: the skeleton is refreshed at a reduced rate and the body stays drawn (the missed time is caught up).
        if (distance <= rules.reducedRate.distance || (frame + entity.id) % rules.reducedRate.everyNthFrame === 0)
          return false;
        view.missedDt = (view.missedDt ?? 0) + dt;
        return true;
      }
      show(false);
      if ((frame + entity.id) % rules.everyNthFrame === 0) return false;
      view.missedDt = (view.missedDt ?? 0) + dt;
      return true;
    },
    // The time skipped since the last update, handed to the animation so it catches up in one step.
    takePending(view) {
      const missed = view.missedDt ?? 0;
      view.missedDt = 0;
      return missed;
    },
  };
}
