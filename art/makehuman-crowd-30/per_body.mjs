// node art/makehuman-crowd-30/per_body.mjs   writes per-body-register.md (register.mjs output per body, read back from the manifest) and per-body-provenance.md (one line per body)
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const man = JSON.parse(readFileSync(new URL("Web/public/assets/manifest-hollow.json", root), "utf8"));
const pool = JSON.parse(readFileSync(new URL("Web/src/data/crowdBodies.json", root), "utf8")).pool;
const rj = JSON.parse(readFileSync(new URL("art/makehuman-crowd-30/rows.json", root), "utf8"));
const mf = Object.fromEntries(
  readFileSync(new URL("art/makehuman-crowd-30/crowd30-manifest.tsv", root), "utf8").trim().split("\n").slice(1).map((l) => { const c = l.split("\t"); return [c[0], c]; }),
);
const ids = Object.keys(man.models).filter((n) => /^mh-worn-\d+$/.test(n)).sort();
const reg = ["# register.mjs output per body (read back from manifest-hollow.json)", "", "| id | url | bytes | sha256 | scale | stride | mesh top m | mesh bottom m | hips m | deferred | pool row |", "|---|---|---|---|---|---|---|---|---|---|---|"];
const prov = ["# One provenance line per body", ""];
for (const id of ids) {
  const m = man.models[id], p = pool.find((r) => r.ref === id);
  reg.push(`| ${id} | ${m.url} | ${m.bytes} | ${m.sha256.slice(0, 16)}... | ${m.scale} | ${m.stride} | ${m.measure.meshTopMetres} | ${m.measure.meshBottomMetres} | ${m.measure.hipsMetres} | ${m.deferred} | active ${p.active}, weight ${p.weight} |`);
  const f = rj[id].factory_row, c = mf[f];
  prov.push(`- ${id}: factory row ${f}, ${c[1] === "m" ? "man" : "woman"} age ${c[2]}, skin ${c[3]}, hair ${c[4]}, suit ${c[5]} (${c[6]} top, ${c[7]} trousers, ${c[8]} shoes), ${m.provenance.trisAfter} tris, ${m.provenance.kbAfter} KB, CC0 packs only, rows in rows.json and crowd30-rows.json.`);
}
writeFileSync(new URL("art/makehuman-crowd-30/per-body-register.md", root), reg.join("\n") + "\n");
writeFileSync(new URL("art/makehuman-crowd-30/per-body-provenance.md", root), prov.join("\n") + "\n");
console.log(ids.length, "bodies");
