import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {densityProblems, MAX_LINE_LENGTH, MAX_FILE_BYTES} from '../../scripts/verify_web.mjs';

function sample(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'density-'));
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
const longLine = 'x'.repeat(MAX_LINE_LENGTH + 1);

test('a source line over the limit fails the guard and names the line', t => {
  const {paths: [path]} = sample(t, {'dense.js': 'const a = 1;\n' + longLine + '\n'});
  assert.deepEqual(densityProblems([path]), [`${path}:2: 1 line(s) over ${MAX_LINE_LENGTH} characters, limit 0`]);
});

test('lines at the limit and short files pass', t => {
  const {paths} = sample(t, {'ok.js': 'x'.repeat(MAX_LINE_LENGTH) + '\n', 'short.js': 'export const a = 1;\n'});
  assert.deepEqual(densityProblems(paths), []);
});

test('a file over the byte cap fails even when every line is short', t => {
  const {paths: [path]} = sample(t, {'big.js': 'const a = 1;\n'.repeat(Math.ceil(MAX_FILE_BYTES / 13) + 1)});
  assert.match(densityProblems([path])[0], new RegExp(`bytes, limit ${MAX_FILE_BYTES}$`));
});

test('legacy baseline entries tolerate their recorded debt but never more', t => {
  const {dir, paths: [path]} = sample(t, {'legacy.js': longLine + '\n' + longLine + '\n'});
  const baseline = {longLines: {'legacy.js': 2}};
  assert.deepEqual(densityProblems([path], baseline, dir), []);
  assert.equal(densityProblems([path], {longLines: {'legacy.js': 1}}, dir).length, 1);
  assert.equal(densityProblems([path], {}, dir).length, 1);
});
