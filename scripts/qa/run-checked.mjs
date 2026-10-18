// Supported guarded UI entrypoint against an already exported package.
// Run from the frozen stage root: node scripts/qa/run-checked.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {navigateGame,enterGame,openMenu,retryEncounter,reloadGame,rejectHiddenRetry} from './run-controls.mjs';
const config=JSON.parse(fs.readFileSync('qa-checked-config.json','utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
for(const key of ['source','fingerprint','packageSha256'])assert(config.expect?.[key],'missing exact '+key);
const driverFiles={
 'scripts/qa/run-checked.mjs':sha(fs.readFileSync('scripts/qa/run-checked.mjs')),
 'scripts/qa/run-controls.mjs':sha(fs.readFileSync('scripts/qa/run-controls.mjs')),
 'scripts/qa/ui-interaction-guard.mjs':sha(fs.readFileSync('scripts/qa/ui-interaction-guard.mjs'))
};
assert.deepEqual(driverFiles,config.driverFiles,'runtime driver/helper identity mismatch');
const response=await fetch(new URL('release.json',config.baseURL));
assert(response.ok,'served release manifest unavailable');
assert.equal(sha(Buffer.from(await response.arrayBuffer())),config.expect.packageSha256,'served game identity mismatch');
fs.mkdirSync('results',{recursive:true});
const report={status:'RUNNING',identity:config.expect,configSHA256:sha(fs.readFileSync('qa-checked-config.json')),driverFiles,observations:[],errors:[],scope:'Checked actual UI navigation and Retry visibility/acknowledgement only. No combat, storage, movement, phone, or full legacy profile acceptance.'};
const save=()=>fs.writeFileSync('results/checked-ui.json',JSON.stringify(report,null,2)+'\n');
const executablePath=process.env.QA_CHROMIUM_EXECUTABLE;
assert(executablePath&&fs.existsSync(executablePath)&&fs.statSync(executablePath).isFile(),'Set QA_CHROMIUM_EXECUTABLE to the verified non-Snap Chrome binary; no default browser fallback');
console.log('QA_BROWSER_EXECUTABLE',executablePath);
const browser=await chromium.launch({executablePath,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
report.browser={executablePath,version:browser.version()};console.log('QA_BROWSER_VERSION',report.browser.version);
try{
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 page.on('pageerror',error=>report.errors.push(error.message));
 await navigateGame(page,new URL('?touch=1',config.baseURL).href);
 report.observations.push({stage:'enter',result:await enterGame(page,{touch:true})});save();
 await openMenu(page,{touch:true});
 // Actual default menu keeps Retry inside hidden Settings and closed details.
 report.observations.push({stage:'hidden-retry-rejected',...await rejectHiddenRetry(page)});save();
 report.observations.push({stage:'settings-details-retry',result:await retryEncounter(page,{touch:true})});save();
 await reloadGame(page);await enterGame(page,{touch:true});
 await openMenu(page,{touch:true});
 report.observations.push({stage:'cold-settings-details-retry',result:await retryEncounter(page,{touch:true})});save();
 assert.deepEqual(report.errors,[],'browser errors');report.status='PASS_CHECKED_UI';
}catch(error){report.status='FAIL_CHECKED_UI';report.failure={message:error.message,stack:error.stack};throw error;}
finally{save();await browser.close();}
