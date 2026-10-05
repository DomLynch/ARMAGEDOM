import {chromium} from '/opt/frankendom-shadow/repo/node_modules/playwright/index.mjs';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),report={errors:[],samples:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
try{await page.goto('http://127.0.0.1:18918/review.html');await page.waitForFunction(()=>window.__proof);
 for(const [name,width,height]of [['portrait',393,852],['landscape',852,393]]){await page.setViewportSize({width,height});for(const mode of ['halo']){const sample=await page.evaluate(args=>__proof.sample(...args),[mode,width,height,true,false]);report.samples.push({name,...sample});await page.screenshot({path:`results/${name}-${mode}.png`});}}
 report.clear=await page.evaluate(()=>__proof.sample('halo',393,852,false));await page.setViewportSize({width:393,height:852});await page.screenshot({path:'results/portrait-halo-clear.png'});
 report.blocked=await page.evaluate(()=>__proof.sample('halo',393,852,true,true));await page.screenshot({path:'results/occluded.png'});assert.equal(report.blocked.orange,0);
 report.disposed1=await page.evaluate(()=>__proof.dispose());await page.evaluate(()=>__proof.sample('halo',393,852,true,false));report.disposed2=await page.evaluate(()=>__proof.dispose());assert.deepEqual(report.disposed1,report.disposed2);assert.deepEqual(report.errors,[]);
 for(const sample of report.samples){assert.equal(sample.calls,41);assert.equal(sample.triangles,47606);assert.equal(sample.haloInstances,15);}
 console.log('HALO_SURFACE_SHELL_CORPSE_DEPTH_COST_CLEANUP_PASS');
}finally{writeFileSync('results/proof.json',JSON.stringify(report,null,2));await browser.close();}
