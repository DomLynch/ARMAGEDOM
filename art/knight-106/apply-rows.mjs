// Writes the Station Breaker (boss-area7-knight) rows as text edits, so nothing else in the shared JSON is re-serialised.
// usage (repo root, after build-knight.mjs wrote Web/public/assets/bosses/boss-area7-knight.glb): node art/knight-106/apply-rows.mjs
//   then from Web/: node tools/physics-floor-support.mjs boss-area7-knight
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";

const glb = "Web/public/assets/bosses/boss-area7-knight.glb",
  bytes = statSync(glb).size,
  sha = createHash("sha256").update(readFileSync(glb)).digest("hex"),
  manifestPath = "Web/public/assets/manifest-hollow.json",
  manifest = readFileSync(manifestPath, "utf8"),
  eol = manifest.includes("\r\n") ? "\r\n" : "\n",
  row = `    "boss-area7-knight": {
      "motion": "donor-knife",
      "scale": 0.9,
      "forwardCorrection": 0,
      "stride": 0.95,
      "upperBone": "mixamorig:Spine",
      "headBone": "mixamorig:Head",
      "handBone": "fk_socket_hand_r",
      "upperArmBone": "mixamorig:RightArm",
      "foreArmBone": "mixamorig:RightForeArm",
      "torsoBone": "mixamorig:Spine",
      "clips": {
        "idle": "Idle",
        "walk": "Walk",
        "run": "Run",
        "slash": "Attack",
        "return": "Return",
        "stab": "Riposte",
        "heavy": "Heavy",
        "attack": "Heavy",
        "guard": "Guard",
        "dodge": "Roll",
        "hit": "Hit",
        "death": "Death",
        "parry": "Parry",
        "block": "BlockImpact",
        "blockImpact": "BlockImpact",
        "deflected": "Deflected",
        "strafeLeft": "StrafeLeft",
        "strafeRight": "StrafeRight"
      },
      "url": "bosses/boss-area7-knight.glb",
      "rig": "boss-area7-knight",
      "deferred": true,
      "bytes": ${bytes},
      "sha256": "${sha}",
      "provenance": {
        "source": "Mixamo V2 Knight (D. Pelegrini) on the 106 rig, knight-d-pelegrini-full-phone-mixamorig.glb",
        "sourceSHA256": "2afe32d594948b31deb76636c59e78579831affd062e7caa17f2f5d4bfe8f8d3",
        "licence": "Mixamo, cleared by Dom 2026-10-23",
        "assembly": "art/knight-106/build-knight.mjs: nine own clips kept, Layer_Tunic/Helmet/Bracers/Greaves/Scabbard and Stress_* dropped, Layer_Sword kept in the right hand (SwordDrawn), seven clips borrowed from the pitborn hunter; blade path baked by art/knight-106/attack-path.mjs",
        "previous": { "url": "bosses/boss-area7-knight.glb", "rig": "boss-warden carrier, Maul clips", "scale": 1, "stride": 1, "bytes": 2902944 }
      }
    },`,
  start = manifest.indexOf('    "boss-area7-knight": {'),
  end = manifest.indexOf('    "player-shotgun": {');
if (start < 0 || end < start) throw Error("knight model row not found");
let out = manifest.slice(0, start) + row.replaceAll("\n", eol) + eol + manifest.slice(end);
const fileRow = (s) => s.replace(/("boss-area7-knight": \{\s+"file": "bosses\/boss-area7-knight.glb",\s+"bytes": )\d+(,\s+"sha256": ")[0-9a-f]+/, `$1${bytes}$2${sha}`);
out = fileRow(out);
writeFileSync(manifestPath, out);

const rigsPath = "Web/src/data/physicsRigs.json",
  rigs = readFileSync(rigsPath, "utf8"),
  old = /("boss-area7-knight": \{\s+"rig": ")v1-65(",\s+"body": ")warden-65/;
if (!old.test(rigs)) throw Error("physicsRigs model row not found");
writeFileSync(rigsPath, rigs.replace(old, "$1mixamo-106$2knight-106"));
console.log(bytes, sha);
