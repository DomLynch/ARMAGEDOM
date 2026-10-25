// usage: node travel110.mjs <baseUrl> <label> <query> [hops=south,east] [idleS=12]
// Headless, muted, real GPU. For each hop: stand ~NEAR m from the exit, idle, then step onto the exit and time the travel pause.
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
const [, , base, label, query = "", hops = "south,east", idle = "12"] = process.argv;
const browser = await chromium.launch({
  headless: true,
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ["--headless=new", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (
  await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })
).newPage();
await page.goto(base + (query ? "?" + query : ""), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#enter", { timeout: 120000 });
await page.click("#enter");
await page.waitForFunction(() => window.__ctx?.loaded && window.__ctx.world && window.__ctx.game, null, { timeout: 120000 });
const gpu = await page.evaluate(() => {
  const gl = window.__ctx.renderer.getContext(),
    d = gl.getExtension("WEBGL_debug_renderer_info");
  return d && gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
});
// Sample the travel flag and frame times from the page.
await page.evaluate(() => {
  const c = window.__ctx;
  window.__m = { frames: [], pauses: [], travelAt: null };
  let last = performance.now();
  const tick = (t) => {
    window.__m.frames.push([t, t - last]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  let was = false;
  setInterval(() => {
    if (c.traveling && !was) window.__m.travelAt = performance.now();
    if (!c.traveling && was && window.__m.travelAt !== null) {
      window.__m.pauses.push(Math.round(performance.now() - window.__m.travelAt));
      window.__m.travelAt = null;
    }
    was = c.traveling;
  }, 4);
});
const results = [];
for (const to of hops.split(",")) {
  const near = await page.evaluate(async (to) => {
    const c = window.__ctx,
      w = c.world,
      g = c.game;
    const link = w.registry.links(w.areaId).find((l) => l.to === to);
    const p = w.geometry.point(g.player.pos);
    const spot = (offset) => {
      const goal = { x: p.x, y: p.y };
      for (const [k, v] of Object.entries(link.condition)) goal[k[0]] = v + (k.endsWith("Min") ? offset : -offset);
      return w.geometry.ground(goal);
    };
    const t = spot(-0.06 * 1),
      exitPoint = spot(0.01);
    window.__exit = exitPoint;
    g.player.pos.x = t.x;
    g.player.pos.z = t.z;
    return { from: w.areaId, meters: Math.hypot(exitPoint.x - t.x, exitPoint.z - t.z) };
  }, to);
  await page.waitForTimeout(Number(idle) * 1000);
  const before = await page.evaluate((to) => {
    const m = window.__m;
    const idleFrames = m.frames.filter((f) => f[0] > performance.now() - 11000).map((f) => f[1]);
    idleFrames.sort((a, b) => a - b);
    return {
      ready: window.__ctx.world.isAreaReady(to),
      idleMax: +(idleFrames.at(-1) ?? 0).toFixed(1),
      idleP95: +(idleFrames[Math.floor(idleFrames.length * 0.95)] ?? 0).toFixed(1),
      stage: window.__ctx.stageAhead?.stats?.() ?? null,
    };
  }, to);
  await page.evaluate(() => {
    window.__m.pauses.length = 0;
    window.__t0 = performance.now();
    const g = window.__ctx.game;
    g.player.pos.x = window.__exit.x;
    g.player.pos.z = window.__exit.z;
  });
  await page.waitForFunction((to) => window.__ctx.world.areaId === to && !window.__ctx.traveling, to, {
    timeout: 120000,
    polling: 50,
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    pauseMs: window.__m.pauses.at(-1) ?? 0,
    totalMs: Math.round(performance.now() - window.__t0),
  }));
  results.push({ to, ...near, ...before, ...after });
}
console.log(JSON.stringify({ label, query, gpu, results }));
await browser.close();
