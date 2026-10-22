import{closed,freeze}from'./content-schema.js';
import{AREA_MOB_SPAWNS}from'../area-mob-spawns.js';
const fail=()=>{throw TypeError('Invalid area boss catalogue');};
const key=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,95}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=80;
const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const point=p=>{closed(p,['x','z']);if(!Object.values(p).every(Number.isFinite))fail();};
export function validateAreaBosses(input,registry,residents={}){
 if(input===undefined)return null;closed(input,['version','profiles','placements','paths']);if(input.version!==1||!input.profiles||Object.getPrototypeOf(input.profiles)!==Object.prototype||!input.paths||Object.getPrototypeOf(input.paths)!==Object.prototype||!Array.isArray(input.placements)||![3,7].includes(input.placements.length))fail();
 const data=structuredClone(input),profiles=Object.entries(data.profiles);if(![3,7].includes(profiles.length)||profiles.length!==data.placements.length)fail();const paths=new Set(),models=new Set();
 for(const[id,p]of profiles){
  closed(p,['name','modelRef','health','radius','moveSpeed','wakeDistance','homeLeash','recoveryDelay','contactScale','attackPattern','attacks','hazard'],['minimumAttackDistance','weapon']);
  if(!key(id)||!text(p.name)||!key(p.modelRef)||models.has(p.modelRef))fail();models.add(p.modelRef);
  for(const[field,min,max]of[['health',40,140],['radius',.35,.6],['moveSpeed',.7,2.5],['wakeDistance',2,6],['homeLeash',3,8],['recoveryDelay',.4,2.5],['contactScale',.2,3]])if(!number(p[field],min,max))fail();
  if(p.homeLeash<p.wakeDistance||!Array.isArray(p.attackPattern)||p.attackPattern.length<1||p.attackPattern.length>4||!p.attacks||Object.getPrototypeOf(p.attacks)!==Object.prototype)fail();
  if(p.minimumAttackDistance!==undefined&&(!number(p.minimumAttackDistance,.2,2.9)||Object.values(p.attacks).some(a=>!Number.isFinite(a.range)||p.minimumAttackDistance+.1>=a.range)))fail();
  if(Object.keys(p.attacks).length<1||Object.keys(p.attacks).length>3||p.attackPattern.some(action=>!Object.hasOwn(p.attacks,action)))fail();
  for(const[action,a]of Object.entries(p.attacks)){
   closed(a,['clip','path','windupTicks','activeTicks','recoveryTicks','damage','staminaDamage','staggerTicks','chip','range','stepIn','knockback','stamina','parryable']);
   if(!['slash','stab','heavy'].includes(action)||!text(a.clip)||!key(a.path)||paths.has(a.path)||typeof a.parryable!=='boolean')fail();paths.add(a.path);
   for(const[field,min,max]of[['windupTicks',24,72],['activeTicks',3,18],['recoveryTicks',24,90],['damage',6,20],['staminaDamage',6,30],['staggerTicks',6,30],['chip',0,.2],['range',.6,3],['stepIn',0,.5],['knockback',0,3],['stamina',10,30]])if(!number(a[field],min,max)||field.endsWith('Ticks')&&!Number.isInteger(a[field]))fail();
   const frames=data.paths[a.path],total=a.windupTicks+a.activeTicks+a.recoveryTicks;
   if(!Array.isArray(frames)||frames.length!==total+1||!frames.every(row=>Array.isArray(row)&&row.length===6&&row.every(n=>number(n,-5,5))))fail();
   Object.assign(a,{moveId:id+'-'+action,native:true,windup:a.windupTicks/60,active:a.activeTicks/60,recovery:a.recoveryTicks/60,stagger:a.staggerTicks/60,arc:action==='stab'?60:120});
  }
  if(p.weapon!==undefined){const w=p.weapon;closed(w,['kind','modelRef','windupTicks','activeTicks','recoveryTicks','range','coneDegrees','intervalTicks','damage']);
   if(w.kind==='saw'){if(['windupTicks','activeTicks','recoveryTicks','intervalTicks'].some(k=>!Number.isInteger(w[k]))||id!=='surgeon'||w.modelRef!=='bone-saw'||!number(w.windupTicks,30,90)||!number(w.activeTicks,30,90)||!number(w.recoveryTicks,60,150)||!number(w.range,1,2)||w.coneDegrees!==38||w.intervalTicks!==12||!number(w.damage,1,4))fail();}
   else{if(w.kind!=='flame'||w.modelRef!=='player-flamethrower')fail();
   for(const[field,min,max]of[['windupTicks',id==='witch'?6:42,90],['activeTicks',12,24],['recoveryTicks',id==='witch'?32:72,150],['range',1,id==='witch'?4.86:3],['coneDegrees',20,40],['intervalTicks',12,24],['damage',1,4]])if(!number(w[field],min,max)||field.endsWith('Ticks')&&!Number.isInteger(w[field]))fail();
   if(w.activeTicks!==2*w.intervalTicks)fail();}
  }
  if(p.hazard!==null){closed(p.hazard,['warning','radius','duration','interval','damage']);for(const[field,min,max]of[['warning',.65,1.5],['radius',.7,1.2],['duration',1,3],['interval',.6,1.5],['damage',1,3]])if(!number(p.hazard[field],min,max))fail();}
 }
 if(Object.keys(data.paths).length!==paths.size||Object.keys(data.paths).some(id=>!paths.has(id)))fail();
 const existing=new Set(registry.ids.flatMap(id=>(residents[id]??AREA_MOB_SPAWNS[id]??[]).map(row=>row.key))),used=new Set(),areas=new Set();
 for(const row of data.placements){closed(row,['key','areaId','profileRef','pos','patrol']);if(!key(row.key)||existing.has(row.key)||!registry.has(row.areaId)||!Object.hasOwn(data.profiles,row.profileRef)||used.has(row.profileRef)||areas.has(row.areaId))fail();existing.add(row.key);used.add(row.profileRef);areas.add(row.areaId);point(row.pos);if(!Array.isArray(row.patrol)||row.patrol.length!==2)fail();row.patrol.forEach(point);}
 return freeze(data);
}
export function mergeBossResidents(residents,data,registry){
 if(!data)return residents;const merged={...residents};
 for(const row of data.placements){const old=merged[row.areaId]??AREA_MOB_SPAWNS[row.areaId]??[];merged[row.areaId]=[...old,{key:row.key,foundationRef:'hollow-scavenger',recipeRef:'human-street-scavenger',bossRef:row.profileRef,pos:{...row.pos},patrol:row.patrol.map(p=>({...p}))}];}
 return freeze(merged);
}
export function applyBossProfile(actor,row,data){
 if(!row.bossRef)return actor;const p=data?.profiles[row.bossRef];if(!p)fail();
 return Object.assign(actor,{rig:p.modelRef,bossProfile:p,bossName:p.name,contactPaths:data.paths,contactScale:actor.combatScale*p.contactScale,mobSize:1,hp:p.health,maxHP:p.health,radius:p.radius,moveSpeed:p.moveSpeed,recoveryDelay:p.recoveryDelay,
  residentIntent:Object.freeze({pursuitScope:'area',wakeDistance:p.wakeDistance,homeLeash:p.homeLeash,holdUntilWake:true,retreatSeconds:0,companionDistance:0,isolationDistance:0,burstSeconds:0,pauseSeconds:0})});
}
// Reset only the shared boss policy; health, rewards and nonboss intent stay owned elsewhere.
export function resetBossPursuit(actor){if(actor.residentIntent?.pursuitScope!=='area')return;actor.alerted=false;actor.returning=actor.hp>0&&!!actor.home;actor.swing=null;actor.completedAttack=null;}
export function bossMove(actor,action){return actor.bossProfile?.attacks[action]??null;}
// Read the existing committed reward state. A corpse or an uncommitted kill
// cannot open an exit; pickup and equipment selection are not prerequisites.
export function bossExitGate(game,target=null){
 const world=game?.world,link=world?.registry?.links?.(world.areaId)?.find(row=>(row.requiresDefeat||row.requiresVisited)&&(target===null||row.to===target));
 if(!link)return null;
 const key=link.requiresDefeat,placement=world.bossData?.placements?.find(row=>row.key===key),name=world.bossData?.profiles?.[placement?.profileRef]?.name??'the boss';
 const field=key&&Object.keys(world.bossEquipmentData??{}).find(field=>world.bossEquipmentData[field].source.placementKey===key);
 const defeated=!key||field!==undefined&&['pending','owned','legacy-dead'].includes(game.bossEquipment?.[field]?.status),visited=!link.requiresVisited||game.expedition?.visitedIds?.includes(link.to)===true;
 const allowed=!game.runSaveInvalid&&defeated&&visited,destination=link.to.replaceAll('-',' ');
 return{allowed,key,message:allowed?'':!defeated?`Defeat ${name} to open the ${destination} exit.`:!visited?`Discover ${destination} on foot before using this safehouse exit.`:'Saving unavailable. Exit remains locked.'};
}
export function bossHazardPosition(game,actor){
 const h=actor.bossProfile?.hazard,w=game.world;if(!h||!w.geometry)return null;
 const entries=[w.registry.get(w.areaId).entry,...w.registry.ids.flatMap(id=>w.registry.links(id).filter(link=>link.to===w.areaId).map(link=>link.entry))].map(p=>w.geometry.ground(p));
 for(const p of[game.player.pos,actor.home])if(p&&Math.hypot(p.x-actor.home.x,p.z-actor.home.z)<=actor.bossProfile.homeLeash&&w.geometry.clear(p,h.radius+.4)&&!w.travelAt?.(p)&&entries.every(e=>Math.hypot(p.x-e.x,p.z-e.z)>h.radius+2))return{...p};
 return null;
}

