import assert from "node:assert/strict";

// Deep comparison for fixtures of computed floats. Math.pow, sin and cos are not required to round the same way on every machine and Node
// version, so a value dumped on one machine can differ from the same computation on another in the last digit or two. Numbers compare equal
// when they differ by no more than `relative` of the larger magnitude (floor `absolute`); everything else (strings, booleans, keys, array
// lengths, key order) must match exactly.
export function assertClose(actual, expected, label = "value", { relative = 1e-12, absolute = 1e-12 } = {}) {
  if (typeof expected === "number" && typeof actual === "number") {
    if (Object.is(actual, expected)) return;
    const slack = Math.max(absolute, relative * Math.max(Math.abs(actual), Math.abs(expected)));
    assert(Math.abs(actual - expected) <= slack, `${label}: ${actual} differs from ${expected} by more than ${slack}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${label} is not an array`);
    assert.equal(actual.length, expected.length, `${label} length`);
    expected.forEach((item, i) => assertClose(actual[i], item, `${label}[${i}]`, { relative, absolute }));
    return;
  }
  if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", `${label} is not an object`);
    assert.deepEqual(Object.keys(actual), Object.keys(expected), `${label} keys`);
    for (const key of Object.keys(expected))
      assertClose(actual[key], expected[key], `${label}.${key}`, { relative, absolute });
    return;
  }
  assert.equal(actual, expected, label);
}
