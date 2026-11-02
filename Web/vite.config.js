import { fileURLToPath } from "node:url";

// The physics pilot's Jolt: the default keeps the package's wasm embedded as base64 in its lazy chunk, which the packaging gate accepts
// (verify-assets takes only hashed js/css as generated output). PHYSICS_WASM=separate serves the .wasm as its own asset, for the size comparison.
const separate = process.env.PHYSICS_WASM === "separate";
export default {
  optimizeDeps: { exclude: ["@frankendom/physics"] }, // dev server only (the QA stand): no pre-bundling of the package's JSON imports
  resolve: {
    alias: separate
      ? { "jolt-physics/wasm-compat": fileURLToPath(new URL("./src/jolt-wasm-separate.js", import.meta.url)) }
      : {},
  },
};
