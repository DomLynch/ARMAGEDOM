// Read-only inventory; generated data, tests and assets are not runtime LOC.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? files(child) : entry.isFile() ? [child] : [];
  }).sort();
}
const source = files(resolve(root, 'src'));
const runtime = source.filter(path => extname(path) === '.js');
const generated = runtime.filter(path => path.endsWith('/donor/knife-paths.js'));
function count(paths) {
  return paths.reduce((total, path) => {
    const text = readFileSync(path, 'utf8');
    const lines = text.replace(/\n$/, '').split('\n');
    return { files: total.files + 1, lines: total.lines + lines.length,
      nonblank: total.nonblank + lines.filter(line => line.trim()).length,
      bytes: total.bytes + Buffer.byteLength(text) };
  }, { files: 0, lines: 0, nonblank: 0, bytes: 0 });
}
const report = {
  method: 'Physical lines including comments; nonblank reported separately. Not a complexity score.',
  runtimeJS: count(runtime),
  authoredJS: count(runtime.filter(path => !generated.includes(path))),
  generatedMotionData: count(generated),
  css: count(source.filter(path => extname(path) === '.css')),
  html: count([resolve(root, 'index.html')]),
  testsJS: count(files(resolve(root, 'tests')).filter(path => extname(path) === '.js')),
  toolingJS: count(files(resolve(root, 'scripts')).filter(path => extname(path) === '.mjs')),
  runtimeDependencies: JSON.parse(readFileSync(resolve(root, 'package.json'))).dependencies,
  modules: runtime.map(path => ({ path: relative(root, path), ...count([path]) })),
};
try {
  const built = files(resolve(root, 'dist'));
  report.build = { files: built.length, bytes: built.reduce((n, path) => n + statSync(path).size, 0) };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log(JSON.stringify(report, null, 2));
