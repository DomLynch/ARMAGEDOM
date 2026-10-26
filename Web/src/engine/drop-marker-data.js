// visual.json `dropMarker` layout fields (engine/drop-marker.js): the floating label's canvas, the radial glow's gradient, and the ring's
// height and segment count. Called from validateVisual in game-data.js; the older dropMarker fields are checked there.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const share = (field, v) => {
  if (!(v >= 0 && v <= 1)) fail("visual", `${field} must be 0 to 1`);
};

export function validateDropMarkerLayout(m) {
  closed(m.label, ["canvasWidth", "canvasHeight", "textY", "textMaxWidth", "opacityBase", "opacitySwing"]);
  for (const f of ["canvasWidth", "canvasHeight", "textMaxWidth"]) number("visual", `dropMarker.label.${f}`, m.label[f], 16);
  number("visual", "dropMarker.label.textY", m.label.textY, 0);
  if (m.label.textY > m.label.canvasHeight) fail("visual", "dropMarker.label.textY must sit inside the canvas");
  share("dropMarker.label.opacityBase", m.label.opacityBase);
  share("dropMarker.label.opacitySwing", m.label.opacitySwing);
  if (m.label.opacityBase + m.label.opacitySwing > 1) fail("visual", "dropMarker.label opacity must not exceed 1");
  closed(m.glow, ["canvasPx", "groundY", "clearShare", "clearAlpha", "innerAlpha", "bandAlpha", "outerAlpha", "tailShare", "tailAlpha"]);
  number("visual", "dropMarker.glow.canvasPx", m.glow.canvasPx, 16);
  number("visual", "dropMarker.glow.groundY", m.glow.groundY, 0);
  for (const f of ["clearShare", "clearAlpha", "innerAlpha", "bandAlpha", "outerAlpha", "tailShare", "tailAlpha"])
    share(`dropMarker.glow.${f}`, m.glow[f]);
  number("visual", "dropMarker.ringY", m.ringY, 0);
  if (!Number.isInteger(m.ringSegments) || m.ringSegments < 3) fail("visual", "dropMarker.ringSegments must be an integer of at least 3");
}
