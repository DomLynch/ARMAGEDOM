// Stands in for "jolt-physics/wasm-compat" (vite.config.js alias): the plain wasm build with the .wasm served as its own asset
// (raw wasm, compressed by the server) instead of base64 inside the JS. The package calls initJolt() with no arguments.
import Jolt from "../node_modules/jolt-physics/dist/jolt-physics.wasm.js";
import wasmUrl from "../node_modules/jolt-physics/dist/jolt-physics.wasm.wasm?url";

export default (options = {}) => Jolt({ locateFile: () => wasmUrl, ...options });
