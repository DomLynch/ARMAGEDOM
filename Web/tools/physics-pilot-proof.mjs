// Physics pilot proof (dev tool, never shipped). Run from Web/ after `npm ci`:  node tools/physics-pilot-proof.mjs
// 1. builds the app and prints the raw/gzip/brotli size of every chunk that carries the physics code (the lazy chunk) and of the main entry;
// 2. times the ragdoll step (physics.step + readPose, the per-frame cost of stepDeath) for 1, 5 and 10 dying hunters, 300 ticks each.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { createPhysics } from "@frankendom/physics";

const out = process.env.PROOF_DIST ?? "/tmp/physics-pilot-dist";
rmSync(out, { recursive: true, force: true });
execFileSync("npx", ["vite", "build", "--base=./", "--outDir", out], { stdio: "inherit" });
const size = (file) => {
  const buf = readFileSync(`${out}/assets/${file}`);
  return {
    file,
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};
const js = readdirSync(`${out}/assets`).filter((f) => f.endsWith(".js"));
console.log("WASM (separate asset)", JSON.stringify(readdirSync(`${out}/assets`).filter((f) => f.endsWith(".wasm")).map(size)));
// What is inside the lazy chunk: bytes per input, to show three-cuts and friends are not pulled in.
const { build } = await import("esbuild");
const meta = await build({
  entryPoints: ["src/physics-death-impl.js"], bundle: true, write: false, minify: true, metafile: true, format: "esm", platform: "browser",
  external: ["three", "node:*"], loader: { ".wasm": "dataurl" }, logLevel: "silent",
  alias: process.env.PHYSICS_WASM === "inline" ? {} : { "jolt-physics/wasm-compat": "./src/jolt-wasm-separate.js" },
  plugins: [{ name: "wasm-url", setup: (b) => b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path.replace(/\?url$/, ""), external: true })) }],
});
const inputs = Object.entries(Object.values(meta.metafile.outputs)[0].inputs).sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput);
console.log("LAZY CHUNK INPUTS (bytes in output)");
for (const [k, v] of inputs.slice(0, 12)) console.log(`  ${v.bytesInOutput}\t${k}`);
console.log("three-cuts in chunk:", inputs.some(([k]) => /three-cuts/.test(k)), "| three in chunk (should be external-shared):", inputs.some(([k]) => /node_modules\/three\//.test(k)));
const physics = js.filter((f) => /jolt|physics/i.test(readFileSync(`${out}/assets/${f}`, "utf8").slice(0, 200000)) || /WebAssembly/.test(readFileSync(`${out}/assets/${f}`, "utf8").slice(0, 2e6)));
console.log("CHUNKS (JS, largest first)");
for (const f of js.sort((a, b) => readFileSync(`${out}/assets/${b}`).length - readFileSync(`${out}/assets/${a}`).length).slice(0, 5)) console.log(JSON.stringify(size(f)), physics.includes(f) ? "PHYSICS" : "");

const ROW = JSON.parse(readFileSync("src/data/physicsBody.json", "utf8")).row;
for (const n of [1, 5, 10]) {
  const world = await createPhysics({ seed: 731 }),
    rds = Array.from({ length: n }, (_, i) => world.createRagdoll(ROW, { position: [i * 1.5, 0, 0], id: `h${i}` }));
  for (const rd of rds) {
    rd.setRoot([0, 1, 0], [0, 0, 0, 1]);
    rd.kill({ part: "spine2", impulse: [0, 0, -30] });
  }
  const times = [];
  for (let t = 0; t < 300; t++) {
    const a = performance.now();
    world.step(1 / 60);
    for (const rd of rds) rd.readPose();
    times.push(performance.now() - a);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  console.log(`STEP hunters=${n} mean=${mean.toFixed(3)}ms p95=${times[Math.floor(times.length * 0.95)].toFixed(3)}ms max=${times[times.length - 1].toFixed(3)}ms awake=${rds.filter((r) => r.awake).length}`);
  world.destroy();
}
