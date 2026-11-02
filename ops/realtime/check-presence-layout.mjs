// node ops/realtime/check-presence-layout.mjs [--release /opt/armagedom-realtime/current] [--journal | --line "<presence listening line>"] [--tree]
// The layout gate. Presence loads its area layout (exit zones, arrivals, road) from ONE file at start and never re-reads it, so a release that
// changes a layout without restarting presence leaves the old exit zones live: the game lets a player leave through the new wider exit and
// presence still refuses it (refuse-travel). That happened on 25-26 Oct 2026 (live e7a262a1ef51b445 while main generated aea70cec4978d2da).
// Run it after every flip and every presence restart. It compares up to three hashes and exits 1 if any differ:
//   running   the `layout <hash>` in presence's last "presence listening" journal line (the process that is serving players)
//   release   `version` in <release>/server/data/area-presence.json (what a restart WOULD load)
//   tree      with --tree: the layout this source tree generates now (Web/scripts/area-presence-rows.mjs; needs Web's node_modules)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const LISTENING = /presence listening on \S+, layout ([0-9a-f]{16})\b/;

/** The layout hash in the LAST presence-listening line of `text`, or null. */
export function runningLayout(text) {
  const hits = String(text).split("\n").map((line) => LISTENING.exec(line)?.[1]).filter(Boolean);
  return hits.length ? hits.at(-1) : null;
}

/** Problems (strings) from comparing the hashes; an empty list means the running presence serves the release (and tree) layout. */
export function layoutProblems({ running, release, tree = null }) {
  const problems = [];
  if (!running) problems.push("no 'presence listening ... layout <hash>' line found: presence is not running, or it is OFF");
  if (!release) problems.push("the release has no readable server/data/area-presence.json version");
  if (running && release && running !== release)
    problems.push(`STALE PRESENCE: running layout ${running} but the release holds ${release}: restart arma-presence (the zones in memory are not the ones on disk)`);
  if (tree !== null && release && release !== tree)
    problems.push(`STALE RELEASE: the release holds layout ${release} but this source tree generates ${tree}: rebuild the bundle with a fresh area-presence.json`);
  if (tree !== null && running && running !== tree && running === release)
    problems.push(`STALE RELEASE: presence runs ${running} but this source tree generates ${tree}`);
  return problems;
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

export function releaseLayout(releaseDir) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(releaseDir, "server/data/area-presence.json"), "utf8")).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

async function treeLayout() {
  const mod = await import(new URL("../../Web/scripts/area-presence-rows.mjs", import.meta.url).href);
  return mod.areaPresenceData().version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const release = arg("--release") ?? "/opt/armagedom-realtime/current";
  let text = arg("--line");
  if (text === undefined && process.argv.includes("--journal")) {
    const run = spawnSync("journalctl", ["-u", "arma-presence", "--no-pager", "-o", "cat", "-n", "2000"], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`journalctl failed: ${run.stderr}`);
    text = run.stdout;
  }
  if (text === undefined) throw new Error('usage: check-presence-layout.mjs [--release dir] (--journal | --line "<line>") [--tree]');
  const facts = { running: runningLayout(text), release: releaseLayout(release), tree: process.argv.includes("--tree") ? await treeLayout() : null };
  console.log(`layout: running=${facts.running ?? "none"} release=${facts.release ?? "none"}${facts.tree !== null ? ` tree=${facts.tree}` : ""}`);
  const problems = layoutProblems(facts);
  for (const p of problems) console.error(`FAIL ${p}`);
  if (problems.length) process.exit(1);
  console.log("OK: presence serves the release layout");
}
