// usage: node fight110.mjs <baseUrl> <label> <query> [ms=20000] -> frame percentiles while stood near an exit with a live fight (headless, muted, real GPU)
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
const [, , base, label, query = "", ms = "20000"] = process.argv;
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
await page.waitForFunction(() => window.__ctx?.loaded && window.__ctx.game, null, { timeout: 120000 });
const gpu = await page.evaluate(() => {
  const gl = window.__ctx.renderer.getContext(),
    d = gl.getExtension("WEBGL_debug_renderer_info");
  return d && gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
});
// Stand 3 m from the south exit, then start a fight with the nearest resident and record frames for `ms`.
await page.evaluate(() => {
  const c = window.__ctx,
    w = c.world,
    g = c.game,
    link = w.registry.links(w.areaId).find((l) => l.to === "south"),
    p = w.geometry.point(g.player.pos),
    goal = { x: p.x, y: p.y };
  for (const [k, v] of Object.entries(link.condition)) goal[k[0]] = v + (k.endsWith("Min") ? -0.06 : 0.06);
  const t = w.geometry.ground(goal);
  g.player.pos.x = t.x;
  g.player.pos.z = t.z;
});
const result = await page.evaluate(
  (total) =>
    new Promise((res) => {
      const c = window.__ctx,
        g = c.game,
        out = [];
      let last = performance.now(),
        started = false;
      const start = last;
      const tick = (t) => {
        out.push(t - last);
        last = t;
        if (!started && t > start + 4000) {
          // Past the start delay: alert the residents and keep them alerted for the rest of the run.
          started = true;
          for (const e of g.enemies) if (e.hp > 0) e.alerted = true;
        }
        if (t < start + total) requestAnimationFrame(tick);
        else {
          const s = [...out].sort((a, b) => a - b),
            p = (q) => s[Math.min(s.length - 1, Math.floor((s.length * q) / 100))];
          res({
            frames: s.length,
            p50: +p(50).toFixed(1),
            p95: +p(95).toFixed(1),
            p99: +p(99).toFixed(1),
            max: +s.at(-1).toFixed(1),
            over33: s.filter((x) => x > 33.4).length,
            stage: c.stageAhead?.stats?.() ?? null,
          });
        }
      };
      requestAnimationFrame(tick);
    }),
  Number(ms),
);
console.log(JSON.stringify({ label, query, gpu, ...result }));
await browser.close();
