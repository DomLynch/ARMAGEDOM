const clampStick=(v,r)=>{const n=Math.hypot(v.x,v.y);return n>r?{x:v.x/n,y:v.y/n}:{x:v.x/r,y:v.y/r};};
export class InputState{
 constructor(){this.pointers=new Map();this.keys=new Set();this.clear();}
 down(id,kind,at){if(this.pointers.has(id))return;this.pointers.set(id,{kind,start:{...at},at:{...at}});if(kind==='guard'){if(!this.guardHeld())this.guardPressed=true;else if([...this.pointers.values()].filter(p=>p.kind==='guard').length===1)this.guardPressed=true;}else if(kind==='dodge')this.dodge=true;else if(kind!=='move')this.actions.push(kind);}
 guardHeld(){return [...this.pointers.values()].some(p=>p.kind==='guard');}
 move(id,at){const p=this.pointers.get(id);if(!p)return;p.at={...at};const d={x:at.x-p.start.x,y:at.y-p.start.y};if(p.kind==='move')this.stick=clampStick(d,46);else if(Math.hypot(d.x,d.y)>12)this.aim=clampStick(d,1);}
 up(id){const p=this.pointers.get(id);if(p?.kind==='move')this.stick={x:0,y:0};this.pointers.delete(id);}
 clear(){this.pointers.clear();this.keys.clear();this.stick={x:0,y:0};this.aim=null;this.actions=[];this.guardPressed=false;this.dodge=false;}
 take(){const held=[...new Set([...this.pointers.values()].map(p=>p.kind).filter(k=>k!=='move'&&k!=='guard'&&k!=='dodge'))],k=this.keys;
 const move={x:this.stick.x+(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0),y:this.stick.y+(k.has('KeyS')?1:0)-(k.has('KeyW')?1:0)},m=Math.hypot(move.x,move.y);if(m>1){move.x/=m;move.y/=m;}
 const value={move,aim:this.aim?{...this.aim}:null,actions:this.actions.splice(0),held,guard:this.guardHeld(),guardPressed:this.guardPressed,dodge:this.dodge};this.guardPressed=false;this.dodge=false;return value;}
}
export function attachInput({canvas,onMenu,onRetry,isPaused,onInteraction=()=>{}}){
 const state=new InputState(),map={KeyQ:'heavy',KeyE:'special',Digit1:'special',Space:'dodge',KeyF:'guard'};let mouse=null,touch=false;
 const bind=(el,kind)=>{el.addEventListener('pointerdown',e=>{if(isPaused())return;onInteraction();e.preventDefault();touch=true;document.body.classList.add('touch');el.setPointerCapture(e.pointerId);el.classList.add('pressed');state.down(e.pointerId,kind,{x:e.clientX,y:e.clientY});});
 el.addEventListener('pointermove',e=>{state.move(e.pointerId,{x:e.clientX,y:e.clientY});if(kind==='move'){const x=state.stick.x*36,y=state.stick.y*36;el.style.setProperty('--knob-x',`${x}px`);el.style.setProperty('--knob-y',`${y}px`);}else if(state.aim)el.style.setProperty('--aim-angle',`${Math.atan2(state.aim.y,state.aim.x)}rad`);});
 const release=e=>{state.up(e.pointerId);if(![...state.pointers.values()].some(p=>p.kind===kind))el.classList.remove('pressed');if(kind==='move'){el.style.setProperty('--knob-x','0px');el.style.setProperty('--knob-y','0px');}};
 el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);};
 bind(document.querySelector('#move'),'move');for(const el of document.querySelectorAll('[data-action]'))bind(el,el.dataset.action);
 canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){touch=false;mouse={x:e.clientX,y:e.clientY};}});
 canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||isPaused())return;onInteraction();e.preventDefault();canvas.setPointerCapture(e.pointerId);mouse={x:e.clientX,y:e.clientY};state.down(e.pointerId,e.button===2?'stab':'slash',mouse);});
 canvas.addEventListener('pointerup',e=>state.up(e.pointerId));canvas.addEventListener('pointercancel',e=>state.up(e.pointerId));canvas.addEventListener('lostpointercapture',e=>state.up(e.pointerId));canvas.addEventListener('contextmenu',e=>e.preventDefault());
 window.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();onMenu();return;}if(e.code==='KeyR'&&!e.repeat){onRetry();return;}if(isPaused())return;onInteraction();
 if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();state.keys.add(e.code);}if(map[e.code]&&!e.repeat){e.preventDefault();state.down(e.code,map[e.code],{x:0,y:0});}});
 window.addEventListener('keyup',e=>{state.keys.delete(e.code);state.up(e.code);});
 function clear(){state.clear();mouse=null;for(const el of document.querySelectorAll('.pressed'))el.classList.remove('pressed');const el=document.querySelector('#move');el.style.setProperty('--knob-x','0px');el.style.setProperty('--knob-y','0px');}
 window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
 return {state,clear,take:()=>({...state.take(),mouse:touch?null:mouse})};
}
