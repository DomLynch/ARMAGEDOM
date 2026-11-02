import { GAME_DATA } from "./game-data.js";
// Small local silhouettes of the carried weapon families; no model/image requests.
const paths = {
  railgun:
    "M3 17H19L26 21H43V16H95V22H43L39 35H30L34 24H22L17 32H9L13 23H3Z M40 22H58V40H40Z",
  drone:
    "M18 11H35L42 17H58L65 11H82V21H65L58 27H42L35 21H18Z M8 5H30V9H8Z M70 5H92V9H70Z M8 27H30V31H8Z M70 27H92V31H70Z M45 27H55V36H45Z",
  knife: "M8 30 35 22 91 10C85 23 63 33 40 33L37 28 12 39Z M34 20 38 19 43 36 39 37Z",
  cleaver: "M9 33 33 25 29 14 78 6 90 11 89 29 39 35 36 31 14 41Z M30 23 35 22 40 38 35 39Z",
  saw: "M8 24H29V14H49V20H93L96 24 91 28 87 25 83 28 79 25 75 28 71 25 67 28 63 25H49V33H27V29H8Z",
  scalpel: "M9 32 47 21 49 25 13 39Z M47 20 91 7 85 18 51 27Z",
  pistol: "M12 10H79L87 14V23H54L43 39H26L33 21H12Z M53 22H63V28H48Z",
  rifle: "M3 16H19L25 20H47V13H67V17H96V21H69V25H53L49 38H41L44 25H29L25 34H18L22 24H13L7 30H3Z M55 10H63V14H55Z",
  flame:
    "M5 17 29 12H77V15H96V19H80V25H50L44 36H36L40 25H28L23 36H16L20 23H11V31H5Z M47 27H65Q72 27 72 33T65 39H47Q40 39 40 33T47 27Z M36 9H44V13H36Z",
  shotgun: "M3 17H23L29 20H51V16H94V20H60V23H94V27H54L48 34H38L42 25H29L22 35H15L20 25H10L4 31H1Z",
  grenade: "M42 13H60L68 24 67 35 58 42H43L34 35 33 24Z M43 6H57V14H43Z M53 6H68L76 22 72 25 63 12H53Z M47 0H55V6H47Z",
  rocket: "M3 15H11V11H17V15H75L83 10 97 20 83 30 75 25H54L50 39H43L46 25H29V31H22V25H17V29H11V25H3Z M36 9H48V15H36Z",
};
const families = {
  knife: "knife",
  "hale-pitborn-cleaver-v1": "cleaver",
  "surgeons-knife-v1": "saw",
  "westminster-start-pistol-v1": "pistol",
  "watchmans-pistol-v1": "drone",
  "borough-marshals-pistol-v1": "railgun",
  "bridge-warden-rifle-v1": "rifle",
  "flamethrower-area8-v1": "flame",
  "ember-flamethrower-v1": "flame",
  "south-stalker-shotgun-v1": "shotgun",
  "standard-grenade-v1": "grenade",
  "borough-butchers-rocket-launcher-v1": "rocket",
};
const CAPTIONS = GAME_DATA.combatText.gear.iconCaptions; // data/combatText.json: the caption under each silhouette
const icons = Object.fromEntries(
  Object.entries(paths).map(([id, d]) => [
    id,
    'url("data:image/svg+xml,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 44"><path d="${d}"/></svg>`) +
      '")',
  ]),
);
export function weaponTileIcon(itemId) {
  const family = families[itemId];
  if (!family || !CAPTIONS[itemId]) throw Error("Missing carried weapon silhouette: " + itemId);
  return { family, caption: CAPTIONS[itemId], mask: icons[family] };
}
