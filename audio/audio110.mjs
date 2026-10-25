// usage: node audio110.mjs <baseUrl> -> does audio start after the first touch and come back after hide/show and a system suspend? (headless, muted; the page's own AudioContext is real)
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
const [, , base] = process.argv;
const browser = await chromium.launch({
  headless: true,
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ["--headless=new", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (
  await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })
).newPage();
await page.addInitScript(() => {
  window.__acs = [];
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...a) {
      super(...a);
      window.__acs.push(this);
    }
  };
});
const out = [];
const snap = (label) =>
  page.evaluate((label) => {
    const c = window.__ctx,
      a = c?.audio?.state;
    return {
      label,
      acState: window.__acs.map((x) => x.state),
      audio: a && { context: a.context, ready: a.ready, played: a.played, error: a.error },
      paused: c?.paused,
      hidden: document.hidden,
    };
  }, label);
const hide = (hidden) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
const attack = async () => {
  const before = await page.evaluate(() => window.__ctx.audio.state.played);
  await page.evaluate(() => {
    const g = window.__ctx.game;
    // Stand next to the nearest resident so the swing hits something and plays a cue.
    const e = g.enemies.find((x) => x.hp > 0);
    g.player.pos.x = e.pos.x - 1.1;
    g.player.pos.z = e.pos.z;
    g.player.facing = { x: 1, z: 0 };
  });
  const box = await page.locator("text=/^SLASH$/i").first().boundingBox();
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(350);
  }
  const after = await page.evaluate(() => window.__ctx.audio.state.played);
  return { before, after };
};
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#enter", { timeout: 120000 });
out.push(await page.evaluate(() => ({ label: "before first touch", acs: window.__acs.map((x) => x.state) })));
await page.click("#enter");
await page.waitForFunction(() => window.__ctx?.loaded && window.__ctx.game, null, { timeout: 120000 });
await page.waitForTimeout(1500);
out.push(await snap("after Enter tap"));
out.push({ label: "cue after first touch", ...(await attack()) });

await hide(true);
await page.waitForTimeout(600);
out.push(await snap("tab hidden (lock/call)"));
await hide(false);
await page.waitForTimeout(600);
out.push(await snap("tab visible again, nothing tapped"));
await page.locator("#resume").click().catch(async () => page.mouse.click(187, 400));
await page.waitForTimeout(800);
out.push(await snap("after Resume tap"));
out.push({ label: "cue after resume", ...(await attack()) });

// A system suspend while the page stays visible and unpaused (call without a blur, OS audio session change).
await page.evaluate(() => window.__acs[0].suspend());
await page.waitForTimeout(800);
out.push(await snap("system suspend, game running"));
out.push({ label: "cue after system suspend", ...(await attack()) });
// Same, but the next touch has to bring it back (resume refused outside a gesture).
await page.evaluate(() => {
  const ac = window.__acs[0];
  ac.resume = () => Promise.reject(new Error("not allowed"));
  return ac.suspend();
});
await page.waitForTimeout(600);
out.push(await snap("system suspend, resume refused"));
await page.evaluate(() => delete window.__acs[0].resume);
await page.mouse.click(60, 700);
await page.waitForTimeout(800);
out.push(await snap("after one touch"));
out.push({ label: "cue after one touch", ...(await attack()) });
console.log(JSON.stringify(out, null, 1));
await browser.close();
