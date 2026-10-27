// Off-screen hostile presentation throttle. Living enemies outside the camera view (plus a margin), or farther than a set distance
// from the player, skip the animation mixer, skeleton and matrix work on most frames and are hidden from the renderer, so ten
// residents per area cost about what three did. AI, movement and combat are untouched: this only decides how often the picture is
// refreshed. When an actor comes back into view (or is due its reduced-rate update) it is updated at once with the time it missed, so
// it does not pop. Numbers live in data/offscreenActors.json.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

export function validateOffscreenActors(d) {
  closed(d, ["schema_version", "enabled", "marginMetres", "farDistance", "everyNthFrame", "fullRateRadius"]);
  if (d.schema_version !== 1) fail("offscreenActors", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("offscreenActors", "enabled must be true or false");
  number("offscreenActors", "marginMetres", d.marginMetres, 0);
  number("offscreenActors", "farDistance", d.farDistance, 1);
  number("offscreenActors", "fullRateRadius", d.fullRateRadius, 0);
  count("offscreenActors", "everyNthFrame", d.everyNthFrame, 1, 30);
  if (d.fullRateRadius > d.farDistance) fail("offscreenActors", "fullRateRadius must not exceed farDistance");
}

// One throttle per actors manager. `begin` once per update; `skip` per living enemy; `takePending` when it is updated.
export function createOffscreenThrottle(THREE, rules) {
  const frustum = new THREE.Frustum(),
    matrix = new THREE.Matrix4(),
    sphere = new THREE.Sphere();
  let ready = false,
    frame = 0,
    px = 0,
    pz = 0;
  return {
    begin(camera, playerPos) {
      frame++;
      ready = !!camera?.projectionMatrix && !!camera.matrixWorldInverse && !!playerPos;
      if (!ready) return;
      px = playerPos.x;
      pz = playerPos.z;
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
    },
    // True when this actor's presentation can be skipped this frame. Keeps the actor hidden while off screen.
    skip(entity, view, dt) {
      if (!rules.enabled || !ready) return false;
      const dx = entity.pos.x - px,
        dz = entity.pos.z - pz,
        distance = Math.hypot(dx, dz);
      let onScreen = distance <= rules.fullRateRadius;
      if (!onScreen && distance <= rules.farDistance) {
        sphere.center.set(entity.pos.x, 0, -entity.pos.z);
        sphere.radius = rules.marginMetres + entity.radius;
        onScreen = frustum.intersectsSphere(sphere);
      }
      // The ground shadow is its own scene object: it is shown and hidden with the body, or a far enemy leaves a lone blob behind.
      const show = (visible) => {
        view.root.visible = visible;
        if (view.shadow) view.shadow.visible = visible;
      };
      if (onScreen) {
        show(true);
        return false;
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
