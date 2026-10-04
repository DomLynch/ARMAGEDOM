// Normalized coordinates on the unchanged 1672 x 941 Westminster painting.
// Bus: blackened roof, smoke ONLY. Other anchors: visible painted fire bases.
export const WESTMINSTER_ATMOSPHERE = Object.freeze([
  Object.freeze({id:'bus-roof',x:.425,y:.287,foot:Object.freeze({x:.42,y:.415}),depth:null,width:.019,rise:.043,smoke:3,opacity:.12,fireWidth:0,fireHeight:0,embers:0}),
  Object.freeze({id:'tower-breach',x:.751,y:.159,depth:80,width:.012,rise:.047,smoke:2,opacity:.16,fireWidth:.009,fireHeight:.035,embers:2}),
  Object.freeze({id:'riverside-wreck-fire',x:.791,y:.594,foot:Object.freeze({x:.80,y:.67}),depth:null,width:.021,rise:.08,smoke:3,opacity:.22,fireWidth:.011,fireHeight:.046,embers:2}),
  Object.freeze({id:'riverside-fire-drum',x:.777,y:.550,foot:Object.freeze({x:.80,y:.67}),depth:null,width:.01,rise:.035,smoke:0,opacity:0,fireWidth:.008,fireHeight:.030,embers:1}),
  Object.freeze({id:'parliament-base-fire',x:.452,y:.259,depth:80,width:.012,rise:.032,smoke:2,opacity:.13,fireWidth:.011,fireHeight:.029,embers:1}),
  Object.freeze({id:'parliament-west-blaze',x:.348,y:.215,depth:80,width:.017,rise:.06,smoke:2,opacity:.18,fireWidth:.011,fireHeight:.043,embers:3})
]);
export const ATMOSPHERE_BUDGET = Object.freeze({quads:26,drawCalls:3,textureBytes:0});
