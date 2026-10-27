import fs from "node:fs";
// The polygon safehouse Westminster used to ship (removed 27 Oct 2026, Dom's ruling) plus the Central Hub whole-area site. The engine
// still supports a polygon safehouse in any area, so the mechanics tests that need one keep using this recorded copy; the shipped
// area-content.json now holds only the Central Hub site.
export const legacySafehouse = JSON.parse(
  fs.readFileSync(new URL("../fixtures/legacy-westminster-safehouse.json", import.meta.url), "utf8"),
);
export const withLegacySafehouse = (content) => ({ ...content, safehouse: structuredClone(legacySafehouse) });
