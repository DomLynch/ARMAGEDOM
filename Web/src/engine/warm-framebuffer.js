import {Vector4} from 'three';
//  reuse the player's framebuffer shader variants without writing pixels.
// All mutable renderer state is restored synchronously; no await inside this scope.
export function warmFramebuffer(renderer,scene,camera){
 const target=renderer.getRenderTarget(),viewport=renderer.getViewport(new Vector4()),scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
 try{
  renderer.setRenderTarget(null);
  renderer.autoClear=false;
  renderer.setViewport(0,0,1,1);
  renderer.setScissor(0,0,0,0);
  renderer.setScissorTest(true);
  renderer.render(scene,camera);
 }finally{
  renderer.setRenderTarget(target);
  renderer.setViewport(viewport);
  renderer.setScissor(scissor);
  renderer.setScissorTest(scissorTest);
  renderer.autoClear=autoClear;
 }
}
