import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const pkg = read('Web/package.json');
const lock = read('Web/package-lock.json');
const pin = pkg.devDependencies.vite;
assert.equal(pin, '6.4.4', 'Vite must use the reviewed GHSA-rq7h-c2jc-7f22 patch');
assert.equal(lock.packages[''].devDependencies.vite, pin, 'Root lock pin differs');
assert.equal(lock.packages['node_modules/vite'].version, pin, 'Resolved Vite differs');
assert.equal(pkg.scripts.dev, 'vite --host 127.0.0.1 --port 8890', 'Dev server must remain loopback-only');
console.log('PATCHED_VITE_LOCK_AND_LOOPBACK_DEV_PASS');
