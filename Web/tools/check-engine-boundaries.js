import {posix} from 'node:path';

// Product source only. Unit tests may intentionally exercise internal modules.
export function boundaryViolations(files, policy) {
  const internal = file => file.startsWith('engine/') || policy.legacyEngineFiles.includes(file);
  const doors = new Set(policy.publicEntries);
  const findings = [];
  for (const [file, source] of Object.entries(files)) {
    if (internal(file)) continue;
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Style-independent: `import{x}from'./a.js'` and `import { x } from "./a.js"` are the same import.
    const imports = /\b(?:import(?=[\s{*'"])\s*(?:(?:[^;'"\n]|\n)*?\bfrom\s*)?|export(?=[\s{*])\s*(?:[^;'"\n]|\n)*?\bfrom\s*)['"]([^'"\n]+)['"]|\bimport\s*\(\s*['"]([^'"\n]+)['"]/g;
    for (const match of code.matchAll(imports)) {
      const specifier = match[1] ?? match[2];
      // Keep client module paths explicit; escape sequences must not hide an
      // internal target from this conventional-JS import checker.
      if (specifier.includes('\\')) { findings.push(`${file}|escaped-import`); continue; }
      if (specifier === 'three' || specifier.startsWith('three/')) {
        findings.push(`${file}|renderer-import|${specifier}`);
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      if (internal(target) && !doors.has(target)) findings.push(`${file}|internal-import|${target}`);
    }
    for (const call of code.matchAll(/\bimport\s*\(/g)) {
      const argument = code.slice(call.index + call[0].length);
      // A literal prefix followed by +, a conditional, or another expression
      // is computed too. A comma may start the standard import-options object.
      if (!/^\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*[,)]/.test(argument))
        findings.push(`${file}|computed-import`);
    }
  }
  return [...new Set(findings)].sort();
}

export function checkEngineBoundaries(files, policy, exceptions) {
  const frozen = new Set(policy.legacyExceptions);
  const active = new Set(exceptions);
  if (active.size !== exceptions.length) throw Error('Duplicate legacy boundary exception');
  for (const row of active) if (!frozen.has(row)) throw Error(`Legacy exception cannot grow: ${row}`);
  const violations = new Set(boundaryViolations(files, policy));
  for (const row of violations) if (!active.has(row)) throw Error(`Forbidden engine boundary: ${row}`);
  for (const row of active) if (!violations.has(row)) throw Error(`Remove resolved legacy exception: ${row}`);
  return {legacyRemaining: active.size};
}
