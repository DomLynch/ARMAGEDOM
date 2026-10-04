import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const out='qa/atmosphere/video';await fs.mkdir(`${out}/frames`,{recursive:true});
const server=spawn('./node_modules/.bin/vite',['--host','127.0.0.1','--port','8894'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true,executablePath:process.env.ATMOSPHERE_CHROMIUM,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:676}}),errors=[];
await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  for(let i=0;i<50;i++){try{await page.goto('http://127.0.0.1:8894/qa/atmosphere/review.html');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>{const label=document.createElement('div');label.id='label';label.style='position:fixed;bottom:16px;left:16px;background:#171713dc;color:#eee4cb;padding:10px 14px;font:16px sans-serif';document.body.append(label);});
  const fps=16;let frame=0;
  for(const [label,seconds,enabled,x,y] of [['Original painted scene',1,false,.43,.43],['Burnt bus: slight residual smoke only',2,true,.43,.43],['Big Ben: animated breach fire',2,true,.70,.40],['Existing riverside fire: animated flames and smoke',3,true,.77,.65]]){
    await page.evaluate(([x,y,label])=>{review.move(x,y);document.querySelector('#label').textContent=label;},[x,y,label]);
    for(let i=0;i<seconds*fps;i++){
      await page.evaluate(([enabled,time])=>review.frame(enabled,time),[enabled,i/fps]);
      await page.screenshot({path:`${out}/frames/${String(frame++).padStart(4,'0')}.png`});
    }
  }
  if(errors.length)throw Error(errors.join('\n'));
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',`${out}/frames/%04d.png`,'-c:v','libx264','-threads','5','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/westminster-atmosphere.mp4`]);
  await fs.writeFile(`${out}/receipt.json`,JSON.stringify({scope:'8-second deterministic rendered candidate preview, 16fps; not live-game performance',frames:frame,fps,errors},null,2));
}finally{await browser.close();server.kill();}
