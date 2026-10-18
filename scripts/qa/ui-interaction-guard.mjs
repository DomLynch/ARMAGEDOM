// Shared Playwright guard: read-only prerequisite snapshots, one ordinary input,
// bounded acknowledgement, and unconditional bounded input-release attempts.
async function bounded(work,ms,phase){
 let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(phase+' wall limit exceeded')),Math.max(1,ms));})]);}finally{clearTimeout(timer);}
}
async function controlSnapshot(page,selector){
 return page.evaluate(selector=>{
  const q=globalThis.__qa,g=q?.game,viewport={width:innerWidth,height:innerHeight},menu=document.getElementById('menu'),settings=document.getElementById('menu-settings'),tools=document.getElementById('testing-tools');
  const snapshot={url:location.href,readyState:document.readyState,visibility:document.visibilityState,viewport,selector,menu:{open:menu?.open??null,settingsHidden:settings?.hidden??null,testingToolsOpen:tools?.open??null},game:g?{time:g.time,tick:g.tick,hp:g.player?.hp,finished:g.finished,weapon:g.player?.weapon}:null};
  if(!selector)return snapshot;
  const nodes=document.querySelectorAll(selector),el=nodes[0];snapshot.count=nodes.length;snapshot.exists=!!el;
  if(!el)return{...snapshot,visible:false,enabled:false,actionable:false,reason:'control missing'};
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);snapshot.rect={x:rect.x,y:rect.y,width:rect.width,height:rect.height};snapshot.style={display:style.display,visibility:style.visibility,opacity:style.opacity,pointerEvents:style.pointerEvents};
  let hiddenAncestor=false,closedDetails=false;
  for(let node=el;node;node=node.parentElement){const css=getComputedStyle(node);if(node.hidden||css.display==='none'||['hidden','collapse'].includes(css.visibility)||Number(css.opacity)===0)hiddenAncestor=true;if(node.tagName==='DETAILS'&&!node.open&&!node.querySelector(':scope > summary')?.contains(el))closedDetails=true;}
  const left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
  const onScreen=right>left&&bottom>top,visible=document.visibilityState==='visible'&&!hiddenAncestor&&!closedDetails&&rect.width>0&&rect.height>0&&el.getClientRects().length>0&&onScreen;
  const enabled=!el.matches(':disabled')&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('[inert]');
  const hit=onScreen?document.elementFromPoint((left+right)/2,(top+bottom)/2):null,uncovered=!!hit&&(hit===el||el.contains(hit));
  const actionable=nodes.length===1&&visible&&enabled&&uncovered&&style.pointerEvents!=='none';
  return{...snapshot,visible,enabled,actionable,blockedBy:uncovered?null:hit?{tag:hit.tagName,id:hit.id??null}:null,reason:nodes.length!==1?'control selector is ambiguous':!visible?'control hidden/offscreen or document not visible':!enabled?'control disabled/inert':!uncovered?'control covered or not hit-testable':style.pointerEvents==='none'?'control rejects pointer events':null};
 },selector);
}
async function releaseInputs(page,method,ms){
 const work=[bounded(()=>page.mouse.up({button:'left'}),ms,'mouse release')];
 if(method==='tap')work.push(bounded(async()=>{let session;try{session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}finally{if(session)await bounded(()=>session.detach(),ms,'touch session detach');}},ms,'touch release'));
 const results=await Promise.allSettled(work);return results.flatMap(result=>result.status==='rejected'?[String(result.reason?.message??result.reason)]:[]);
}
async function perform(page,{kind,selector=null,method='click',url,reload=false,ack,timeoutMs=3000,label=kind}){
 const deadline=Date.now()+timeoutMs,remaining=()=>Math.max(1,deadline-Date.now()),cleanupMs=Math.min(1000,timeoutMs);
 let phase='snapshot',classification='unknown',dispatched=false,before=null,after=null,result,error,releaseErrors=[];
 try{
  before=await bounded(()=>controlSnapshot(page,selector),remaining(),'prerequisite snapshot');
  if(kind==='control'){
   if(!before.actionable){phase='precondition';classification='driver/setup';throw Error(before.reason??'control not actionable');}
   phase='baseline-acknowledgement';
   if(await bounded(()=>page.evaluate(ack),remaining(),'initial acknowledgement')){phase='precondition';classification='driver/setup';throw Error('acknowledgement already true before input; cannot prove this action');}
  }
  phase='dispatch';dispatched=true;const options={timeout:remaining()};
  if(kind==='control'){if(method==='tap')await bounded(()=>page.tap(selector,{...options,strict:true}),remaining(),'tap dispatch');else await bounded(()=>page.click(selector,{...options,strict:true}),remaining(),'click dispatch');}
  else if(reload)await bounded(()=>page.reload({...options,waitUntil:'domcontentloaded'}),remaining(),'reload dispatch');
  else await bounded(()=>page.goto(url,{...options,waitUntil:'domcontentloaded'}),remaining(),'navigation dispatch');
  phase='acknowledgement';
  const handle=await bounded(()=>page.waitForFunction(ack,null,{timeout:remaining(),polling:50}),remaining(),'acknowledgement');
  let acknowledgement;try{acknowledgement=await bounded(()=>handle.jsonValue(),remaining(),'acknowledgement value');}finally{try{await bounded(()=>handle.dispose(),cleanupMs,'acknowledgement handle release');}catch{}}
  if(!acknowledgement)throw Error('actual acknowledgement predicate did not pass');
  after=await bounded(()=>controlSnapshot(page,selector),remaining(),'result snapshot');
  result={phase:'acknowledged',dispatched,label,kind,selector,method:kind==='control'?method:reload?'reload':'goto',before,after,acknowledgement};
 }catch(cause){
  error=Object.assign(new Error('QA_UI_'+phase.toUpperCase()+': '+cause.message,{cause}),{name:'QAInteractionError',phase,dispatched,classification,label,before});
  try{after=await bounded(()=>controlSnapshot(page,selector),cleanupMs,'failure snapshot');}catch(diagnosticError){error.diagnosticError=String(diagnosticError.message??diagnosticError);}error.after=after;
 }finally{
  releaseErrors=await releaseInputs(page,kind==='control'?method:null,cleanupMs);
 }
 if(error){error.releaseErrors=releaseErrors;throw error;}
 if(releaseErrors.length)throw Object.assign(Error('QA_UI_RELEASE: '+releaseErrors.join('; ')),{name:'QAInteractionError',phase:'release',dispatched,classification:'infrastructure',label,before,after,releaseErrors});
 return{...result,releaseErrors};
}
function invalid(message){return Object.assign(Error('QA_UI_CONFIG: '+message),{name:'QAInteractionError',phase:'config',dispatched:false,classification:'driver/setup'});}
export async function checkedControl(page,{selector,method='click',ack,timeoutMs=3000,label='control'}={}){
 if(typeof selector!=='string'||!selector||!['click','tap'].includes(method)||typeof ack!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw invalid('selector, ordinary click/tap, predicate and positive finite timeout required');
 return perform(page,{kind:'control',selector,method,ack,timeoutMs,label});
}
export async function checkedNavigation(page,{url,reload=false,ack,timeoutMs=3000,label='navigation'}={}){
 if(typeof ack!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0||typeof reload!=='boolean'||(reload?url!==undefined:typeof url!=='string'||!url))throw invalid('one URL or reload:true, predicate and finite timeout required');
 if(!reload){let target;try{target=new URL(url);}catch{throw invalid('absolute navigation URL required');}if(!['http:','https:'].includes(target.protocol))throw invalid('HTTP(S) navigation URL required');}
 return perform(page,{kind:'navigation',url,reload,ack,timeoutMs,label});
}
