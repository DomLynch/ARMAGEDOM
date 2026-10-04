// Only this pilot's ownership and finite ammunition; no inventory/run framework.
export const PISTOL_SAVE_KEY='armagedom:pistol:v1';
export function encodePistol(state){return JSON.stringify({version:1,pickupId:'westminster-start-pistol-v1',collected:state.collected,equipped:state.equipped,magazine:state.magazine,reserve:state.reserve});}
export function restorePistol(state,raw){
 if(raw==null)return state;
 let saved;try{saved=JSON.parse(raw)}catch{return null}
 if(!saved||saved.version!==1||saved.pickupId!=='westminster-start-pistol-v1'||typeof saved.collected!=='boolean'||typeof saved.equipped!=='boolean'||!Number.isInteger(saved.magazine)||saved.magazine<0||saved.magazine>6||!Number.isInteger(saved.reserve)||saved.reserve<0||saved.reserve>12||(!saved.collected&&(saved.equipped||saved.magazine||saved.reserve)))return null;
 return {...state,collected:saved.collected,equipped:saved.equipped,magazine:saved.magazine,reserve:saved.reserve,reloadingUntil:0,nextFireAt:0};
}
