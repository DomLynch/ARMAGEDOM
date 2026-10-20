import{Vector3}from'three';
import{createLowHoverDroneLibrary}from'../low-hover-drone.js';
import{bountyValue,storyState}from'./opening-story.js';
import{safehouseAnchor}from'./safehouse.js';
// Cosmetic reuse only: never an actor, target, weapon, pathfinder or save writer.
export function createGuideDroneView(s){
 let library=null,view=null,label=null,owner=null,lastStage=null,brightUntil=0,lastText='',controlsKey='',controls=[];const point=new Vector3(),playerPoint=new Vector3(),npcPoint=new Vector3(),offsets=[[1,.35],[-1,.35],[.6,-.85],[-.6,-.85]],position={x:0,z:0},renderPosition={x:0,z:0};
 const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 function controlBounds(key){if(key!==controlsKey){controlsKey=key;controls=['move','slash','stab','heavy','dodge','guard','weapon-tiles','pistol-interact','menu-button'].flatMap(id=>{const el=document.getElementById?.(id);if(!el||el.hidden||!el.getClientRects().length)return[];const r=el.getBoundingClientRect();return[{left:r.left,right:r.right,top:r.top,bottom:r.bottom}];});}return controls;}
 function hide(){view?.root.removeFromParent();if(label){label.hidden=true;label.remove();}}
 s.canvas?.addEventListener?.('webglcontextlost',hide);
 function update(){const g=s.game,w=s.world;if(!g||!w||!s.loaded||s.contextLost||s.traveling||g.runSaveInvalid||g.player.hp<=0||g.finished){hide();return;}
  if(!library){library=createLowHoverDroneLibrary();view=library.spawn({scene:s.scene,groundY:.65});view.root.name='Guide drone · cosmetic';view.root.scale.setScalar(.8);label=document.createElement('div');label.id='guide-drone-label';label.className='guide-drone-label';label.hidden=true;document.body.append(label);}
  if(owner!==g){owner=g;lastStage=storyState(g).bountyStage;brightUntil=0;lastText='';}
  const stage=storyState(g).bountyStage;if(stage!==lastStage){brightUntil=g.time+3;lastStage=stage;}
  let chosen=false;for(const[x,z]of offsets){position.x=g.player.pos.x+x;position.z=g.player.pos.z+z;if(w.geometry.clear(position,.4)&&w.lineClear(g.player.pos,position)){chosen=true;break;}}
  if(!chosen){hide();return;}if(!view.root.parent)s.scene.add(view.root);if(!label.parentElement)document.body.append(label);
  // The shared library accepts render-space Z. Its normal depth-tested meshes
  // use the existing world's scenery depth masks; no extra render or ray query.
  const anchor=safehouseAnchor(g);renderPosition.x=position.x;renderPosition.z=-position.z;view.update({time:g.time,position:renderPosition,heading:Math.atan2((g.pistol?.collected?anchor?.x??g.player.pos.x:g.pistol.pickupPos.x)-position.x,-(g.pistol?.collected?anchor?.z??g.player.pos.z:g.pistol.pickupPos.z)+position.z),state:'idle'});
  label.hidden=!!s.paused;if(s.paused)return;
  point.copy(view.root.position);point.y+=.3;point.project(s.camera);const width=innerWidth,height=innerHeight,x=(point.x+1)*width/2,y=(1-point.y)*height/2,portrait=height>width;
  if(point.z< -1||point.z>1||x<0||x>width||y<0||y>height){label.hidden=true;return;}
  const near=!!anchor&&Math.hypot(anchor.x-g.player.pos.x,anchor.z-g.player.pos.z)<5;
  const message=stage===2?(g.time<brightUntil?'Location confirmed.':''):near&&!storyState(g).commsRead?'Leave the terminal alone. Nothing useful there.':!g.pistol.collected?'You’ll need that. · Pistol':stage===1?'Shelter. West landing.':'';
  const text=`DRONE · £${bountyValue(g)}`+(message?'\n'+message:'');if(text!==lastText){label.textContent=text;lastText=text;}
  label.dataset.bright=String(g.time<brightUntil);const minTop=portrait?205:112,maxBottom=height-(portrait?200:105),action=document.getElementById?.('pistol-interact'),tiles=document.getElementById?.('weapon-tiles-track'),key=[width,height,g.player.weapon,action?.dataset.contextAction,action?.hidden,tiles?.childElementCount].join('|'),blocked=controlBounds(key);
  playerPoint.set(g.player.pos.x,1.3,-g.player.pos.z).project(s.camera);const px=(playerPoint.x+1)*width/2,py=(1-playerPoint.y)*height/2,actor={left:px-24,right:px+24,top:py-43,bottom:py+43},actors=[actor];let nearest=null,selected=null,nearestDistance=8;
  for(const e of g.enemies??[]){if(e.hp<=0||e.visible===false||(e.areaId??w.areaId)!==w.areaId)continue;const distance=Math.hypot(e.pos.x-g.player.pos.x,e.pos.z-g.player.pos.z);if(e.id===g.pistolTargetId)selected=e;if(distance<nearestDistance){nearest=e;nearestDistance=distance;}}
  for(const e of[selected,nearest]){if(!e||e===nearest&&selected===nearest&&actors.length>1)continue;npcPoint.set(e.pos.x,1.2,-e.pos.z).project(s.camera);if(npcPoint.z< -1||npcPoint.z>1||Math.abs(npcPoint.x)>1||Math.abs(npcPoint.y)>1)continue;const ex=(npcPoint.x+1)*width/2,ey=(1-npcPoint.y)*height/2;actors.push({left:ex-26,right:ex+26,top:ey-48,bottom:ey+48});}let box=null;
  for(const rise of[110,150]){for(const shift of[-84,16,-184]){const left=Math.max(12,Math.min(width-180,x+shift)),top=y-rise,candidate={left,right:left+168,top,bottom:top+76};if(top>=minTop&&candidate.bottom<=maxBottom&&!actors.some(r=>overlaps(candidate,r))&&!blocked.some(r=>overlaps(candidate,r))){box=candidate;break;}}if(box)break;}
  label.hidden=!box;if(!box)return;label.style.left=box.left+'px';label.style.top=box.top+'px';
 }
 return{update,dispose(){s.canvas?.removeEventListener?.('webglcontextlost',hide);view?.dispose();view=null;library?.dispose();library=null;label?.remove();label=null;owner=null;}};
}
