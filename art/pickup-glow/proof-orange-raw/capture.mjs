import {chromium} from '/opt/frankendom-shadow/repo/node_modules/playwright/index.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),report={errors:[],samples:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:18915/review.html');await page.waitForFunction(()=>window.__proof);
 for(const [name,width,height,close] of [['portrait',393,852,false],['landscape',852,393,false],['detail',1000,500,true]]){
  await page.setViewportSize({width,height});
  for(const glow of [false,true]){const sample=await page.evaluate(args=>__proof.sample(...args),[glow,width,height,false,close]);report.samples.push({name,...sample});await page.screenshot({path:`results/${name}-${glow?'glow':'edges'}.png`});}
 }
 const blocked=await page.evaluate(()=>__proof.sample(true,1000,500,true,true));report.blocked=blocked;assert.equal(blocked.amber,0);await page.screenshot({path:'results/occluded.png'});
 report.afterDispose=await page.evaluate(()=>__proof.dispose());
 await page.evaluate(()=>__proof.sample(true,1000,500,false,true));report.secondDispose=await page.evaluate(()=>__proof.dispose());assert.deepEqual(report.afterDispose,report.secondDispose);
 assert.deepEqual(report.errors,[]);
 for(const name of ['portrait','landscape','detail']){const [before,after]=report.samples.filter(s=>s.name===name);assert.equal(after.triangles,before.triangles);assert.ok(after.calls<=before.calls);assert.ok(after.amber>before.amber);assert.equal(after.ownedMaterials,9);}
 console.log('PICKUP_GLOW_SHAPES_DEPTH_COST_CLEANUP_PASS');
}finally{writeFileSync('results/review.json',JSON.stringify(report,null,2));await browser.close();}
