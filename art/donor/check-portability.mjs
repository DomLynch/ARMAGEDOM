// Run the real motion tests from a checkout-shaped fixture with no sibling intake.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'armagedom-motion-'));
const checkout=path.join(temporary,'standalone');
try{
 for(const entry of ['Web/package.json','Web/src/donor-motion.js','Web/tests/donor-motion.test.js','Web/tests/fixtures/donor-knife-contacts.json','Web/public/assets/donor','art/donor/probe.mjs']){
  const destination=path.join(checkout,entry);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.cpSync(path.join(root,entry),destination,{recursive:true});
 }
 fs.symlinkSync(path.join(root,'Web/node_modules'),path.join(checkout,'Web/node_modules'),'dir');
 if(fs.existsSync(path.join(temporary,'character')))throw Error('Fixture accidentally includes sibling intake');
 const result=spawnSync(process.execPath,['--test','Web/tests/donor-motion.test.js'],{cwd:checkout,encoding:'utf8'});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);
 if(result.status!==0)throw Error('Standalone motion tests failed');
 if(fs.existsSync(path.join(checkout,'art/donor/receipts')))throw Error('Import created QA output directory');
 console.log('PASS: 17 real motion tests, no sibling intake and no import-created receipts');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
