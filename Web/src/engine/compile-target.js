// Three captures the current render target synchronously during compileAsync.
// Restore it before awaiting, so live frames never inherit the hidden target.
export async function compileTargetVariant(renderer,scene,camera,target,isCurrent=()=>true){
 if(!isCurrent())return false;
 const previous=renderer.getRenderTarget();let pending;
 try{renderer.setRenderTarget(target);pending=renderer.compileAsync(scene,camera,scene);}
 finally{renderer.setRenderTarget(previous);}
 await pending;return isCurrent();
}
