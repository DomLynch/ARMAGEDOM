import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {asDataProblems, countRigLiterals, AS_DATA_OWNER} from '../../scripts/as-data-gate.mjs';
import {RIG_CAPABILITIES, rigCapability} from '../src/rig-capabilities.js';

const RIGS = Object.keys(RIG_CAPABILITIES);
function sample(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'as-data-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return {
    dir,
    paths: Object.entries(files).map(([name, text]) => {
      const path = join(dir, name);
      writeFileSync(path, text);
      return path;
    }),
  };
}

test('a new rig-name comparison in engine code fails the gate and points at the capability table', t => {
  const {paths} = sample(t, {'new-feature.js': 'if (target.rig === "original-wolf") boost();\n'});
  const [problem] = asDataProblems(paths, RIGS);
  assert.match(problem, /1 rig-name literal\(s\), limit 0/);
  assert.match(problem, /rigCapability\(\)/);
});

test('every quote style is counted and other strings are not', () => {
  assert.equal(countRigLiterals(`a === 'original-dog' || b === "original-rat" || c === \`giant-salamander\``, RIGS), 3);
  assert.equal(countRigLiterals('const original = "original-dogs"; // original-rat in a comment', RIGS), 0);
});

test('legacy counts are tolerated, may not grow and must be lowered when they shrink', t => {
  const {dir, paths} = sample(t, {'legacy.js': 'x("original-rat"); y("original-dog");\n'});
  assert.deepEqual(asDataProblems(paths, RIGS, {rigLiterals: {'legacy.js': 2}}, dir), []);
  assert.match(asDataProblems(paths, RIGS, {rigLiterals: {'legacy.js': 1}}, dir)[0], /limit 1/);
  assert.match(asDataProblems(paths, RIGS, {rigLiterals: {'legacy.js': 3}}, dir)[0], /Lower it to 2/);
});

test('the capability table itself may name rigs', t => {
  const {paths} = sample(t, {[AS_DATA_OWNER]: 'original-wolf "original-wolf"\n'});
  assert.deepEqual(asDataProblems(paths, RIGS), []);
});

test('rigCapability answers from the data table', () => {
  for (const rig of ['original-rat', 'original-dog', 'original-roach', 'giant-salamander', 'original-wolf', 'low-hover-drone'])
    assert.equal(rigCapability(rig, 'lowStrike'), true, rig);
  for (const rig of ['hollow-scavenger', 'hero', 'toString', undefined]) assert.equal(rigCapability(rig, 'lowStrike'), false, String(rig));
  assert.equal(rigCapability('original-rat', 'nonsense'), false);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(new URL('../src/data/creatures.json', import.meta.url))).rigCapabilities), RIGS);
});
