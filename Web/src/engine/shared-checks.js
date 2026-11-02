// Small pure helpers that were copied byte for byte into many files. Leaf module: imports nothing.
export const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
export const closed = (value, keys) =>
  !!value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d?.enumerable && "value" in d;
  });
