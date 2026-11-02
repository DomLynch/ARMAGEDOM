// One-off: writes the pre-move Opened values to the fixture (run on the old module only).
import { writeFileSync } from "node:fs";
import { openedValues } from "./opened-values.js";

writeFileSync(new URL("../fixtures/opened-pre-data.json", import.meta.url), JSON.stringify(openedValues()));
