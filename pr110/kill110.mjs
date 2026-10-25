// usage: node kill110.mjs <baseUrl> <outPrefix> <enemyIndex> <SLASH|STAB|HEAVY> -> a real knife kill at 375 (headless, muted, real GPU); prints the recipe the sim picked
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
const [, , base, prefix, index = "0", button = "SLASH"] = process.argv;
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
// Let the idle preparation finish naturally (the pump never runs a fight slice for a resident nobody fights).
await page.waitForTimeout(Number(process.env.SETTLE_MS || 12000));
const idx = Number(index);
const victimId = await page.evaluate((i) => window.__ctx.game.enemies[i].id, idx);
const place = () =>
  page.evaluate((id) => {
    const g = window.__ctx.game,
      e = g.enemies.find((x) => x.id === id);
    if (!e) return [];
    g.player.hp = 150;
    g.player.pos.x = e.pos.x - 1.1;
    g.player.pos.z = e.pos.z;
    g.player.facing = { x: 1, z: 0 };
    e.hp = 1;
    return e.finisherSupport?.map((s) => s.id) ?? [];
  }, victimId);
const support = await place();
const box = await page
  .locator(`text=/^${button}$/i`)
  .first()
  .boundingBox();
let killed = null;
for (let tries = 0; tries < 12 && !killed; tries++) {
  await place();
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  killed = await page.evaluate((id) => {
    const g = window.__ctx.game,
      c = g.corpses?.find((x) => x.id === id) ?? g.enemies.find((x) => x.id === id && x.hp <= 0);
    return c ? (c.finisher?.recipeId ?? "none") : null;
  }, victimId);
}
const spot = await page.evaluate((id) => {
  const c = window.__ctx,
    e = c.game.corpses?.find((x) => x.id === id) ?? c.game.enemies.find((x) => x.id === id),
    p = c.world.toRender(e.pos);
  const v = new c.camera.position.constructor(p.x, p.y + 0.9, p.z).project(c.camera);
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
}, victimId);
const clip = {
  x: Math.max(0, Math.min(375 - 220, spot.x - 110)),
  y: Math.max(0, Math.min(812 - 220, spot.y - 130)),
  width: 220,
  height: 220,
};
for (const [n, ms] of [[1, 100], [2, 300], [3, 300], [4, 400], [5, 700]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${prefix}-${n}.png`, scale: "css" });
}
console.log(JSON.stringify({ prefix, index: idx, killed, support: support.length }));
await browser.close();
