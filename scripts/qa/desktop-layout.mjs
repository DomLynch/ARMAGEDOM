// Desktop and phone layout check. Loads the game in headless Chromium at several window sizes, enters the fight and measures the HUD.
//   node scripts/qa/desktop-layout.mjs <baseURL> <outDir> [--only touch|desktop]
// Desktop sizes (mouse, no touch): 1920x1080, 1280x720, 1280x800 (16:10), 2560x1080 (ultrawide). Phone size: 375x812, touch.
// Asserts: no touch controls on desktop, every HUD box inside the window, no two HUD boxes overlapping, hint text at least 12 px.
// Writes <outDir>/<size>.png, <outDir>/<size>.json (the measured rects) and exits 1 on any failed check. Run the phone size on origin/main
// and on the branch and diff the two touch.json files to prove the phone layout did not move.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(process.env.QA_PLAYWRIGHT_ROOT ?? join(process.cwd(), "scripts/qa/package.json"));
const { chromium } = require("playwright");
const [baseURL, outDir] = process.argv.slice(2);
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
if (!baseURL || !outDir) throw new Error("usage: desktop-layout.mjs <baseURL> <outDir> [--only touch|desktop]");
mkdirSync(outDir, { recursive: true });

const DESKTOP = [
  [1920, 1080],
  [1280, 720],
  [1280, 800],
  [2560, 1080],
];
const PHONE = [375, 812];
// Boxes that are on screen in a plain fight, per mode. Anything missing or hidden is skipped, not failed.
const DESKTOP_BOXES = ["#vitals", "#menu-button", "#key-hints", "#weapon-tiles", "#expedition-objective", "#boss"];
const PHONE_BOXES = ["#vitals", "#menu-button", "#move", "#action-cluster", "#weapon-tiles", "#slash", "#stab", "#heavy", "#dodge", "#guard"];

const rectsScript = (selectors) =>
  selectors.map((selector) => {
    const node = document.querySelector(selector);
    if (!node || node.hidden || !node.getClientRects().length) return { selector, visible: false };
    const r = node.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return { selector, visible: false };
    return { selector, visible: true, x: r.left, y: r.top, w: r.width, h: r.height };
  });

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const problems = [];
const check = (ok, text) => {
  if (!ok) problems.push(text);
};

async function enter(page) {
  await page.goto(baseURL, { waitUntil: "load" });
  await page.waitForSelector("#enter:not([disabled])", { timeout: 120000 });
  await page.click("#enter");
  await page.waitForFunction(() => !document.getElementById("hud").hidden, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  // The menu opens by itself when a headless window loses focus; close it so the HUD is what is measured.
  if (await page.evaluate(() => document.getElementById("menu").open)) await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

async function run(browser, name, [width, height], phone) {
  const context = await browser.newContext(
    phone
      ? { viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
      : { viewport: { width, height }, deviceScaleFactor: 1 },
  );
  const page = await context.newPage();
  await enter(page);
  const boxes = await page.evaluate(rectsScript, phone ? PHONE_BOXES : DESKTOP_BOXES);
  const state = await page.evaluate(() => ({
    desktopUi: document.body.classList.contains("desktop-ui"),
    touchClass: document.body.classList.contains("touch"),
    scale: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
    canvas: [document.getElementById("world").clientWidth, document.getElementById("world").clientHeight],
    hintFont: document.querySelector("#key-hints kbd") ? parseFloat(getComputedStyle(document.querySelector("#key-hints kbd")).fontSize) : null,
    hintCount: document.querySelectorAll("#key-hints > span").length,
    slotShown: [...document.querySelectorAll("#weapon-tiles-track button > i")].some((i) => getComputedStyle(i).display !== "none"),
  }));
  const label = `${name} ${width}x${height}`;
  check(state.canvas[0] === width && state.canvas[1] === height, `${label}: canvas ${state.canvas} does not fill the window`);
  for (const box of boxes.filter((b) => b.visible)) {
    check(box.x >= 0 && box.y >= 0 && box.x + box.w <= width + 0.5 && box.y + box.h <= height + 0.5, `${label}: ${box.selector} outside the window`);
  }
  if (phone) {
    // The phone keeps the thumb controls and the old HUD: none of the desktop pieces may show.
    check(!state.desktopUi, `${label}: phone got the desktop layout`);
    check(!boxes.find((b) => b.selector === "#key-hints")?.visible, `${label}: key hints showing on a phone`);
    check(!state.slotShown, `${label}: weapon key numbers showing on a phone`);
    for (const id of ["#move", "#action-cluster"]) check(boxes.find((b) => b.selector === id)?.visible, `${label}: ${id} missing on a phone`);
  } else {
    check(state.desktopUi && !state.touchClass, `${label}: desktop layout class missing`);
    for (const id of ["#move", "#action-cluster", "#slash", "#stab", "#heavy", "#dodge", "#guard"])
      check(
        await page.evaluate((selector) => {
          const node = document.querySelector(selector);
          return !node || !node.getClientRects().length;
        }, id),
        `${label}: touch control ${id} visible on desktop`,
      );
    check(state.hintCount > 0, `${label}: no key hints`);
    check(state.hintFont >= 12, `${label}: key hint text ${state.hintFont}px is under 12`);
    check(boxes.find((b) => b.selector === "#key-hints")?.visible, `${label}: key hints not visible`);
    check(boxes.find((b) => b.selector === "#vitals")?.visible, `${label}: vitals not visible`);
    const vitals = boxes.find((b) => b.selector === "#vitals"),
      menu = boxes.find((b) => b.selector === "#menu-button");
    if (vitals?.visible) check(vitals.x < width / 4 && vitals.y < height / 4, `${label}: vitals not in the top-left corner`);
    if (menu?.visible) check(menu.x > width * 0.75 && menu.y < height / 4, `${label}: menu button not in the top-right corner`);
    const tiles = boxes.find((b) => b.selector === "#weapon-tiles"),
      hints = boxes.find((b) => b.selector === "#key-hints");
    if (tiles?.visible) check(Math.abs(tiles.x + tiles.w / 2 - width / 2) < 2, `${label}: weapon bar not bottom-centre`);
    if (hints?.visible) check(Math.abs(hints.x + hints.w / 2 - width / 2) < 2, `${label}: key hints not bottom-centre`);
  }
  const seen = boxes.filter((b) => b.visible);
  // A child box inside its own parent is not an overlap: the six touch actions live in #action-cluster.
  const nested = (a, b) => ["#action-cluster"].includes(a.selector) || ["#action-cluster"].includes(b.selector);
  // The phone layout is old and only diffed against main (touch.json); overlap is asserted for the new desktop layout.
  if (!phone)
    for (const [i, a] of seen.entries())
      for (const b of seen.slice(i + 1)) if (!nested(a, b) && overlap(a, b)) check(false, `${label}: ${a.selector} overlaps ${b.selector}`);
  const file = join(outDir, `${name}-${width}x${height}`);
  await page.screenshot({ path: `${file}.png` });
  writeFileSync(`${file}.json`, JSON.stringify({ label, state, boxes }, null, 2));
  console.log(label, JSON.stringify(state));
  await context.close();
}

const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM || undefined, // a Chromium build already on the box; unset uses Playwright's own
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
try {
  if (only !== "touch") for (const size of DESKTOP) await run(browser, "desktop", size, false);
  if (only !== "desktop") await run(browser, "touch", PHONE, true);
} finally {
  await browser.close();
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("layout ok");
