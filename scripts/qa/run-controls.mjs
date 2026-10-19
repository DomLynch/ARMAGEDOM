import assert from 'node:assert/strict';
// Maintained runner consumers. The shared guard owns visibility/actionability,
// dispatch deadlines and acknowledgement; these functions own the real UI route.
import {checkedControl,checkedNavigation} from './ui-interaction-guard.mjs';

export async function enterGame(page,{touch=false}={}) {
 return checkedControl(page,{selector:'#enter',method:touch?'tap':'click',label:'enter-game',timeoutMs:90000,
  ack:()=>document.getElementById('entry')?.hidden===true});
}
export async function openMenu(page,{touch=false}={}) {
 if(await page.evaluate(()=>document.getElementById('menu')?.open===true))return;
 return checkedControl(page,{selector:'#menu-button',method:touch?'tap':'click',label:'open-menu',timeoutMs:15000,
  ack:()=>document.getElementById('menu')?.open===true});
}
export async function retryEncounter(page,{touch=false}={}) {
 await openMenu(page,{touch});
 if(await page.evaluate(()=>document.getElementById('menu-settings')?.hidden!==false))
  await checkedControl(page,{selector:'#menu-settings-button',method:touch?'tap':'click',label:'open-settings',timeoutMs:3000,
   ack:()=>document.getElementById('menu-settings')?.hidden===false});
 if(await page.evaluate(()=>document.getElementById('testing-tools')?.open!==true))
  await checkedControl(page,{selector:'#testing-tools > summary',method:touch?'tap':'click',label:'open-retry-details',timeoutMs:3000,
   ack:()=>document.getElementById('testing-tools')?.open===true});
 // Retry prepares area models before its handler yields; keep this single action bounded.
 return checkedControl(page,{selector:'#retry',method:touch?'tap':'click',label:'retry-encounter',timeoutMs:15000,
  ack:()=>document.getElementById('menu')?.open===false});
}
export async function reloadGame(page) {
 return checkedNavigation(page,{reload:true,label:'cold-reload',timeoutMs:90000,
  ack:()=>document.getElementById('enter')!==null&&!document.getElementById('entry')?.hidden});
}
export async function navigateGame(page,url) {
 return checkedNavigation(page,{url,label:'load-game',timeoutMs:90000,
  ack:()=>document.getElementById('enter')!==null&&!document.getElementById('entry')?.hidden});
}
export async function holsterViaControl(page) {
 return checkedControl(page,{selector:'#heavy',method:'tap',label:'holster-weapon',timeoutMs:3000,
  ack:()=>globalThis.__qa?.game?.player?.weapon==='knife'});
}

export async function rejectHiddenRetry(page) {
 const started=Date.now();let rejection;
 try{await checkedControl(page,{selector:'#retry',method:'click',label:'negative-hidden-retry',timeoutMs:1000,
  ack:()=>document.getElementById('menu')?.open===false});}
 catch(error){rejection={message:error.message,phase:error.phase,dispatched:error.dispatched};}
 const elapsedMs=Date.now()-started;
 assert(rejection,'Hidden Retry must reject before dispatch');
 assert.equal(rejection.phase,'precondition','Only prerequisite rejection proves hidden control protection');
 assert.equal(rejection.dispatched,false,'Hidden Retry must not dispatch');
 assert(elapsedMs<2000,'Hidden control must reject promptly, without a long auto-wait');
 assert.equal(await page.evaluate(()=>document.getElementById('menu')?.open),true,'Rejected Retry must leave menu open');
 return{rejection,elapsedMs};
}
