import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The numbers atmosphere.js uses to place and draw the smoke, flame and ember quads, from data/atmosphere.json `render`. Checked when
// this module loads (game-data.js checks the anchors and presets). Shares are fractions of the anchor's own width or rise; sizes are
// fractions of the painting; `maxStepSeconds` caps one frame's clock step.
const fail = (why) => {
  throw TypeError(`Invalid game data atmosphere: render.${why}`);
};
const number = (field, v, min, max) => {
  if (!Number.isFinite(v) || v < min || v > max) fail(`${field} must be ${min} to ${max}`);
};
export function validateAtmosphereRender(r) {
  closed(r, ["depthMargin", "renderOrder", "maxStepSeconds", "smoke", "flame", "ember"]);
  number("depthMargin", r.depthMargin, 0, 10);
  number("renderOrder", r.renderOrder, -1000, 1000);
  number("maxStepSeconds", r.maxStepSeconds, 0.001, 1);
  closed(r.smoke, ["heightShare", "driftShare"]);
  number("smoke.heightShare", r.smoke.heightShare, 0.001, 4);
  number("smoke.driftShare", r.smoke.driftShare, 0, 4);
  closed(r.flame, ["alpha"]);
  number("flame.alpha", r.flame.alpha, 0.001, 1);
  closed(r.ember, ["width", "height", "driftShare", "riseShare", "alpha"]);
  number("ember.width", r.ember.width, 0.00001, 1);
  number("ember.height", r.ember.height, 0.00001, 1);
  number("ember.driftShare", r.ember.driftShare, 0, 4);
  number("ember.riseShare", r.ember.riseShare, 0, 4);
  number("ember.alpha", r.ember.alpha, 0.001, 1);
}
validateAtmosphereRender(GAME_DATA.atmosphere.render);
export const ATMOSPHERE_RENDER = GAME_DATA.atmosphere.render;
