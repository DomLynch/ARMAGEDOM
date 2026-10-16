// Name-only label placement; coordinates are CSS pixels from the live head bone.
export function positionBossLabel(bounds,label,viewport){
 const margin=8,gap=8,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),maxLeft=Math.max(margin,viewport.width-label.width-margin),maxTop=Math.max(margin,viewport.height-label.height-margin);
 const center=(bounds.left+bounds.right)/2,left=clamp(center-label.width/2,margin,maxLeft),above=bounds.top-gap-label.height;
 if(above>=margin)return{left,top:Math.min(above,maxTop)};
 // At the top edge, move beside the silhouette instead of clamping onto it.
 const right=bounds.right+gap,sideLeft=bounds.left-gap-label.width,top=clamp(bounds.top,margin,maxTop);
 if(right<=maxLeft)return{left:Math.max(margin,right),top};if(sideLeft>=margin)return{left:Math.min(maxLeft,sideLeft),top};
 return{left,top:margin};
}
