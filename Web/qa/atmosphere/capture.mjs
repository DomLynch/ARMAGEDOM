import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
const out='qa/atmosphere/results';await fs.mkdir(out,{recursive:true});
const server=spawn('./node_modules/.bin/vite',['--host','127.0.0.1','--port','8893'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true,executablePath:process.env.ATMOSPHERE_CHROMIUM||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  for(let i=0;i<50;i++){try{await page.goto('http://127.0.0.1:8893/qa/atmosphere/review.html');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  await page.waitForFunction(()=>window.ready,{timeout:30000});
  const receipt={scope:'Registered painting review, not a gameplay/physical phone test',errors,views:[],profile:{}};
  for(const [name,width,height,x,y] of [['spawn-landscape',1280,720,.5,.80753],['bus-landscape',1280,720,.43,.43],['tower-landscape',1280,720,.75,.54],['spawn-portrait',390,844,.5,.80753],['bus-portrait',390,844,.43,.43]]){
    await page.setViewportSize({width,height});await page.evaluate(([x,y])=>review.move(x,y),[x,y]);
    for(const enabled of [false,true]){const stats=await page.evaluate(enabled=>review.frame(enabled),enabled);await page.screenshot({path:`${out}/${name}-${enabled?'enabled':'baseline'}.png`});receipt.views.push({name,enabled,stats});}
  }
  await page.setViewportSize({width:1280,height:720});
  receipt.profile.baseline=await page.evaluate(()=>review.profile(false));receipt.profile.enabled=await page.evaluate(()=>review.profile(true));
  await fs.writeFile(`${out}/receipt.json`,JSON.stringify(receipt,null,2));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();server.kill();}
