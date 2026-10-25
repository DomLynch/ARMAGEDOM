// usage: node overlay2.mjs <out.png> <x0 y0 x1 y1 fractions> : East top-right with player-clear cells (r=0.4), stalled endpoints, trigger, blockers
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "/Users/domininclynch/Developer/frankendom-deploy/node_modules/playwright-core/index.mjs";
import { probe } from "/Users/domininclynch/Developer/armagedom/.claude/worktrees/arma-art-fc3cad/Web/scripts/exit-probe.mjs";
const [, , out, ...crop] = process.argv;
const [x0, y0, x1, y1] = crop.map(Number);
const W = "/Users/domininclynch/Developer/armagedom/.claude/worktrees/arma-art-fc3cad/Web/public/world";
const r = probe("east", "east-bridge", 18);
const g = r.geo;
const clear = [],
  narrow = [];
const xs = g.road.map((p) => p.x),
  zs = g.road.map((p) => p.z);
for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2)
  for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.2) {
    const p = { x, z },
      s = g.point(p);
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    if (g.clear(p, 0.4)) clear.push([s.x, s.y]);
    else if (g.clear(p, 0)) narrow.push([s.x, s.y]);
  }
const stall = r.stalled.map((s) => {
  const p = g.point(s.stuckAt);
  return [p.x, p.y];
});
const layout = JSON.parse(readFileSync(`${W}/east/layout.json`));
const link = JSON.parse(readFileSync(`${W}/manifest.json`)).links.find((l) => l.from === "east" && l.to === "east-bridge");
const html = `<body style="margin:0;background:#000"><canvas id=c width=1672 height=941></canvas><script>
const img = new Image(); img.src = "file://${W}/east/backdrop.png";
img.onload = () => {
  const c = document.getElementById("c"), g = c.getContext("2d"); g.drawImage(img, 0, 0, 1672, 941);
  const P = (p) => [p.x * 1672, p.y * 941];
  const poly = (pts, stroke, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p)))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); };
  const dots = (pts, color, r) => { g.fillStyle = color; for (const [x, y] of pts) { g.beginPath(); g.arc(x * 1672, y * 941, r, 0, 7); g.fill(); } };
  dots(${JSON.stringify(clear)}, "rgba(0,255,102,0.55)", 2);
  dots(${JSON.stringify(narrow)}, "rgba(255,160,0,0.9)", 2);
  poly(${JSON.stringify(layout.road)}, "#00ff66", null);
  for (const b of ${JSON.stringify(layout.blockers)}) poly(b.points ?? b, "#ff3030", "rgba(255,0,0,0.2)");
  dots(${JSON.stringify(stall)}, "#ffffff", 4);
  const k = ${JSON.stringify(link.condition)};
  g.strokeStyle = "#30a0ff"; g.lineWidth = 3;
  g.strokeRect(k.xMin * 1672, k.yMin * 941, (k.xMax - k.xMin) * 1672, (k.yMax - k.yMin) * 941);
  document.title = "done";
};
</script>`;
writeFileSync("/tmp/overlay2.html", html);
const browser = await chromium.launch({
  headless: true,
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ["--headless=new", "--mute-audio", "--allow-file-access-from-files"],
});
const page = await (await browser.newContext({ viewport: { width: 1672, height: 941 } })).newPage();
await page.goto("file:///tmp/overlay2.html");
await page.waitForFunction(() => document.title === "done", null, { timeout: 30000 });
await page.screenshot({ path: out, clip: { x: x0 * 1672, y: y0 * 941, width: (x1 - x0) * 1672, height: (y1 - y0) * 941 } });
await browser.close();
console.log("ok", out, "clear", clear.length, "narrow", narrow.length, "stalls", stall.length);
