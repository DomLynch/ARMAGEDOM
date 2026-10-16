import{Vector3}from'three';
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

// Share the established name-only placement with named guards, following their animated head.
export function createHeadLabelPositioner(){
 const heads=new WeakMap(),point=new Vector3();
 return(view,label,camera,viewport)=>{
  if(!view)return null;let head=heads.get(view);
  if(!head){view.model.traverse(o=>{if(o.isBone&&o.name.toLowerCase()==='head')head=o;});if(head)heads.set(view,head);}
  if(!head)return null;head.getWorldPosition(point).project(camera);
  if(point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1)return null;
  const x=(point.x+1)*viewport.width/2,y=(1-point.y)*viewport.height/2,margin=label.height;
  return positionBossLabel({left:x-margin,right:x+margin,top:y-margin,bottom:y+margin},label,viewport);
 };
}
