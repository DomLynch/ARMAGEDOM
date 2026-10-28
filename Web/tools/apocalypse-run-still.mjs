// Apocalypse run stills (dev tool, never shipped): node tools/apocalypse-run-still.mjs [--out DIR]
// Real game at 375x812@2x (headless, --mute-audio; CHROME=<exe> to pick a browser), local ?qa=1 only. It travels to the hub, opens the menu for the
// start button, starts a run, then moves the run clock into each stage for the banner and the timer line, and ends the run by time out for the results card.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  OUT = arg("out", "/tmp/apocalypse-run"),
  PORT = 38797,
  RUN = JSON.parse(readFileSync(new URL("../src/data/apocalypseRun.json", import.meta.url))),
  TOTAL = RUN.stages.reduce((sum, s) => sum + s.seconds, 0);
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=0`);
await page.click("#enter");
await page.waitForFunction(() => window.__qa.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
await page.evaluate(async () => {
  const qa = window.__qa;
  await qa.session.activateArea({ areaId: "central-hub", entryPoint: qa.world.manifest.entries["central-hub"] });
});
await page.waitForFunction(() => window.__qa.state().area === "central-hub", null, { timeout: 120000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.__qa.game.enemies = [];
});
await page.waitForTimeout(1500);
// Each still is written as a JPEG and, with --print, also printed as `STILL <name> <base64>` so a job's log can carry it out.
const shot = async (name) => {
  const buffer = await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 78 });
  if (process.argv.includes("--print")) console.log(`STILL ${name} ${buffer.toString("base64")}`);
};
await page.click("#menu-button");
await page.waitForTimeout(400);
await shot("0-start-button");
await page.click("#run-start");
await page.waitForTimeout(800);
await shot("1-stage-scavenge");
const jump = async (seconds) => {
  await page.evaluate((s) => {
    const g = window.__qa.game;
    g.run.startAt = g.time - s;
  }, seconds);
  await page.waitForTimeout(1200);
};
await jump(RUN.stages[0].seconds + 5);
await shot("2-stage-invasion");
await jump(RUN.stages[0].seconds + RUN.stages[1].seconds + 5);
await shot("3-stage-finale");
await page.evaluate(() => {
  const g = window.__qa.game;
  g.kills += 14;
  g.heat = { count: 9, lastKillAt: g.time, seen: g.kills, rolls: 0 };
});
await page.waitForTimeout(600);
await jump(TOTAL + 5);
await page.waitForTimeout(500);
await shot("4-results");
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors));
console.log(JSON.stringify({ out: OUT, errors: errors.slice(0, 5) }));
await browser.close();
await server.close();
