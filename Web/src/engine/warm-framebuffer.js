import { Vector4 } from "three";
// The same warm in steps of `perStep` top-level objects (lights always stay), so idle time can run it a little at
// a time. Visibility is restored before each yield, so nothing outside a step ever sees the hidden objects.
export function* warmFramebufferSteps(renderer, scene, camera, perStep = 4) {
  const nodes = scene.children.filter((n) => !n.isLight);
  for (let i = 0; i < nodes.length; i += perStep) {
    const group = new Set(nodes.slice(i, i + perStep)),
      shown = nodes.map((n) => n.visible);
    nodes.forEach((n) => (n.visible = group.has(n) && n.visible));
    try {
      warmFramebuffer(renderer, scene, camera);
    } finally {
      nodes.forEach((n, k) => (n.visible = shown[k]));
    }
    yield nodes.length - i;
  }
}

// Render the scene once into a 1x1 scissored viewport so the first real frame reuses its shader variants and
// uploads without writing pixels.
// All mutable renderer state is restored synchronously; no await inside this scope.
export function warmFramebuffer(renderer, scene, camera) {
  const target = renderer.getRenderTarget(),
    viewport = renderer.getViewport(new Vector4()),
    scissor = renderer.getScissor(new Vector4()),
    scissorTest = renderer.getScissorTest(),
    autoClear = renderer.autoClear;
  try {
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.setViewport(0, 0, 1, 1);
    renderer.setScissor(0, 0, 0, 0);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(target);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.autoClear = autoClear;
  }
}
