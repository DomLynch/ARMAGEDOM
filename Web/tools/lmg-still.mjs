// Browser proof (dev tool, never shipped): node tools/lmg-still.mjs [--out /tmp/lmg] [--tag fire]  (CHROME=<exe>; playwright-core is installed when
// missing). Enters the REAL game at 375x812@2x with ?qa=1 and --mute-audio, gives the player the owned, selected Light Machine Gun, stands a few
// hostile bodies down range, holds the mouse button (held fire) and writes <out>/<tag>.png mid-burst plus one JSON line: rounds spent and tracer count.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  OUT = arg("out", "/tmp/lmg"), TAG = arg("tag", "fire"), PORT = Number(arg("port", 38797));
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright-core")); } catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = require("playwright-core"));
}
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.goto(`http://127.0.0.1:${PORT}/?qa=1`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
await page.waitForTimeout(4000);
const setup = await page.evaluate(() => {
  const g = window.__qa.game, p = g.player, data = g.world.bossEquipmentData?.commanderPistol;
  if (!data) return { error: "no commanderPistol data in this area" };
  g.bossEquipment.commanderPistol = {
    ...g.bossEquipment.commanderPistol,
    status: "owned", rewardReceipt: data.source.receiptId, selected: true, magazine: data.rules.capacity, reserve: data.rules.reserve,
  };
  Object.assign(g.pistol, { collected: true, equipped: false, magazine: 6, reserve: 12 });
  p.weapon = "railgun";
  p.facing = { x: 0, z: 1 };
  const bodies = [[0.4, 6], [-0.9, 7.5], [0.2, 9]].map(([dx, dz], i) => ({
    ...structuredClone(g.enemies[0]), id: 9100 + i, placementKey: `lmg-still-${i}`, hp: 900, maxHp: 900,
    pos: { x: p.pos.x + dx, z: p.pos.z + dz }, visible: true, hostile: true,
  }));
  g.enemies = [...g.enemies.filter((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 25), ...bodies];
  return { magazine: data.rules.capacity };
});
if (setup.error) throw Error(setup.error);
await page.waitForTimeout(3000); // the rifle model streams in
await page.mouse.move(Number(arg("mx", 187)), Number(arg("my", 300)));
await page.mouse.down();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/${TAG}.png` });
const spent = await page.evaluate(() => {
  const g = window.__qa.game, s = g.bossEquipment.commanderPistol;
  const hp = g.enemies.filter((e) => e.id >= 9100).map((e) => e.hp);
  const why = { weapon: g.player.weapon, selected: s.selected, status: s.status, area: g.world.areaId, lowered: g.weaponsLowered };
  return { magazine: s.magazine, reserve: s.reserve, ready: g.bossEquipmentAssetReady?.commanderPistol, hp, why };
});
await page.mouse.up();
console.log(JSON.stringify({ tag: TAG, setup, spent, errors: logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3) }));
await browser.close();
await server.close();
