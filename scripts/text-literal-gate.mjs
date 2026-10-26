// Text-literal gate: English a player can read lives in data (Web/src/data/*.json read through engine/game-data.js), not in code.
// Player text is a quoted string of at least two words that starts with a capital letter in any case ("Reload game",
// "KILL THE SALAMANDER", "A hunter is after you"), or that continues a sentence after a leading `${…}` or separator
// (`${name} equipped.`, " · tap to equip"). Error and validation text (a line that throws, rejects, fails a validator or logs)
// is not counted, and neither is a line that ends with `// text-ok: <reason>`
// (an internal mesh or profile name the player never sees). Each file may carry at most its count in
// scripts/as-data-baseline.json `textLiterals`; a file not listed may carry none.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

// The temporary shrink tolerance (Lead, 26 Oct 2026) ended with the burn-down: the textLiterals table is empty and the gate is strict,
// so any player sentence in Web/src code fails. `textOkCount` ratchets the exemption marks the same way tuningOkCount does.
export const TEXT_SHRINK_TOLERANCE = false;

const TEXT_MARK = /\/\/\s*text-ok:(.*)$/;
const ERROR_LINE = /\bthrow\b|\breject\(|\bfail\(|console\.(?:log|warn|error|info|debug)\(|\bassert/;
const QUOTED = [/"([^"\n]*)"/g, /'([^'\n]*)'/g, /`([^`\n]*)`/g];
const LEAD = /^(?:\$\{[^}]*\}|[\s·•—–\-:,.|]+)+/;

export function isSentence(raw) {
  const rest = raw.replace(LEAD, "");
  const continues = rest !== raw;
  if (!/^[A-Za-z]/.test(rest) || (!continues && !/^[A-Z]/.test(rest))) return false;
  if (/=>|;\s*$|\{\s/.test(rest)) return false;
  const words = raw.trim().split(/\s+/).filter((w) => /[A-Za-z]|\$\{/.test(w));
  return words.length >= 2 && /[A-Za-z]{3,}/.test(rest.replace(/\$\{[^}]*\}/g, ""));
}

// Sentences on code lines, and text-ok marks that lack a reason.
export function countTextLiterals(source) {
  const items = [];
  const unexplained = [];
  source.split("\n").forEach((text, i) => {
    const line = text.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("import ")) return;
    const mark = TEXT_MARK.exec(text);
    if (mark) {
      if (!mark[1].trim()) unexplained.push(i + 1);
      return;
    }
    if (ERROR_LINE.test(text)) return;
    const code = text.replace(/\/\/.*$/, "");
    for (const pattern of QUOTED)
      for (const m of code.matchAll(pattern)) if (isSentence(m[1])) items.push({ line: i + 1, text: m[1] });
  });
  return { count: items.length, items, unexplained };
}

export function textLiteralProblems(paths, baseline = {}, sourceRoot = "", { shrinkTolerance = TEXT_SHRINK_TOLERANCE } = {}) {
  const problems = [];
  let marks = 0;
  for (const path of paths) marks += readFileSync(path, "utf8").split("\n").filter((line) => TEXT_MARK.test(line)).length;
  if (baseline.textOkCount !== undefined) {
    if (marks > baseline.textOkCount)
      problems.push(`${marks} "// text-ok:" marks, limit ${baseline.textOkCount}. Put the text in a data file instead of adding a mark.`);
    else if (marks < baseline.textOkCount && !shrinkTolerance)
      problems.push(`${marks} "// text-ok:" marks, baseline says ${baseline.textOkCount}. Lower textOkCount in scripts/as-data-baseline.json to ${marks}.`);
  }
  for (const path of paths) {
    const key = (sourceRoot ? relative(sourceRoot, path) : path).split("\\").join("/");
    const { count, items, unexplained } = countTextLiterals(readFileSync(path, "utf8"));
    for (const line of unexplained) problems.push(`${key}:${line}: "// text-ok:" needs a reason after the colon.`);
    const allowed = baseline.textLiterals?.[key] ?? 0;
    if (count > allowed)
      problems.push(
        `${key}: ${count} sentence(s) in code, limit ${allowed} (first: "${items[0].text}" line ${items[0].line}). Put player text in a data file read through engine/game-data.js, or end an internal name's line with "// text-ok: <reason>".`,
      );
    else if (count < allowed && !shrinkTolerance)
      problems.push(`${key}: ${count} sentence(s) in code, baseline says ${allowed}. Lower it to ${count} in scripts/as-data-baseline.json.`);
  }
  return problems;
}
