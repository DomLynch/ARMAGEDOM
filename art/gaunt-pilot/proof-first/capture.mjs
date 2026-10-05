import {chromium} from '/opt/frankendom-shadow/repo/node_modules/playwright/index.mjs';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852},recordVideo:{dir:'results/video',size:{width:393,height:852}}}),report={errors:[],samples:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:18919/review.html');await page.waitForFunction(()=>window.__proof);
 for(const [label,clip,phase,w,h,face,size]of [['portrait-idle','HollowIdle',0,393,852,'face-original',1],['portrait-walk','HollowWalk',.35,393,852,'face-original',1],['landscape-walk','HollowWalk',.72,852,393,'face-original',1],['attack','Riposte',.45,393,852,'face-original',1],['death','Death',.5,393,852,'face-original',1],['narrow-small','HollowWalk',.35,393,852,'face-narrow-messy-light',.85],['broad-large','HollowWalk',.35,393,852,'face-broad-crest-deep',1.15]]){
  await page.setViewportSize({width:w,height:h});const sample=await page.evaluate(a=>__proof.sample(...a),[clip,phase,w,h,face,size]);report.samples.push({label,...sample});await page.screenshot({path:`results/${label}.png`});
  if(sample.nativeJointMatrixError!==undefined)assert.ok(sample.nativeJointMatrixError<1e-6);
  for(let foot=0;foot<2;foot++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(sample.feet[0][foot][axis]-sample.feet[1][foot][axis])<1e-6);
 }
 await page.setViewportSize({width:393,height:852});report.movie=await page.evaluate(()=>__proof.movie());
 report.cleanup1=await page.evaluate(()=>__proof.cleanup());await page.evaluate(()=>__proof.sample('HollowWalk',.3));report.cleanup2=await page.evaluate(()=>__proof.cleanup());
 assert.deepEqual(report.cleanup1,report.cleanup2);assert.equal(report.cleanup1.cache.users,0);assert.deepEqual(report.errors,[]);
 console.log('GAUNT_SOURCE_RIG_FEET_NATIVE_ACTION_CACHE_CLEANUP_PASS');
}finally{writeFileSync('results/proof.json',JSON.stringify(report,null,2));await page.close();await browser.close();}
