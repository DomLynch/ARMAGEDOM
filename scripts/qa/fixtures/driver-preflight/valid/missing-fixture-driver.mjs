import fs from 'node:fs';
fs.readFileSync(new URL('./fixtures/not-staged.json',import.meta.url),'utf8');
