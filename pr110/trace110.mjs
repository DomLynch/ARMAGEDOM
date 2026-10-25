// usage: node trace110.mjs <baseUrl> <label> [ms]  -> frame percentiles during a fight right after entering (real GPU)
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
const [, , base, label, ms = "20000"] = process.argv;
const browser = await chromium.launch({
  headless: true,
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ["--headless=new", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (
  await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })
).newPage();
await page.goto(base + "?prefetch=1", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#enter", { timeout: 120000 });
await page.click("#enter");
await page.waitForFunction(() => window.__ctx?.loaded && window.__ctx.game, null, { timeout: 120000 });
const gpu = await page.evaluate(() => {
  const gl = window.__ctx.renderer.getContext(),
    d = gl.getExtension("WEBGL_debug_renderer_info");
  return d && gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
});
const result = await page.evaluate(
  (total) =>
    new Promise((res) => {
      const c = window.__ctx,
        g = c.game,
        target = g.enemies.filter((e) => e.hp > 0)[0],
        out = [];
      let last = performance.now(),
        teleported = false;
      const start = last;
      const tick = (t) => {
        out.push(t - last);
        last = t;
        if (!teleported && t > start + 500) {
          teleported = true;
          g.player.pos.x = target.pos.x + 1.2;
          g.player.pos.z = target.pos.z;
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
            prep: c.actors.finisherPreparationStats(),
            alerted: g.enemies.filter((e) => e.alerted && e.hp > 0).length,
            playerHp: g.player.hp,
          });
        }
      };
      requestAnimationFrame(tick);
    }),
  Number(ms),
);
console.log(JSON.stringify({ label, gpu, ...result }));
await browser.close();
