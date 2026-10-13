// Codec-specific equality only: not a second ledger, dirty flag or save writer.
// Include restore's validation inputs, not transient position/action clocks.
function data(object,key){
 const descriptor=Object.getOwnPropertyDescriptor(object,key);
 if(descriptor&&!('value' in descriptor))throw TypeError('Accessor cannot be cached');
 return descriptor?.value;
}
function projection(g){
 const player=data(g,'player'),pistol=data(g,'pistol');
 return {hp:data(player,'hp'),maxHP:data(player,'maxHP'),
  pistol:{collected:data(pistol,'collected'),equipped:data(pistol,'equipped'),magazine:data(pistol,'magazine'),reserve:data(pistol,'reserve')},
  supplies:data(g,'supplies'),vest:data(g,'vest')??{version:1,itemId:'westminster-worn-vest-v1',equipped:false},
  droneDeaths:data(g,'droneDeaths')??[],animalCycle:data(g,'animalCycle')??'A',lootRules:data(g,'lootRules')};
}
function capture(value,seen){
 if(value===null||typeof value!=='object'){
  if(['function','symbol','bigint'].includes(typeof value))throw TypeError('Unsupported snapshot value');
  return {scalar:value};
 }
 const prototype=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null||seen.has(value))throw TypeError('Unsupported snapshot object');
 seen.add(value);
 const keys=Object.keys(value),values=keys.map(key=>capture(data(value,key),seen));
 seen.delete(value);
 return {prototype,keys,values,length:Array.isArray(value)?value.length:null,
  immutable:Object.isFrozen(value)&&values.every(v=>Object.hasOwn(v,'scalar')||v.immutable),original:value};
}
function same(value,snapshot){
 if(Object.hasOwn(snapshot,'scalar'))return Object.is(value,snapshot.scalar);
 if(snapshot.immutable&&value===snapshot.original)return true;
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==snapshot.prototype||snapshot.length!==null&&value.length!==snapshot.length)return false;
 let count=0;for(const key in value)if(Object.hasOwn(value,key))count++;
 if(count!==snapshot.keys.length)return false;
 return snapshot.keys.every((key,i)=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return !!descriptor?.enumerable&&'value' in descriptor&&same(descriptor.value,snapshot.values[i]);
 });
}
export const captureRunState=g=>capture(projection(g),new Set());
export const isRunStateUnchanged=(g,snapshot)=>same(projection(g),snapshot);
