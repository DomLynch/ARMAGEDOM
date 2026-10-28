// node art/makehuman-crowd-30/shoot.mjs OUT_DIR mode cols clip t idsPerSheet [id ...]
// Serves Web/node_modules/three at /three and Web/public/assets/crowd at /crowd, shoots sheets 375 css px wide at 3x (headless Chromium, software GL is fine: stills only).
// Playwright comes from a node_modules next to another project (NODE_PATH-free): pass PLAYWRIGHT_DIR=/path/to/node_modules/playwright.
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
const root = new URL("../../", import.meta.url).pathname;
const [, , outDir, mode = "full", cols = "3", clip = "Idle", t = "0.4", per = "6", ...given] = process.argv;
const { chromium } = await import(process.env.PLAYWRIGHT_DIR + "/index.mjs");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary" };
const map = (url) => (url.startsWith("/three/") ? join(root, "Web/node_modules/three", url.slice(7)) : url.startsWith("/crowd/") ? join(root, "Web/public/assets/crowd", url.slice(7)) : join(root, "art/makehuman-crowd-30", url === "/" ? "viewer.html" : url));
const server = http.createServer((req, res) => {
  const p = map(req.url.split("?")[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const ids = given.length ? given : readdirSync(join(root, "Web/public/assets/crowd")).filter((n) => /^mh-worn-/.test(n)).map((n) => n.replace(".glb", "")).sort();
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 3 })).newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
const info = [];
for (let s = 0; s * +per < ids.length; s++) {
  const group = ids.slice(s * +per, (s + 1) * +per);
  await page.goto(`http://127.0.0.1:${port}/?ids=${group.join(",")}&mode=${mode}&cols=${cols}&clip=${clip}&t=${t}`);
  await page.waitForFunction("window.__done === true", null, { timeout: 120000 });
  const name = `${mode}-${clip.toLowerCase()}-${String(s + 1).padStart(2, "0")}.png`;
  await (await page.$("canvas")).screenshot({ path: join(outDir, name) });
  info.push(...(await page.evaluate("window.__info")).map((x) => ({ ...x, sheet: name })));
  console.log(name, group.join(" "));
}
writeFileSync(join(outDir, `${mode}-${clip.toLowerCase()}-info.json`), JSON.stringify(info, null, 1));
await browser.close(); server.close();
