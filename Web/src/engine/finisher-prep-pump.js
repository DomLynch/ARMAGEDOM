// Finisher geometry for living residents is prepared after arrival, not in the travel pause: arrival builds the
// resident without it, and this pump finishes the job in small slices between frames.
//
//  - nothing during the first `startDelayMs` after arrival;
//  - one slice per frame of at most `sliceMs` (the steps themselves are a few ms each);
//  - whenever a frame takes longer than `backoffFrameMs` the pump stays quiet for `backoffMs`;
//  - an alerted resident goes to the front of the queue, then the nearest to the player.
//
// A kill before a resident's preparation is done is safe: its recipe list only offers recipes that are fully
// prepared, so the sim picks the ordinary death (see finisher-presentation.js).
// The preparation steps bake from the rig's pose, which in a live scene changes between frames. Each slice
// therefore puts the rig back into the pose it had when the resident was built, and puts the live pose back after.
export function captureRig(model) {
  const rows = [];
  model.traverse((n) => rows.push([n, n.position.clone(), n.quaternion.clone(), n.scale.clone(), n.visible]));
  return rows;
}
export function applyRig(rows, root, model) {
  for (const [n, position, quaternion, scale, visible] of rows) {
    n.position.copy(position);
    n.quaternion.copy(quaternion);
    n.scale.copy(scale);
    n.visible = visible;
  }
  root.updateWorldMatrix(true, true);
  root.updateMatrixWorld(true);
  model.traverse((n) => {
    if (n.skeleton) n.skeleton.update();
  });
}

export function createFinisherPrepPump({ config, now = () => performance.now(), onError = () => {} }) {
  const running = new Map();
  let enteredAt = now(),
    lastFrameAt = null,
    pausedUntil = 0;
  const stats = { slices: 0, steps: 0, backoffs: 0, prepared: 0, abandoned: 0 };
  function forget(key) {
    const iterator = running.get(key);
    if (!iterator) return;
    running.delete(key);
    stats.abandoned++;
    iterator.return();
  }
  return {
    // Arrival in an area: restart the quiet period.
    enter() {
      enteredAt = now();
    },
    forget,
    // `candidates`: [{ key, entity: { hp, alerted, pos }, isPrepared(), start() -> iterator,
    //                 around(run), fail(error) }], `from`: the player's { x, z }.
    pump(candidates, from) {
      const t = now(),
        frame = lastFrameAt === null ? 0 : t - lastFrameAt;
      lastFrameAt = t;
      const pending = candidates.filter((c) => c.entity.hp > 0 && !c.isPrepared());
      // A resident that died or left mid-preparation is dropped, which also frees its partial pieces.
      for (const key of [...running.keys()]) if (!pending.some((c) => c.key === key)) forget(key);
      if (!config.enabled || !pending.length) return false;
      if (frame > config.backoffFrameMs) {
        pausedUntil = t + config.backoffMs;
        stats.backoffs++;
      }
      if (t < enteredAt + config.startDelayMs || t < pausedUntil) return false;
      const distance = (c) => Math.hypot(c.entity.pos.x - from.x, c.entity.pos.z - from.z);
      pending.sort((a, b) => Number(!!b.entity.alerted) - Number(!!a.entity.alerted) || distance(a) - distance(b));
      const next = pending[0];
      let iterator = running.get(next.key);
      if (!iterator) running.set(next.key, (iterator = next.start()));
      stats.slices++;
      next.around(() => {
        const started = now();
        try {
          for (;;) {
            const step = iterator.next();
            stats.steps++;
            if (step.done) {
              running.delete(next.key);
              stats.prepared++;
              return;
            }
            if (now() - started >= config.sliceMs) return;
          }
        } catch (error) {
          running.delete(next.key);
          next.fail(error);
          onError(next.key, error);
        }
      });
      return true;
    },
    stats: () => ({ ...stats, running: running.size }),
  };
}
