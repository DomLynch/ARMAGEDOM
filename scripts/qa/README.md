# Small release browser sequences

Stable entry: `scripts/qa/run.mjs`, shared ordinary-input sequences and receipts: `scripts/qa/scenarios.mjs`. Run on the existing VPS; the launcher/server stays the existing release job. No runtime module, game-field mutation, balance adjustment or new release gate.

Profiles:

| Profile | Selected sequence | Prior evidence |
|---|---|---|
| `camera` | Same-position landscape → portrait → landscape before any action; pixel size and control bounds, no whole-matrix comparison across follow-state transitions | 055/061 camera receipts; invalid061 moving-position assertion retained |
| `hud` | Native Chromium move+Slash, move+Guard, pointer cancel, then menu-resumed-clock Retry | 060 trusted touch receipt; not physical Safari/rapid taps/menu scroll |
| `weapon` | Existing ordinary pistol pickup, optional controlled travel, held pointer until each actual shot acknowledgement, ordinary/selected death, resources and Retry | 057 finisher and059 held-fire recipes |
| `animal` | Select exactly one boundary: `bite`, `low`, or `pistol`; do not replay a whole choreography after an independent layer passed | 058–059 bite/low/kill receipts and failed controllers |

Supply a JSON configuration with `packageRoot`, exact `expect` identity (`source`, `fingerprint`, `packageSha256`), local `baseURL`, `output`, `profile`, and relevant `entry`, `animal`, `weapon`, or `camera` options. Example animal pistol boundary options: `weapon: {targetKey: "south-roamer-8", damageSteps: [25,5], expectedRecipe: "ordinary", expectedClip: "dog_death"}`. A fresh30HP dog needs25+5; a prior low-hit20HP dog is a different precondition. Do not force one scene into the other. The entry calls the existing compiled crossArea interface; receipts explicitly label controlled setup, never walked travel.

Each `stage()` immediately writes a raw observation and atomic stage receipt bound to package/source, scenario implementation digest, selected input options, real preconditions, browser/viewport and raw SHA. A failed stage is saved and rethrown; the process still exits unsuccessfully. Earlier failed wrappers stay failed. `reuseMatches()` only reports strict matching passed evidence and intact raw bytes; it does not approve reuse or modify game state. Lead must confirm required dependencies/environment. Record references to reused layers, not a new combined fight. Fresh baseline/preconditions are read before every stage. Different area/position/viewport/follow history forbids a whole camera-matrix equality claim.

Run only the failed boundary when its independent predecessors remain valid. Setup still uses ordinary inputs. Under pressure, the supported held-fire path waits for the actual shot event; a sampled ready cue is not a guarantee of a later edge click. Low-counter aiming is computed before the recovery wait, then real accepted tick is recorded; no perfect-counter claim from the earlier decision timestamp.

Validation: `node --test scripts/qa/scenarios.test.mjs` and syntax checks. Four checks cover identity/input/environment/precondition mismatch, raw tampering, failed-receipt retention, path safety, and hash-matched observation seams against exact060/061 packages. This extraction did not run a new browser, build, fight or release. These are reusable tools, not newly observed device outcomes. Preserve `qa/ipad-060/`, `qa/portrait-061/`, `qa/rat-058/`, `qa/dog-059/` original receipts.
