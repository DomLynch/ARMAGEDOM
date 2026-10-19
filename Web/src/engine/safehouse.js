import{insidePolygon,segmentsIntersect}from'../world-geometry.js';
import{closed,freeze}from'./content-schema.js';
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const art=p=>p&&closed(p,['x','y'])!==false&&finite(p.x,0,1)&&finite(p.y,0,1);
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const distance=(p,a,b)=>{const x=b.x-a.x,z=b.z-a.z,n=x*x+z*z,t=n?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/n)):0;return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);};
export function validateSafehouseData(data,registry){
 if(data===undefined)return null;closed(data,['version','areaId','boundary','patch','props','interactionRadius','nearbyRadius','pulseSeconds']);
 if(data.version!==1||!registry.has(data.areaId)||!Array.isArray(data.boundary)||data.boundary.length<3||data.boundary.length>12||!data.boundary.every(art)||!finite(data.interactionRadius,.5,1.5)||!finite(data.nearbyRadius,2,6)||data.pulseSeconds!==3.5)throw Error('Invalid safehouse data');
 closed(data.patch,['path','x','y','width','height']);if(data.patch.path!==data.areaId+'/safehouse-patch.png'||!['x','y','width','height'].every(k=>finite(data.patch[k],0,1)))throw Error('Invalid safehouse patch');
 if(!Array.isArray(data.props)||data.props.length!==3||new Set(data.props.map(p=>p.id)).size!==3)throw Error('Three safehouse props required');
 for(const p of data.props){closed(p,['id','label','visual','standing','bounds','phase'],['outlines']);closed(p.bounds,['x','y','width','height']);if(!['locker','comms','map'].includes(p.id)||typeof p.label!=='string'||!p.label.trim()||!art(p.visual)||!art(p.standing)||!Object.values(p.bounds).every(n=>finite(n,0,1))||!finite(p.phase,0,1))throw Error('Invalid safehouse prop');
  if(p.outlines!==undefined){if(!Array.isArray(p.outlines)||p.outlines.length<1||p.outlines.length>4)throw Error('Invalid safehouse outlines');for(const line of p.outlines){closed(line,['closed','points']);if(typeof line.closed!=='boolean'||!Array.isArray(line.points)||line.points.length<2||line.points.length>24||!line.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>finite(n,0,1))))throw Error('Invalid safehouse outline');}}
 }
 return freeze(structuredClone(data));
}
const caches=new WeakMap();
function region(g){const w=g?.world,data=w?.safehouseData;if(!data||w.areaId!==data.areaId||!w.geometry)return null;let row=caches.get(w);if(!row||row.geometry!==w.geometry||row.data!==data){const polygon=data.boundary.map(w.geometry.ground);row={data,geometry:w.geometry,polygon,edges:polygon.map((p,i)=>[p,polygon[(i+1)%polygon.length]])};caches.set(w,row);}return row;}
export function safehouseProtected(g,position=g?.player?.pos,radius=g?.player?.radius??0){const r=region(g);return!!r&&point(position)&&insidePolygon(position,r.polygon)&&r.edges.every(([a,b])=>distance(position,a,b)>=radius);}
export function safehouseTouches(g,position,radius=0){const r=region(g);return!!r&&point(position)&&(insidePolygon(position,r.polygon)||r.edges.some(([a,b])=>distance(position,a,b)<=radius));}
export function safehouseBlocksSegment(g,a,b){const r=region(g);return!!r&&point(a)&&point(b)&&(safehouseTouches(g,a)||safehouseTouches(g,b)||r.edges.some(([c,d])=>segmentsIntersect(a,b,c,d)));}
export function safehouseCrosses(g,a,b){const r=region(g);if(!r||!point(a)||!point(b))return false;if(insidePolygon(a,r.polygon)&&insidePolygon(b,r.polygon))return false;return safehouseBlocksSegment(g,a,b);}
export function safehouseWeaponBlocked(g){return safehouseTouches(g,g.player.pos,g.player.radius??.4);}
export function safehouseAnchor(g){const r=region(g);return r?r.geometry.ground(r.data.props.find(p=>p.id==='comms').standing):null;}
// The existing protected landing is one physical interaction range, never a UI hitbox.
export function safehouseInteraction(g){const r=region(g);return!!r&&safehouseProtected(g)&&g.player.hp>0&&!g.finished&&!g.runSaveInvalid&&r.geometry.clear(g.player.pos,g.player.radius??.4)&&g.world.lineClear(g.player.pos,safehouseAnchor(g));}
export function safehouseProp(g,id){return!!region(g)?.data.props.some(p=>p.id===id)&&safehouseInteraction(g);}

export function cancelSafehouseActions(g){const p=g.player;p.swing=null;p.buffer=null;p.guarding=false;p.parryUntil=0;g.activeGrenades=[];g.activeRockets=[];if(g.pistol)g.pistol.reloadingUntil=0;if(g.rifleAction)g.rifleAction.reloadingUntil=0;for(const clock of Object.values(g.bossEquipmentAction??{}))clock.reloadingUntil=0;if(g.flame)Object.assign(g.flame,{active:false,wantFire:false,elapsed:0,pendingReturn:false});}
export function prepareSafehouseStep(g,intent){const lowered=safehouseWeaponBlocked(g);g.safehouseProtected=safehouseProtected(g);g.weaponsLowered=lowered;if(lowered){cancelSafehouseActions(g);return{...intent,actions:[],held:[],fire:false,guard:false,guardPressed:false};}return intent;}
export function validateSafehouseGeometry(data,areaId,geometry,residents=[]){if(!data||data.areaId!==areaId)return;const polygon=data.boundary.map(geometry.ground);for(const p of polygon)if(!geometry.clear(p,0))throw Error('Safehouse boundary overlaps solid scenery');for(const p of data.props){const v=geometry.ground(p.standing);if(!geometry.clear(v,.4)||!insidePolygon(v,polygon)||!polygon.every((a,i)=>distance(v,a,polygon[(i+1)%polygon.length])>=.4))throw Error('Safehouse interaction is not on usable landing');}for(const row of residents)if(insidePolygon(row.pos,polygon))throw Error('Safehouse overlaps a resident spawn');}
