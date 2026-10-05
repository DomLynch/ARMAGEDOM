import {chromium} from '/opt/frankendom-shadow/repo/node_modules/playwright/index.mjs';import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852},recordVideo:{dir:'results',size:{width:393,height:852}}}),report={errors:[],frames:[]};page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:18917/proof.html');await page.waitForFunction(()=>window.__proof);report.initial=await page.evaluate(()=>__proof.check());assert.ok(report.initial.appearance&&report.initial.finite&&report.initial.sourceUnchanged&&report.initial.independent);
 const initialFrame=await page.evaluate(()=>__proof.frame(0));assert.ok(initialFrame.rows[2].launchError<1e-5);report.launch=initialFrame;
 await page.evaluate(()=>__proof.play());
 await page.waitForFunction(()=>window.__played,null,{timeout:30000});
 const played=await page.evaluate(()=>__played);report.frames=played.samples;report.clock={elapsed:played.elapsed,frames:played.frames};
 assert.ok(played.elapsed>=6.55&&played.elapsed<8);
 for(const [label,age]of [['.15',.15],['.5',.5],['1.5',1.5]]){const sample=await page.evaluate(age=>__proof.frame(age),age);report.frames.push(sample);await page.screenshot({path:`results/portrait-${label}.png`});}
 const final=played.samples.at(-1);assert.equal(final.rows[1].recipe.id,'pistol-directional');assert.equal(final.rows[2].recipe.id,'decapitation');assert.equal(final.rows[2].stats.lethalVertexCopies,0);assert.equal(final.rows[2].stats.expired,true);
 // New page for landscape starts from fresh prepared state, preserving this lifetime proof.
 report.disposal=await page.evaluate(()=>__proof.dispose());assert.equal(report.disposal.sourceUnchanged,true);assert.deepEqual(report.errors,[]);
 const landscape=await browser.newPage({viewport:{width:852,height:393}});await landscape.goto('http://127.0.0.1:18917/proof.html');await landscape.waitForFunction(()=>window.__proof);report.landscape=await landscape.evaluate(()=>__proof.frame(.5,852,393));await landscape.screenshot({path:'results/landscape-.5.png'});await landscape.close();
 console.log('FINISHER_NATIVE_PISTOL_HEAD_APPEARANCE_SCALE_LIFETIME_DISPOSAL_PASS');
}finally{writeFileSync('results/proof.json',JSON.stringify(report,null,2));await page.close();const video=await page.video()?.path();writeFileSync('results/video-path.txt',video??'');await browser.close();}
