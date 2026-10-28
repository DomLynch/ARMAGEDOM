// KB-per-body weight budget row. Measures every shipped body GLB (crowd, creature NPC, hero, boss) and fails any over its class line.
//   node scripts/body-kb-budget.mjs        prints the table, exit 1 on a breach
// Budget numbers and the reason for them: scripts/body-kb-budget.json. Reads the files on disk; no build, no browser.
import { readFileSync } from "node:fs";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(web, "public/assets");
export const BUDGET = JSON.parse(readFileSync(path.join(web, "scripts/body-kb-budget.json"), "utf8"));

export function classOf(url) {
  const dir = url.split("/")[0];
  for (const [name, c] of Object.entries(BUDGET.classes)) if (c.dirs.includes(dir)) return name;
  return "named";
}

export function measure() {
  const manifest = JSON.parse(readFileSync(path.join(assets, "manifest-hollow.json"), "utf8"));
  const urls = [...new Set(Object.values(manifest.models).map((m) => m.url))].filter((u) => !BUDGET.notBodyDirs.includes(u.split("/")[0]) && u.endsWith(".glb")).sort();
  return urls.map((url) => {
    const raw = readFileSync(path.join(assets, url)), kb = raw.length / 1024;
    const cls = classOf(url), c = BUDGET.classes[cls];
    const line = c.softKB + c.toleranceKB, ceiling = BUDGET.exceptions[url];
    // Wire size: what a server sends with gzip (level 9) or brotli (default quality). `deferred` bodies load after first input.
    const deferred = Object.values(manifest.models).filter((m) => m.url === url).every((m) => m.deferred === true);
    return { url, cls, kb, line, ceiling, over: kb > line, ok: kb <= (ceiling ?? line), gzip: gzipSync(raw, { level: 9 }).length, brotli: brotliCompressSync(raw).length, deferred };
  });
}

// Bodies fetched before first input (not `deferred`) count toward V3's first-visit wire budget (data/build.json firstVisitBytes in
// frankendom-v3, 5.5 MB for the alpha). Gzip is the conservative encoding. Every shipped body is reported as the all-bodies total.
export function wireTotals(rows = measure()) {
  const sum = (list, k) => list.reduce((n, r) => n + r[k], 0);
  const first = rows.filter((r) => !r.deferred);
  return { firstVisitGzip: sum(first, "gzip"), firstVisitBrotli: sum(first, "brotli"), allGzip: sum(rows, "gzip"), allBrotli: sum(rows, "brotli"), firstVisitBodies: first.length, budget: BUDGET.firstVisitWireBytes };
}

export function problems(rows = measure()) {
  const out = [];
  for (const r of rows) {
    if (!r.ok) out.push(`${r.url}: ${r.kb.toFixed(0)} KB over ${r.ceiling ? `its exception ceiling ${r.ceiling}` : `the ${r.cls} line ${r.line}`} KB`);
    if (r.ceiling && !r.over) out.push(`${r.url}: ${r.kb.toFixed(0)} KB is under the ${r.cls} line ${r.line} KB; remove it from exceptions`);
  }
  const t = wireTotals(rows);
  if (t.firstVisitGzip > t.budget) out.push(`first-visit bodies: ${t.firstVisitGzip} gzip bytes over the ${t.budget} byte first-visit budget`);
  for (const url of Object.keys(BUDGET.exceptions)) if (!rows.some((r) => r.url === url)) out.push(`${url}: exception for a body that is not shipped; remove it`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = measure();
  for (const r of rows.sort((a, b) => b.kb - a.kb)) console.log(`${r.kb.toFixed(0).padStart(5)} KB  ${r.cls.padEnd(8)} line ${String(r.line).padStart(4)}  ${r.over ? "OFFENDER" + (r.ok ? " (recorded exception)" : " BREACH") : "ok"}  ${r.url}`);
  for (const r of rows) console.log(`wire ${(r.gzip / 1024).toFixed(0).padStart(5)} KB gzip ${(r.brotli / 1024).toFixed(0).padStart(5)} KB brotli ${r.deferred ? "deferred  " : "first-visit"} ${r.url}`);
  console.log(JSON.stringify(wireTotals(rows)));
  const p = problems(rows);
  console.log(`${rows.length} bodies, ${rows.filter((r) => r.over).length} over the class line, ${p.length} problems`);
  for (const line of p) console.error(line);
  process.exitCode = p.length ? 1 : 0;
}
