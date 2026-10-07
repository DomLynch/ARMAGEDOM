const recipes=[['pistol-directional','bullet',[]],['pistol-decapitation','bullet',['head']],['decapitation','cutting',['head']],
  ['split-crown','cutting',['crown']],['opened','cutting',['upper-body']],['run-through','piercing',[]]];
const id=value=>typeof value==='string'&&value.trim().length>0 || Number.isSafeInteger(value)&&value>0;
const direction=value=>{
  if(!value || !Number.isFinite(value.x) || !Number.isFinite(value.z))return null;
  const length=Math.hypot(value.x,value.z);
  return Number.isFinite(length)&&length>1e-8?{x:value.x/length,z:value.z/length}:null;
};
function damageType(context){
  if(context.weapon==='pistol')return 'bullet';
  if(context.weapon!=='knife')return null;
  if(['light_right','light_left','heavy_overhead'].includes(context.moveId))return 'cutting';
  return context.moveId==='thrust'?'piercing':null;
}

// Selection describes ONE already-confirmed corpse; it never applies damage,
// kills/rewards, allocates geometry or advances any world/animation clock.
export function selectFinisher(context,{support=[],budget=0,ordinal=0,recentRecipeId=null,chosen=null}={}){
  if(!context || context.lethal!==true || !id(context.victimId))return null;
  if(chosen?.version===1 && chosen.victimId===context.victimId
      && (chosen.recipeId==='ordinary'||recipes.some(([name])=>name===chosen.recipeId)))return chosen;
  const type=damageType(context),impact=direction(context.impactDirection);
  const ordinary={id:'ordinary',clip:'Death',seconds:2.4,cost:0,parts:[]};
  const pool=[ordinary];
  if(type&&impact&&Array.isArray(support)&&Number.isSafeInteger(budget)&&budget>=0){
    for(const [name,required,parts] of recipes){
      if(required!==type)continue;
      // Cosmetic only: at most one scheduled head outcome per five confirmed kills.
      if(name==='pistol-decapitation'&&(!Number.isSafeInteger(ordinal)||ordinal<0||ordinal%5!==1))continue;
      const matches=support.filter(row=>row?.id===name),row=matches.length===1?matches[0]:null;
      if(!row || row.prepared!==true || typeof row.clip!=='string' || !row.clip.trim()
          || !Number.isFinite(row.seconds) || row.seconds<=0 || row.seconds>10
          || !Number.isSafeInteger(row.cost) || row.cost<parts.length || row.cost>budget
          || !Array.isArray(row.parts) || row.parts.length!==parts.length
          || parts.some((part,i)=>row.parts[i]!==part))continue;
      pool.push(row);
    }
  }
  const fresh=pool.length>1?pool.filter(row=>row.id!==recentRecipeId):pool;
  const index=Number.isSafeInteger(ordinal)&&ordinal>=0?ordinal%fresh.length:0;
  const selected=fresh.find(row=>row.id==='pistol-decapitation')??fresh[index];
  return {version:1,victimId:context.victimId,recipeId:selected.id,damageType:type,
    clip:selected.clip,seconds:selected.seconds,cost:selected.cost,parts:[...selected.parts],
    impactDirection:impact,hitRegion:typeof context.hitRegion==='string'&&context.hitRegion.trim()?context.hitRegion:null};
}

// Presentation may reject a cosmetic recipe at the actual registered death point.
// Retain the confirmed victim/damage identity; reconcile only rendered recipe cost.
export function withPresentedRecipe(outcome,recipe){
 if(outcome.recipeId===recipe.id)return outcome;
 return {...outcome,recipeId:recipe.id,clip:recipe.clip,seconds:recipe.seconds,cost:recipe.cost,parts:[...recipe.parts]};
}
