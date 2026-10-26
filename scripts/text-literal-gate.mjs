// Text-literal gate: English a player can read lives in data (Web/src/data/*.json read through engine/game-data.js), not in code.
// A sentence is a quoted string that starts with a capital letter and holds at least three words. Error and validation text
// (a line that throws, rejects, fails or logs) is not counted, and neither is a line that ends with `// text-ok: <reason>`
// (an internal mesh or profile name the player never sees). Each file may carry at most its count in
// scripts/as-data-baseline.json `textLiterals`; a file not listed may carry none.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

// Temporary, dated exception (Lead, 26 Oct 2026): while five lanes move their text in parallel, a file below its baseline is not
// a finding, so their PRs need not edit as-data-baseline.json. Increases and new files still fail. The final Lead PR sets this to
// false and empties the table, as #317 did for numbers.
export const TEXT_SHRINK_TOLERANCE = true;

const TEXT_MARK = /\/\/\s*text-ok:(.*)$/;
const ERROR_LINE = /\bthrow\b|Error\(|\bfail\(|console\.|reject\(|assert/;
const QUOTED = [/"([^"\n]*)"/g, /'([^'\n]*)'/g, /`([^`\n]*)`/g];

export const isSentence = (s) => /^[A-Z][a-z']/.test(s) && (s.match(/ /g) ?? []).length >= 2 && /[a-z]{2}/.test(s);

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
