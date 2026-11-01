import { GAME_DATA } from "./engine/game-data.js";

// Player-rig bone names come from the model's manifest row (handBone, upperArmBone, foreArmBone, torsoBone); the current hero rig is the data default.
const DEFAULTS = GAME_DATA.donorMotion.rigBones,
  FIELDS = { hand: "handBone", upperArm: "upperArmBone", foreArm: "foreArmBone", torso: "torsoBone" };

// Stamp the row's bone names on the cloned scene once, so pose code that only holds the model can resolve them.
export function setRigBones(model, description) {
  const names = {};
  for (const key in FIELDS) if (description?.[FIELDS[key]]) names[key] = description[FIELDS[key]];
  model.userData.rigBones = names;
}
// three strips ':' etc. from node names on load, so a "mixamorig:RightHand" row resolves as "mixamorigRightHand".
// three's PropertyBinding.sanitizeNodeName, kept here so this file stays out of the renderer-owner list.
const sanitize = (name) => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
export function rigBone(model, key) {
  return model.getObjectByName(sanitize(rigBoneName(model, key)));
}
export const rigBoneName = (model, key) => model.userData?.rigBones?.[key] ?? DEFAULTS[key];
