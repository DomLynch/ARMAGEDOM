// Private registry fixtures reuse public geometry, but own different exit graphs.
// Guidance belongs to the public graph and must not leak into the fixture.
export function privateLayout(layout) {
  return { ...layout, guidance: [] };
}
