import {WESTMINSTER_ATMOSPHERE} from './atmosphere-westminster.js';

// Original painting coordinates, Y down. Overrides are for distinct painted sizes.
export const ATMOSPHERE_PRESETS=Object.freeze({
  'light-smoulder':Object.freeze({width:.018,rise:.050,smoke:3,opacity:.35,smokeColor:[.57,.54,.49],fireWidth:0,fireHeight:0,embers:0}),
  'heavy-smoke':Object.freeze({width:.024,rise:.065,smoke:4,opacity:.28,smokeColor:[.32,.30,.27],fireWidth:0,fireHeight:0,embers:0}),
  'small-fire':Object.freeze({width:.011,rise:.035,smoke:0,opacity:0,fireWidth:.007,fireHeight:.026,embers:1}),
  'structural-fire':Object.freeze({width:.016,rise:.055,smoke:2,opacity:.16,fireWidth:.011,fireHeight:.036,embers:2}),
  'fire-with-smoke':Object.freeze({width:.016,rise:.048,smoke:2,opacity:.22,fireWidth:.008,fireHeight:.032,embers:1})
});
const placement=(id,preset,x,y,foot,seed,overrides={})=>Object.freeze({id,preset,x,y,foot:foot?Object.freeze(foot):null,depth:foot?null:80,seed,scale:1,intensity:1,...overrides});
export const AREA_ATMOSPHERE=Object.freeze({
  // Exact061 footprints/numeric settings, no seeded variation of approved art.
  westminster:Object.freeze(WESTMINSTER_ATMOSPHERE.map((a,i)=>Object.freeze({...a,preset:a.id==='bus-roof'?'light-smoulder':a.smoke?'fire-with-smoke':'small-fire',seed:100+i,scale:1,intensity:1,preserve:true}))),
  east:Object.freeze([
    placement('east-bus-smoulder','light-smoulder',.560,.275,{x:.56,y:.37},201,{width:.022,rise:.056,opacity:.30}),
    placement('east-near-drum','small-fire',.163,.625,{x:.17,y:.68},202),
    placement('east-near-lower-drum','fire-with-smoke',.156,.672,{x:.17,y:.72},203,{fireWidth:.006,fireHeight:.022,width:.013,rise:.042}),
    placement('east-midbridge-drum','fire-with-smoke',.410,.365,{x:.42,y:.40},204,{fireWidth:.006,fireHeight:.022,width:.011,rise:.035}),
    placement('east-bank-drum','small-fire',.834,.327,{x:.835,y:.37},205,{fireWidth:.006,fireHeight:.021}),
    placement('east-bank-edge-drum','fire-with-smoke',.971,.414,{x:.97,y:.46},206,{fireWidth:.006,fireHeight:.024,width:.012,rise:.040}),
    placement('east-building-breach','structural-fire',.850,.153,null,207,{fireWidth:.009,fireHeight:.030,width:.013,rise:.045})
  ]),
  south:Object.freeze([
    placement('south-central-drum','fire-with-smoke',.444,.383,{x:.46,y:.46},301,{fireWidth:.008,fireHeight:.030}),
    placement('south-near-drum','fire-with-smoke',.389,.730,{x:.40,y:.79},302,{fireWidth:.008,fireHeight:.032,width:.016,rise:.050}),
    placement('south-bus-smoulder','light-smoulder',.778,.611,{x:.79,y:.82},303,{opacity:.27,width:.025,rise:.050}),
    placement('south-upper-wreck','heavy-smoke',.596,.115,{x:.60,y:.19},304,{width:.016,rise:.047,opacity:.22,smoke:3}),
    placement('south-left-rubble-fire','small-fire',.040,.369,{x:.10,y:.42},305,{fireWidth:.006,fireHeight:.022}),
    placement('south-distant-breach','structural-fire',.975,.273,null,306,{fireWidth:.006,fireHeight:.019,width:.010,rise:.030})
  ])
});
const BUDGETS=Object.freeze({westminster:Object.freeze({quads:28,drawCalls:3,textureBytes:0}),east:Object.freeze({quads:28,drawCalls:3,textureBytes:0}),south:Object.freeze({quads:28,drawCalls:3,textureBytes:0})});
const empty=Object.freeze([]),emptyBudget=Object.freeze({quads:0,drawCalls:0,textureBytes:0});
export const atmosphereBudget=area=>BUDGETS[area]??emptyBudget;
// Pure deterministic resolution: stable through re-entry, reset and reload.
export function atmosphereForArea(area){
  return (AREA_ATMOSPHERE[area]??empty).map(p=>{
    if(p.preserve)return p;
    const base={...ATMOSPHERE_PRESETS[p.preset],...p};
    let state=p.seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const size=.94+random()*.12,rise=.93+random()*.14,phase=random(),offset=random()*7;
    const tint=(base.smokeColor??[.095,.085,.075]).map(c=>Math.max(0,Math.min(1,c*(.97+random()*.06))));
    return {...base,width:base.width*p.scale*size,rise:base.rise*p.scale*rise,fireWidth:base.fireWidth*p.scale,fireHeight:base.fireHeight*p.scale*(.96+random()*.08),opacity:base.opacity*p.intensity*(.96+random()*.08),smokeColor:tint,smokeSpeed:(1/7)*(.92+random()*.16),phase,noiseOffset:offset,wind:(area==='east'?.45:.30)+random()*.12};
  });
}
