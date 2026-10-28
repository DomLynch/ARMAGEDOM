// Browser proof (dev tool, never shipped): node tools/coin-options-still.mjs --look A [--out dir] [--size 375x812] [--dim 0.35] [--tag name]
// (CHROME=<exe>; playwright-core is installed when missing). Serves the real game with killDrops.json forced on and `look` set to the given look
// ("classic" = the plain coins), enters it with ?qa=1 and --mute-audio, clears the ground in front of the player on Westminster, lays a single
// pickup, a small pile and a boss stack side by side at the fight camera and writes <out>/<tag>.png. --dim multiplies the area lights to
// show a dim area. Nothing here ships: the override lives in this server's plugin only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  LOOK = arg("look", "classic"),
  OUT = arg("out", "/tmp/coin-options"),
  [W, H] = arg("size", "375x812").split("x").map(Number),
  DIM = Number(arg("dim", 1)),
  TAG = arg("tag", `${LOOK}-${W}${DIM < 1 ? "-dim" : ""}`),
  PORT = Number(arg("port", 38797)),
  TIERS = (arg("tiers", "trash,creature,boss")).split(","),
  SPREAD = Number(arg("spread", 1.7)),
  FORWARD = Number(arg("forward", 2.6)),
  SHOTS = Number(arg("shots", 1));
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = require("playwright-core"));
}
const override = {
  name: "coin-options-look",
  enforce: "pre",
  load(id) {
    if (!id.split("?")[0].endsWith("/data/killDrops.json")) return null;
    const d = JSON.parse(readFileSync(id.split("?")[0], "utf8"));
    return JSON.stringify({ ...d, enabled: true, look: LOOK }); // imported with a JSON type attribute: serve plain JSON
  },
};
const server = await createServer({ plugins: [override], server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: process.env.REAL_GPU
    ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 600 ? 2 : 1, hasTouch: W < 600 })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.goto(`http://127.0.0.1:${PORT}/?qa=1`);
await page.click("#enter");
try {
  await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: Number(arg("wait", 90000)) });
} catch (e) {
  console.log("LOAD TIMEOUT", logs.slice(0, 12).join(" | "));
  await page.screenshot({ path: `${OUT}/${TAG}-timeout.png` });
  await browser.close();
  await server.close();
  process.exit(1);
}
await page.waitForTimeout(3000);
const info = await page.evaluate(
  async ([tiers, spread, forward, dim]) => {
    const g = window.__qa.game,
      p = g.player.pos;
    g.enemies = g.enemies.filter((e) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 40);
    const state = (g.killDrops ??= { list: [], serial: 0, notice: 0 });
    tiers.forEach((tier, i) => {
      const dx = (i - (tiers.length - 1) / 2) * spread;
      state.list.push({ id: ++state.serial + 10, areaId: g.world.areaId, tier, x: p.x + dx, z: p.z + forward, amount: 5, until: g.time + 1e6 });
    });
    window.__probe = (x, z) => {
      const cam = window.__qa.world.camera ?? window.__qa.world.stage?.camera;
      if (!cam) return null;
      const v = new cam.position.constructor(x, 0, -z).project(cam);
      return [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)];
    };
    const scene = window.__qa.world.scene ?? window.__qa.world.group?.parent;
    // A dim area: the backdrop art is baked, so the whole canvas is darkened too (the worst case for the coins and their light).
    if (dim !== 1) for (const c of document.querySelectorAll("canvas")) c.style.filter = `brightness(${Math.sqrt(dim).toFixed(2)})`;
    if (dim !== 1) for (const l of scene?.children ?? []) if (l.isHemisphereLight || l.isDirectionalLight) l.intensity *= dim;
    return { area: g.world.areaId, at: { x: p.x, z: p.z }, drops: state.list.length };
  },
  [TIERS, SPREAD, FORWARD, DIM],
);
if (process.argv.includes("--probe"))
  console.log(
    JSON.stringify(
      await page.evaluate((a) => [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [3, 0], [0, 3], [0, -3]].map(([x, z]) => [x, z, window.__probe(a.x + x, a.z + z)]), info.at),
    ),
  );
await page.waitForTimeout(2500);
for (let i = 0; i < SHOTS; i++) {
  await page.screenshot({ path: `${OUT}/${TAG}${SHOTS > 1 ? `-${i}` : ""}.png` });
  if (SHOTS > 1) await page.waitForTimeout(450);
}
console.log(JSON.stringify({ tag: TAG, info, errors: logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3) }));
await browser.close();
await server.close();
