// Player-facing text lives in data (visual.json) as plain strings with {placeholders}. fillText swaps each {name} for its value; the
// validators in engine/text-template.js check every template at load, so a typo never shows "{ara}" on screen.
export const PLACEHOLDER = /\{([A-Za-z]+)\}/g;
export function fillText(template, values) {
  return template.replace(PLACEHOLDER, (_, name) => String(values[name]));
}
