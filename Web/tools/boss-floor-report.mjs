// How far each boss's skin ends below (-) or above (+) the floor after the ragdoll settles, unscaled metres and world metres:
//   node tools/boss-floor-report.mjs [model ...]      (run from Web/)
import { bossSettle } from "../tests/helpers/boss-floor-trace.js";

const models = process.argv.length > 2 ? process.argv.slice(2) : ["boss-warden", "boss-area8-veteran", "boss-area7-knight", "boss-butcher"],
  f = (x) => x.toFixed(3);
for (const model of models) {
  const { settled, later, scale, root } = await bossSettle(model, { afterSeconds: 3 });
  console.log(`${model}: lowest skin ${f(settled.y / scale)} m unscaled (${f(settled.y)} m world) at ${settled.mesh}; 3 s later ${f(later.y / scale)}; root lift ${f(root.position.y)} m`);
}
process.exit(0);
