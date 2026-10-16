// Pure optional expedition DTO. The existing Core/IO owns durability and live grants.
const fields=['version','visitedIds','status','rewardReceipt','selectedPistolVariant'];
const statuses=['available','accepted','recovered','claimed'];
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value);
function closed(value,keys){
 return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
  const d=Object.getOwnPropertyDescriptor(value,key);return !!d&&d.enumerable&&'value'in d;
 });
}
function dense(rows){
 return Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(d=>d&&'value'in d);
}
export function createExpeditionModel({areaIds,expeditionId,rewardVariantId,baseVariantId,receiptId}){
 if(!Array.isArray(areaIds)||!areaIds.length||areaIds.length>128||!dense(areaIds)||areaIds.some(area=>!id(area))||new Set(areaIds).size!==areaIds.length||![expeditionId,rewardVariantId,baseVariantId,receiptId].every(id)||rewardVariantId===baseVariantId)throw TypeError('Invalid expedition catalogue');
 const areas=new Set(areaIds);
 const clone=state=>({...state,visitedIds:[...state.visitedIds]});
 const freshState=()=>({version:1,visitedIds:[],status:'available',rewardReceipt:null,selectedPistolVariant:baseVariantId});
 function valid(state){
  try{
   return closed(state,fields)&&state.version===1&&statuses.includes(state.status)&&Array.isArray(state.visitedIds)&&state.visitedIds.length<=areas.size&&dense(state.visitedIds)&&state.visitedIds.every(area=>areas.has(area))&&new Set(state.visitedIds).size===state.visitedIds.length&&
    (state.status==='claimed'?state.rewardReceipt===receiptId:state.rewardReceipt===null)&&
    (state.selectedPistolVariant===baseVariantId||state.selectedPistolVariant===rewardVariantId&&state.status==='claimed');
  }catch{return false;}
 }
 function copy(state){if(!valid(state))throw TypeError('Invalid expedition state');return clone(state);}
 function restoreState(state){return state===undefined?freshState():valid(state)?clone(state):null;}
 function ownsVariant(state,variantId){return valid(state)&&(variantId===baseVariantId||variantId===rewardVariantId&&state.status==='claimed');}
 // Web validates live location, proximity, survival and objective identity first.
 // Proposals never mutate the live DTO: publish only after the whole-run write.
 function transition(state,action){
  if(!valid(state)||!action)return null;
  const type=Object.getOwnPropertyDescriptor(action,'type');
  if(!type||!('value'in type)||!closed(action,type.value==='visit'?['type','areaId']:type.value==='select'?['type','variantId']:['type']))return null;
  const next=clone(state);
  switch(action.type){
   case 'visit':if(!areas.has(action.areaId))return null;if(!next.visitedIds.includes(action.areaId))next.visitedIds.push(action.areaId);break;
   case 'select':if(!ownsVariant(state,action.variantId))return null;next.selectedPistolVariant=action.variantId;break;
   case 'accept':if(state.status!=='available')return null;next.status='accepted';break;
   case 'recover':if(!['available','accepted'].includes(state.status))return null;next.status='recovered';break;
   case 'claim':if(state.status!=='recovered')return null;next.status='claimed';next.rewardReceipt=receiptId;break;
   default:return null;
  }
  return next;
 }
 return Object.freeze({freshState,restoreState,valid,copy,transition,ownsVariant});
}
