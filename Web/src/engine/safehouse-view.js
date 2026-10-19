import{LineSegments2}from'three/addons/lines/LineSegments2.js';
import{LineSegmentsGeometry}from'three/addons/lines/LineSegmentsGeometry.js';
import{LineMaterial}from'three/addons/lines/LineMaterial.js';
import{safehouseProp}from'./safehouse.js';
import{lockerInventory,lockerStored}from'./locker-core.js';
import{LOCKER_WEAPON_IDS,LOCKER_RESOURCE_RULES}from'./locker-state.js';
const names=['Starting pistol · shared variants','Bridge Rifle','Flamethrower · shared variants','Pitborn Cleaver','Stalker Shotgun','Grenades','Surgeon’s Knife','Rocket Launcher'];
const resources={'pistol-reserve':'Pistol reserve','rifle-reserve':'Rifle reserve','shotgun-reserve':'Shotgun reserve','rocket-reserve':'Rocket reserve','grenade-charges':'Grenade charges','flame-fuel':'Flame fuel'};
// A short wall-clock presentation pulse; gameplay and storage clocks are untouched.
export function safehouseCueOpacity(time,{period=3.5,phase=0,near=false,selected=false,reduced=false}={}){
 if(reduced)return .75;const pulse=Math.pow((1+Math.sin(2*Math.PI*(time/period-phase)))/2,8),floor=selected?.82:near?.70:.40;return floor+(1-floor)*pulse;
}
// Native registered-image plane; world owns the backdrop, this view owns only its patch/cues.
export function createSafehouseView(s,dispatch){
 let owner=null,meshes=[],texture=null,loading=false,failed=false,disposed=false,lastPanel='',lastError='',promptOwned=false;
 let label=null;
 function ensureLabel(){if(label)return;label=document.createElement('div');label.className='safehouse-label';label.hidden=true;label.setAttribute('aria-live','polite');document.body.append(label);}
 const panel=document.getElementById('locker-items'),status=document.getElementById('locker-status');
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 function clear(){for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}meshes=[];owner=null;}
 function planePoint(w,x,y){const a=w.backdrop.geometry.attributes.position,T=w.THREE,tl=new T.Vector3().fromBufferAttribute(a,3),tr=new T.Vector3().fromBufferAttribute(a,2),bl=new T.Vector3().fromBufferAttribute(a,0);return tl.clone().addScaledVector(tr.sub(tl),x).addScaledVector(bl.sub(tl),y);}
 function build(w,data){clear();owner=w.group;const T=w.THREE,p=data.patch;
 const coords=[[p.x,p.y+p.height],[p.x+p.width,p.y+p.height],[p.x+p.width,p.y],[p.x,p.y]],geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(coords.flatMap(([x,y])=>planePoint(w,x,y).toArray()),3));geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
 const material=new T.MeshBasicMaterial({map:texture,depthTest:false,depthWrite:false,side:T.DoubleSide,toneMapped:false});material.color.setRGB(w.layout.exposure,w.layout.exposure,w.layout.exposure);const patch=new T.Mesh(geometry,material);patch.name='Westminster safehouse approved art';patch.renderOrder=-99;patch.frustumCulled=false;owner.add(patch);meshes.push(patch);
 // Each outline follows its own painted prop, never the patch rectangle.
 const silhouettes={locker:[[.09,.05],[.91,0],[1,.86],[.77,1],[0,.88]],comms:[[0,.31],[.76,0],[1,.23],[.96,.84],[.25,1],[.02,.82]],map:[[0,.13],[.91,0],[1,.84],[.08,1]]};
 for(const prop of data.props){const b=prop.bounds,paths=prop.outlines??[{closed:true,points:silhouettes[prop.id].map(([x,y])=>[b.x+x*b.width,b.y+y*b.height])}],segments=[];
  for(const path of paths){const points=path.points.map(([x,y])=>planePoint(w,x,y));for(let i=0;i<points.length-1;i++)segments.push(...points[i].toArray(),...points[i+1].toArray());if(path.closed)segments.push(...points.at(-1).toArray(),...points[0].toArray());}
  const geometry=new LineSegmentsGeometry().setPositions(segments),material=new LineMaterial({color:0xddba70,linewidth:2,worldUnits:false,transparent:true,opacity:.4,depthTest:false,depthWrite:false,toneMapped:false}),line=new LineSegments2(geometry,material);
  line.name='Safehouse '+prop.id+' painted contour';line.renderOrder=-98;line.frustumCulled=false;line.userData.prop=prop;owner.add(line);meshes.push(line);
 }
 }
 function nearest(g,usable=false){const data=g.world.safehouseData;if(!data||g.world.areaId!==data.areaId)return null;return data.props.map(prop=>({prop,dist:Math.hypot(g.player.pos.x-g.world.geometry.ground(prop.standing).x,g.player.pos.z-g.world.geometry.ground(prop.standing).z)})).filter(row=>usable?safehouseProp(g,row.prop.id):row.dist<=data.nearbyRadius).sort((a,b)=>a.dist-b.dist)[0]?.prop??null;}
 function allowed(){return s.loaded&&!s.traveling&&!s.contextLost&&!s.resetting&&s.game?.player.hp>0&&!s.game.finished&&!s.game.runSaveInvalid;}
 function renderPanel(force=false){const g=s.game;if(!g||!panel)return;const inv=lockerInventory(g),locker=g.locker,key=JSON.stringify([inv,locker,allowed(),safehouseProp(g,'locker'),lastError]);if(!force&&key===lastPanel)return;lastPanel=key;panel.replaceChildren();const can=allowed()&&safehouseProp(g,'locker');status.textContent=lastError||(!can?'Approach the locker on the safehouse landing.':'Transfers save immediately. Equipped weapons must be put away first.');
 const button=(row,text,action,enabled)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=!can||!enabled;b.addEventListener('click',()=>{const result=dispatch(s.game,action,allowed()&&safehouseProp(s.game,'locker'));lastError=result.ok?'':result.code==='storage-unavailable'?'Saving unavailable. Everything was kept.':'Transfer unavailable. Your equipment was kept.';renderPanel(true);s.updateExpedition?.();});row.append(b);};
 for(const[id,i]of LOCKER_WEAPON_IDS.map((id,i)=>[id,i])){const item=inv.weapons[id];if(!item.owned)continue;const row=document.createElement('div');row.className='locker-row';const text=document.createElement('p'),stored=lockerStored(g,id);text.textContent=`${names[i]} · ${stored?'Stored':item.equipped?'Equipped':'Carried'}`;row.append(text);button(row,stored?'Retrieve':'Store',{type:stored?'withdrawWeapon':'depositWeapon',itemId:id},!item.equipped);panel.append(row);}
 for(const[resource,title]of Object.entries(resources)){const carry=inv.ammo[resource],stash=locker?.ammo[resource]??0,rule=LOCKER_RESOURCE_RULES[resource],row=document.createElement('div');row.className='locker-row';const text=document.createElement('p');text.textContent=`${title} · carried ${+carry.toFixed(2)} · stored ${+stash.toFixed(2)}`;row.append(text);const amount=document.createElement('input');amount.type='number';amount.min=resource==='flame-fuel'?'.01':'1';amount.step=resource==='flame-fuel'?'.01':'1';amount.value=resource==='flame-fuel'?'10':'1';amount.max=String(Math.max(rule.carryCap,rule.stashCap));amount.setAttribute('aria-label',title+' transfer amount');row.append(amount);
 for(const type of ['depositSupply','withdrawSupply']){const b=document.createElement('button');b.type='button';b.textContent=type==='depositSupply'?'Store':'Retrieve';b.disabled=!can||!(type==='depositSupply'?carry:stash);b.addEventListener('click',()=>{const result=dispatch(s.game,{type,resource,amount:Number(amount.value)},allowed()&&safehouseProp(s.game,'locker'));lastError=result.ok?'':result.code==='storage-unavailable'?'Saving unavailable. Everything was kept.':'Choose an available amount within the carrying and locker limits.';renderPanel(true);});row.append(b);}panel.append(row);}
 }
 function update(){const g=s.game,w=s.world,data=w?.safehouseData;if(!g||!w||!data)return;ensureLabel();
 const inArea=w.areaId===data.areaId;if(!texture&&!loading&&!failed&&inArea){loading=true;new w.THREE.TextureLoader().load(new URL('world/'+data.patch.path,w.baseUrl).href,t=>{loading=false;if(disposed){t.dispose();return;}texture=t;texture.colorSpace=w.THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=w.THREE.ClampToEdgeWrapping;},undefined,()=>{loading=false;failed=true;});}
 if(inArea&&texture&&owner!==w.group)build(w,data);for(const mesh of meshes)mesh.visible=inArea;
 const near=nearest(g),active=nearest(g,true),cueTime=performance.now()/1000,rect=s.canvas.getBoundingClientRect();for(const mesh of meshes){const prop=mesh.userData.prop;if(!prop)continue;mesh.material.opacity=safehouseCueOpacity(cueTime,{period:data.pulseSeconds,phase:prop.phase,near:near?.id===prop.id,selected:active?.id===prop.id,reduced:!!reduced?.matches});mesh.material.resolution.set(rect.width,rect.height);mesh.userData.cueTime=cueTime;}
 label.hidden=!near||!allowed();if(near&&allowed()){const v=planePoint(w,near.visual.x,near.visual.y).project(s.camera),rect=s.canvas.getBoundingClientRect();label.hidden=Math.abs(v.x)>1||Math.abs(v.y)>1;label.textContent=near.label+(active?.id===near.id?' · G':'');label.style.left=Math.max(70,Math.min(innerWidth-70,rect.left+(v.x+1)*rect.width/2))+'px';label.style.top=Math.max(140,Math.min(innerHeight-120,rect.top+(1-v.y)*rect.height/2-22))+'px';}
 const control=document.getElementById('pistol-interact');if(active&&allowed()&&!s.paused){control.hidden=false;control.textContent=active.label.toUpperCase()+' · G';promptOwned=true;}else if(promptOwned){promptOwned=false;control.hidden=true;}
 renderPanel();
 }
 function interact(){if(!allowed()||s.paused)return false;const prop=nearest(s.game,true);if(!prop)return false;lastError='';renderPanel(true);s.hud.showMenuPage(prop.id==='locker'?'locker':prop.id==='comms'?'journal':'map');return true;}
 return{update,interact,dispose(){disposed=true;clear();texture?.dispose();label?.remove();panel?.replaceChildren?.();}};
}
