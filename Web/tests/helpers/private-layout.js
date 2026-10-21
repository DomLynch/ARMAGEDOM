// Private registry fixtures reuse public geometry, but own different exit graphs.
// Guidance and the Westminster tutorial belong to their authored area, not this fixture.
export function privateLayout(layout) {
  const { tutorialPath, ...geometry } = layout;
  return { ...geometry, guidance: [] };
}
