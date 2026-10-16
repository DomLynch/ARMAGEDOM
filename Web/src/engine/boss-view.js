import*as T from'three';
import{createHeadLabelPositioner}from'./boss-label.js';
export function createBossView(s){
 const host=document.getElementById('boss-labels');if(!host)return{update(){},dispose(){}};
 const labels=new Map(),patches=new Map(),positionHead=createHeadLabelPositioner();let ring=null,disc=null,disposed=false;
 const removePatch=view=>{view.root.removeFromParent();view.fill.material.dispose();view.edge.material.dispose();};
 function update(){
  if(disposed)return;const g=s.game;if(!g)return;const active=s.loaded&&!s.contextLost&&!s.traveling&&g.player.hp>0;
  const live=new Set();for(const e of g.enemies.filter(e=>e.bossProfile&&e.hp>0)){
   live.add(e.id);let el=labels.get(e.id);if(!el){el=document.createElement('span');el.className='boss-world-label';el.dataset.bossKey=e.placementKey;host.append(el);labels.set(e.id,el);}
   const near=Math.hypot(e.pos.x-g.player.pos.x,e.pos.z-g.player.pos.z)<12;
   el.hidden=!active||!near;if(el.hidden)continue;
   if(el.textContent!==e.bossName)el.textContent=e.bossName;
   const position=positionHead(s.actors?.views.get(e.id),el.getBoundingClientRect(),s.camera,{width:innerWidth,height:innerHeight});
   el.hidden=!position;if(position){el.style.left=`${position.left}px`;el.style.top=`${position.top}px`;}
  }
  for(const[id,el]of labels)if(!live.has(id)){el.remove();labels.delete(id);}
  const ids=new Set();for(const h of g.areaHazards??[]){
   if(h.areaId!==s.world.areaId||g.time>=h.expiresAt||!g.enemies.some(e=>e.id===h.ownerId&&e.hp>0))continue;ids.add(h.ownerId);let view=patches.get(h.ownerId);
   if(!view){ring??=new T.RingGeometry(.91,1,48);disc??=new T.CircleGeometry(1,48);const root=new T.Group(),fill=new T.Mesh(disc,new T.MeshBasicMaterial({transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide})),edge=new T.Mesh(ring,new T.MeshBasicMaterial({transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide}));root.rotation.x=-Math.PI/2;root.add(fill,edge);s.scene.add(root);view={root,fill,edge};patches.set(h.ownerId,view);}
   const warning=g.time<h.startsAt;view.root.name=warning?'Area hazard warning':'Area hazard active';view.root.visible=active;view.root.position.copy(s.world.toRender(h.position,.025));view.root.scale.setScalar(h.radius);const color=warning?0xffcb59:0x8ed04d;view.fill.material.color.setHex(color);view.edge.material.color.setHex(color);view.fill.material.opacity=warning?.10:.24;view.edge.material.opacity=warning?.65+.3*Math.sin(g.time*10)**2:.9;
  }
  for(const[id,view]of patches)if(!ids.has(id)){removePatch(view);patches.delete(id);}
 }
 return{update,dispose(){if(disposed)return;disposed=true;for(const el of labels.values())el.remove();labels.clear();for(const view of patches.values())removePatch(view);patches.clear();ring?.dispose();disc?.dispose();}};
}
