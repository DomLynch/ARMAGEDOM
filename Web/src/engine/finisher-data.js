import input from './finisher-data.json' with {type:'json'};
import {closed,freeze} from './content-schema.js';
const key=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const list=x=>Array.isArray(x)&&x.length>0&&x.every(key)&&new Set(x).size===x.length;
const fail=()=>{throw TypeError('Invalid finisher catalogue');};
export function validateFinisherData(value){
 const d=structuredClone(value);closed(d,['version','chance','seed','ordinary','limits','recipes','bindings','flameDeath','impactLimits','preparation']);
 if(d.version!==1||!finite(d.chance,0,1)||!key(d.seed))fail();
 closed(d.ordinary,['id','clip','seconds','cost','parts']);if(d.ordinary.id!=='ordinary'||d.ordinary.clip!=='Death'||!finite(d.ordinary.seconds,.01,10)||d.ordinary.cost!==0||!Array.isArray(d.ordinary.parts)||d.ordinary.parts.length)fail();
 closed(d.limits,['partBudget','partLifetime','maxRecipeSeconds']);if(!Number.isSafeInteger(d.limits.partBudget)||!finite(d.limits.partBudget,0,8)||!finite(d.limits.partLifetime,.1,10)||!finite(d.limits.maxRecipeSeconds,.1,10))fail();
 if(!Array.isArray(d.recipes)||!d.recipes.length||d.recipes.length>16)fail();const ids=new Map();
 for(const r of d.recipes){closed(r,['id','damageType','parts','avoidRepeat'],['impact']);if(!key(r.id)||r.id==='ordinary'||ids.has(r.id)||!key(r.damageType)||typeof r.avoidRepeat!=='boolean'||!Array.isArray(r.parts)||r.parts.length>2||r.parts.some(p=>!['head','crown','upper-body'].includes(p))||new Set(r.parts).size!==r.parts.length)fail();if(r.impact&&(!Array.isArray(r.impact)||r.impact.length!==6||!['head','body'].includes(r.impact[0])||!Number.isInteger(r.impact[1])||!finite(r.impact[1],0,48)||!Number.isInteger(r.impact[2])||!finite(r.impact[2],0,8)||!finite(r.impact[3],.01,3)||!finite(r.impact[4],0,10)||!finite(r.impact[5],0,90)))fail();ids.set(r.id,r);}
 if(!Array.isArray(d.bindings)||!d.bindings.length||d.bindings.length>16)fail();
 for(const b of d.bindings){closed(b,['weapon','recipes'],['moveIds','attackClasses']);if(!key(b.weapon)||b.moveIds&&!list(b.moveIds)||b.attackClasses&&!list(b.attackClasses)||!Array.isArray(b.recipes)||!b.recipes.length||new Set(b.recipes.map(r=>r.id)).size!==b.recipes.length)fail();for(const r of b.recipes){closed(r,['id','weight']);if(!ids.has(r.id)||!finite(r.weight,.001,100))fail();}if(new Set(b.recipes.map(r=>ids.get(r.id).damageType)).size!==1)fail();}
 closed(d.preparation,['openedPlacements']);if(!list(d.preparation.openedPlacements))fail();
 closed(d.impactLimits,['bursts','particles','trails']);for(const [k,max]of Object.entries({bursts:2,particles:48,trails:8}))if(!Number.isInteger(d.impactLimits[k])||!finite(d.impactLimits[k],0,max))fail();
 const f=d.flameDeath;closed(f,['recipeId','rigs','anchorBone','burnSeconds','fadeSeconds','anchorLift','charBegin','charSettle','tint','blend','roughnessFloor','prioritizeCorpses','flickerRate','flickerSize','riseRate','rise','wisps']);if(ids.get(f.recipeId)?.damageType!=='flame'||!list(f.rigs)||!key(f.anchorBone)||!finite(f.burnSeconds,.1,3)||!finite(f.fadeSeconds,.01,f.burnSeconds)||!finite(f.anchorLift,0,.3)||!finite(f.charBegin,0,3)||!finite(f.charSettle,f.charBegin+.01,5)||!Number.isInteger(f.tint)||!finite(f.tint,0,0xffffff)||!finite(f.blend,0,1)||!finite(f.roughnessFloor,0,1))fail();if(typeof f.prioritizeCorpses!=='boolean'||!finite(f.flickerRate,0,30)||!finite(f.flickerSize,0,.5)||!finite(f.riseRate,0,10)||!finite(f.rise,0,.3)||!Array.isArray(f.wisps)||!f.wisps.length||f.wisps.length>12)fail();for(const w of f.wisps){closed(w,['offset','width','aspect','color','phase']);if(!Array.isArray(w.offset)||w.offset.length!==3||!finite(w.offset[0],-.4,.4)||!finite(w.offset[1],0,.8)||!finite(w.offset[2],-.4,.4)||!finite(w.width,.05,1.2)||!finite(w.aspect,1,3)||!Number.isInteger(w.color)||!finite(w.color,0,0xffffff)||!finite(w.phase,0,10))fail();}return freeze(d);
}
export const FINISHER_DATA=validateFinisherData(input);
export const FLAME_DEATH_DATA=FINISHER_DATA.flameDeath;
export const finisherDefinition=id=>FINISHER_DATA.recipes.find(r=>r.id===id)??null;

export const remainingFinisherPartSeconds=(age,data=FINISHER_DATA)=>Math.max(0,data.limits.partLifetime-Math.max(0,age));
