// Until 1 Nov 2026 the manifest's `vagrant` player row was the donor warrior (donor/warrior-phone.glb); the player is now
// the Perseus body. Tests of mechanics that were measured on the donor body (pinned sweeps, goldens, bone and clip names)
// run against the donor row on purpose, so they keep proving creature logic without pretending Perseus is the donor.
import fs from "node:fs";
export const donorPlayerRow = () =>
  JSON.parse(fs.readFileSync(new URL("../fixtures/donor-player-row.json", import.meta.url), "utf8"));
export const withDonorPlayer = (manifest) => ((manifest.models.vagrant = donorPlayerRow()), manifest);
