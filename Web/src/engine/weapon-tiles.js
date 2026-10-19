import{ownsEmberReward}from'./boss-equipment-data.js';
import{weaponTileIcon}from'./weapon-tile-icons.js';
import{lockerStored}from'./locker-core.js';
import{MELEE_VARIANTS}from'../melee-equipment.js';
// Presentation only: every selection still uses its existing Gear control/writer.
export function carriedWeaponTiles(g){
 if(!g?.world)return[];const rows=[],boss=g.bossEquipment??{},selected=Object.keys(boss).find(id=>boss[id]?.selected),emberOwned=ownsEmberReward(g),flameId=emberOwned?'ember-flamethrower-v1':'flamethrower-area8-v1';
 const active=g.flame?.equipped?flameId:selected?g.world.bossEquipmentData?.[selected]?.itemId:g.rifle?.selected?g.world.rifleData?.itemId:g.pistol?.equipped?g.expedition?.selectedPistolVariant??'westminster-start-pistol-v1':g.uniqueReward?.selectedMeleeVariant??'knife';
 const add=(id,name,control,owned,ammo='Melee')=>{if(owned&&!lockerStored(g,id))rows.push({id,name,control,active:id===active,ammo});};
 for(const id of ['knife',g.world.uniqueRewardData?.itemId].filter(Boolean)){const p=MELEE_VARIANTS[id];if(p)add(id,p.name,'melee-variant-'+id,id==='knife'||g.uniqueReward?.status==='owned');}
 for(const[id,p]of Object.entries(g.world.expeditionData?.variants??{}))add(id,p.name,'variant-'+id,g.pistol?.collected&&(id==='westminster-start-pistol-v1'||g.expedition?.status==='claimed'),`${g.pistol?.magazine??0}/6 · ${g.pistol?.reserve??0}`);
 const rifle=g.world.rifleData; if(rifle)add(rifle.itemId,rifle.name,'rifle-equip',g.rifle?.status==='owned',`${g.rifle?.magazine??0}/${rifle.rules.capacity} · ${g.rifle?.reserve??0}`);
 add(flameId,'Ember Projector',emberOwned?'boss-equip-emberProjector':'flame-equip',g.flameFuel?.collected||emberOwned,`${Math.ceil((g.flameFuel?.fuelUnits??0)/(g.world.flameData?.capacity??1000)*100)}% fuel`);
 for(const[field,p]of Object.entries(g.world.bossEquipmentData??{})){if(p.family==='flamethrowers')continue;const state=boss[field],ammo=p.family==='flamethrowers'?`${Math.ceil((g.flameFuel?.fuelUnits??0)/1000*100)}% fuel`:p.family==='blades'?'Melee':p.family==='pistols'?`${g.pistol?.magazine??0}/6 · ${g.pistol?.reserve??0}`:field==='grenade'?`${state?.magazine??0} charges`:`${state?.magazine??0}/${p.rules.capacity} · ${state?.reserve??0}`;add(p.itemId,p.name,'boss-equip-'+field,state?.status==='owned',ammo);}
 return rows;
}
// A cancelled or dragged gesture cannot become an equip click.
export function tileGesture(){let start=null,blocked=false;return{down(e){if(start)return;start={id:e.pointerId,x:e.clientX,y:e.clientY};blocked=false;},move(e){if(start?.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)blocked=true;},end(e){if(start?.id===e.pointerId)start=null;},cancel(){start=null;blocked=true;},accept(){const yes=!blocked;blocked=false;return yes;}};}
export function createWeaponTiles(s,select){
 const root=document.getElementById('weapon-tiles'),track=document.getElementById('weapon-tiles-track'),current=document.getElementById('weapon-tiles-current'),position=document.getElementById('weapon-tiles-position'),prev=document.getElementById('weapon-tiles-prev'),nextButton=document.getElementById('weapon-tiles-next');if(!root||!track||!current||!position||!prev||!nextButton)return{update(){},dispose(){}};
 const gesture=tileGesture(),listeners=[],buttons=new Map();let order='',selecting=false,disposed=false;
 const listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);listeners.push(()=>node.removeEventListener(type,fn,options));};
 listen(track,'pointerdown',e=>gesture.down(e));listen(track,'pointermove',e=>gesture.move(e));listen(track,'pointerup',e=>gesture.end(e));listen(track,'pointercancel',()=>gesture.cancel());
 listen(track,'click',async e=>{if(!gesture.accept()){e.preventDefault();return;}const button=e.target.closest?.('[data-weapon-id]');if(!button||button.disabled||selecting||s.paused||!s.loaded||s.traveling||s.contextLost)return;const row=carriedWeaponTiles(s.game).find(r=>r.id===button.dataset.weaponId);if(!row||row.active)return;const control=document.getElementById(row.control);if(!control||control.disabled)return;selecting=true;try{await select(row);}finally{selecting=false;update();}});
 function hint(){const count=buttons.size,last=Math.max(0,Math.ceil(count/2)-1),page=Math.max(0,Math.min(last,Math.round(track.scrollLeft/110))),extra=count>2;root.dataset.page=String(page);root.dataset.pages=String(last+1);position.textContent=`${page+1} / ${last+1}`;for(const [button,disabled]of [[prev,page===0],[nextButton,page===last]]){button.hidden=!extra;button.disabled=disabled;button.style.visibility=disabled?'hidden':'visible';}}
 function browse(delta){if(root.hidden||s.paused||s.traveling||s.contextLost||!s.loaded)return;const last=Math.max(0,Math.ceil(buttons.size/2)-1),page=Math.round(track.scrollLeft/110),target=Math.max(0,Math.min(last,page+delta));track.scrollTo({left:target*110,behavior:'smooth'});}
 listen(prev,'click',()=>browse(-1));listen(nextButton,'click',()=>browse(1));for(const button of [prev,nextButton])listen(button,'keydown',event=>event.stopPropagation());
 listen(track,'scroll',hint,{passive:true});
 function update(){if(disposed)return;const g=s.game;root.hidden=!g||!s.loaded||s.paused||s.traveling||s.contextLost||g.finished||g.runSaveInvalid||g.player.hp<=0;if(root.hidden)return;const rows=carriedWeaponTiles(g),next=rows.map(r=>r.id).join('|');if(next!==order){const oldPage=Math.round(track.scrollLeft/110);track.replaceChildren();buttons.clear();let page;for(const [index,row]of rows.entries()){if(index%2===0){page=document.createElement('div');page.className='weapon-page';track.append(page);}const b=document.createElement('button');b.type='button';b.dataset.weaponId=row.id;const name=document.createElement('span'),ammo=document.createElement('small');const icon=weaponTileIcon(row.id);name.textContent=icon.caption;b.style.setProperty('--weapon-icon',icon.mask);b.dataset.iconFamily=icon.family;b.append(name,ammo);page.append(b);buttons.set(row.id,b);}track.scrollLeft=Math.min(oldPage,Math.max(0,Math.ceil(rows.length/2)-1))*110;order=next;}
 for(const row of rows){const b=buttons.get(row.id),control=document.getElementById(row.control);b.disabled=!row.active&&(selecting||!control||control.disabled);b.setAttribute('aria-pressed',String(row.active));b.setAttribute('aria-label',`${row.name} · ${row.ammo}${row.active?' · equipped':' · tap to equip'}`);const ammo=b.querySelector('small');ammo.hidden=row.ammo==='Melee';ammo.textContent=ammo.hidden?'':row.ammo.replace('% fuel','%');}
 const active=rows.find(r=>r.active);current.textContent=active?`${active.name} · ${active.ammo}`:'Weapon selection';hint();
 }
 return{update,dispose(){disposed=true;for(const remove of listeners)remove();track.replaceChildren();root.hidden=true;}};
}
