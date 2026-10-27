import { fileURLToPath } from "node:url";

// The physics pilot's Jolt: PHYSICS_WASM=inline keeps the package's default (wasm embedded as base64 in the chunk), for the size comparison.
const separate = process.env.PHYSICS_WASM !== "inline";
export default {
  optimizeDeps: { exclude: ["@frankendom/physics"] }, // dev server only (the QA stand): no pre-bundling of the package's JSON imports
  resolve: {
    alias: separate
      ? { "jolt-physics/wasm-compat": fileURLToPath(new URL("./src/jolt-wasm-separate.js", import.meta.url)) }
      : {},
  },
};
