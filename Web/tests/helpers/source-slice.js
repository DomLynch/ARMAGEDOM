// Some tests run a closure-internal function (start, pause, cancelPistol, ...) by cutting
// its source text out of a module. Real imports are not possible for those yet, so this
// finds the cut points by token: whitespace is ignored and both quote styles match, so
// reformatting a source file cannot move or break the markers.
const normalise = (text) => {
  let flat = '';
  const origin = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) continue;
    flat += ch === '"' || ch === '`' ? "'" : ch;
    origin.push(i);
  }
  return {flat, origin};
};
const tokenOf = (marker) => normalise(marker).flat;

// Index in `text` where `marker` starts (at or after `from`), or -1.
export function indexOfToken(text, marker, from = 0) {
  const {flat, origin} = normalise(text);
  const startFlat = origin.findIndex((o) => o >= from);
  if (startFlat < 0) return -1;
  const at = flat.indexOf(tokenOf(marker), startFlat);
  return at < 0 ? -1 : origin[at];
}

// Source from `startMarker` up to (not including) `endMarker`.
export function sliceBetween(text, startMarker, endMarker) {
  const start = indexOfToken(text, startMarker);
  if (start < 0) throw Error('Start marker not found: ' + startMarker);
  const end = indexOfToken(text, endMarker, start + 1);
  if (end < 0) throw Error('End marker not found: ' + endMarker);
  return text.slice(start, end);
}

// Whole function starting at `marker` (for example 'function cancelPistol(g)'), found by
// matching braces from its body; strings and template text containing braces are skipped.
export function functionSource(text, marker) {
  const start = indexOfToken(text, marker);
  if (start < 0) throw Error('Function not found: ' + marker);
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw Error('Unbalanced function: ' + marker);
}

// Replace the first token match of `marker` with `replacement`.
export function replaceToken(text, marker, replacement) {
  const start = indexOfToken(text, marker);
  if (start < 0) throw Error('Marker not found: ' + marker);
  const {flat, origin} = normalise(text);
  const len = tokenOf(marker).length;
  const at = origin.indexOf(start);
  const endOrigin = origin[at + len - 1] + 1;
  void flat;
  return text.slice(0, start) + replacement + text.slice(endOrigin);
}
