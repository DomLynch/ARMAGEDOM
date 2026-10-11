import {createAreaRegistry} from '../area-registry.js';
import {closed,freeze,validateResidentPlacements} from './area-content.js';
// Explicit private entry isolates both current and legacy save keys before IO.
export function preparePrivateAreaContent(content){
 closed(content,['areas','manifest','residents','layouts','namespace','textureBudgetBytes']);
 if(typeof content.namespace!=='string'||!/^armagedom:private:[a-z0-9-]+:$/.test(content.namespace)||!Number.isFinite(content.textureBudgetBytes)||content.textureBudgetBytes<16*1024*1024||content.textureBudgetBytes>48*1024*1024)throw Error('Invalid private area content');
 const registry=createAreaRegistry({areas:content.areas,manifest:content.manifest,includePrivate:true});
 if(!registry.ids.some(id=>registry.get(id).visibility==='private'))throw Error('Private area required');
 return Object.freeze({registry,manifest:freeze(structuredClone(content.manifest)),residents:validateResidentPlacements(content.residents,registry,content.layouts,{visibility:'private'}),layouts:freeze(structuredClone(content.layouts)),namespace:content.namespace,textureBudgetBytes:content.textureBudgetBytes});
}
export function namespacedRunStorage(storage,namespace){if(!storage)return null;return Object.freeze({getItem:key=>storage.getItem(namespace+key),setItem:(key,value)=>storage.setItem(namespace+key,value)});}