export function validateBossGeometry(data,areaId,g,registry){
 if(!data)return;const entries=[registry.get(areaId).entry,...registry.ids.flatMap(id=>registry.links(id).filter(link=>link.to===areaId).map(link=>link.entry))].map(p=>g.ground(p));
 for(const row of data.placements.filter(row=>row.areaId===areaId)){
  const p=data.profiles[row.profileRef],clearRadius=p.hazard?Math.max(p.radius,p.hazard.radius+.4):p.radius;
  if(!g.clear(row.pos,clearRadius)||entries.some(e=>Math.hypot(e.x-row.pos.x,e.z-row.pos.z)<=p.homeLeash+.8))throw Error('Unsafe optional boss pocket');
  for(const goal of row.patrol){if(Math.hypot(goal.x-row.pos.x,goal.z-row.pos.z)>.8||!g.clear(goal,p.radius))throw Error('Unsafe boss patrol');const steps=Math.max(1,Math.ceil(Math.hypot(goal.x-row.pos.x,goal.z-row.pos.z)/.08));for(let n=0;n<=steps;n++)if(!g.clear({x:row.pos.x+(goal.x-row.pos.x)*n/steps,z:row.pos.z+(goal.z-row.pos.z)*n/steps},p.radius))throw Error('Blocked boss patrol');}
 }
}
