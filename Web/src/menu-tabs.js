// View navigation only. Session/HUD retain dialog and pause ownership.
export function createMenuTabs(el,{canSelect=()=>true}={}){
 const ids=['gear','journal','map'],pages=[...ids,'settings','locker'],listeners=[];let current='gear';
 const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
 function select(id,{focus=false}={}){
  if(!pages.includes(id)||!canSelect())return false;current=id;
  for(const page of pages)el('menu-'+page).hidden=page!==id;
  for(const page of ids){const tab=el('menu-tab-'+page),selected=page===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected||id==='settings'&&page==='gear'?0:-1;}
  el('menu-settings-button').setAttribute('aria-pressed',String(id==='settings'));el('menu-content').scrollTop=0;
  if(focus&&ids.includes(id))el('menu-tab-'+id).focus();return true;
 }
 for(const[id,index]of ids.map((id,index)=>[id,index])){const tab=el('menu-tab-'+id);listen(tab,'click',()=>select(id));listen(tab,'keydown',event=>{const next=event.key==='ArrowRight'?ids[(index+1)%ids.length]:event.key==='ArrowLeft'?ids[(index+ids.length-1)%ids.length]:event.key==='Home'?ids[0]:event.key==='End'?ids.at(-1):null;if(next){event.preventDefault();select(next,{focus:true});}});}
 listen(el('menu-settings-button'),'click',()=>select('settings'));select('gear');
 return{select,get current(){return current;},dispose(){for(const remove of listeners.splice(0))remove();}};
}
