import * as T from 'three';

// One cached canvas on the existing registered image stage. Currency is read
// from MARKED; this view never grants, saves, or changes a bounty.
export function paintWanted(canvas,portrait,bounty){
 const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
 c.fillStyle='#e5e5df';c.textAlign='center';c.font='700 82px monospace';c.fillText('WANTED',192,100);
 c.globalAlpha=.86;c.drawImage(portrait,64,170,256,320);c.globalAlpha=1;
 const amount='$'+bounty.toLocaleString('en-US');c.font='700 92px monospace';const width=c.measureText(amount).width;if(width>300)c.font=`700 ${Math.floor(92*300/width)}px monospace`;c.fillText(amount,192,625);
 c.globalAlpha=.4;c.fillRect(40,125,304,2);c.fillRect(64,655,256,2);c.globalAlpha=1;
 // Fixed wear, repainted only with changed content, never frame-by-frame noise.
 c.globalCompositeOperation='destination-out';
 for(let n=0;n<140;n++){const x=(n*193+31)%384,y=(n*271+67)%700;c.fillStyle=`rgba(0,0,0,${.1+(n%4)*.06})`;c.fillRect(x,y,1+n%3,1);}
 for(let n=0;n<9;n++){c.fillStyle='rgba(0,0,0,.12)';c.fillRect(25+(n*71)%250,140+n*51,45+n%4*9,1);}
 c.globalCompositeOperation='source-over';
}

export function createWantedMesh(world,data,texture){
 const material=new T.MeshBasicMaterial({map:texture,color:0xdce2ca,transparent:false,opacity:data.opacity,blending:T.AdditiveBlending,depthTest:false,depthWrite:false,side:T.DoubleSide,toneMapped:false});
 // Additive blending retains texture alpha, but the opaque render queue is
 // intentional: transparent-list quads run after actors regardless of order.
 // Draw after the registered photograph and before its authored depth masks.
 // Existing actor/depth rendering therefore still places foreground actors in front.
 const mesh=world.quad(data.points,100,material,-95,true);
 mesh.geometry.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));
 mesh.name='WANTED wall projection';mesh.userData={areaId:data.areaId,bounty:null,textureUpdates:0};return mesh;
}

export function createWantedProjection(s){
 let world=null,mesh=null,canvas=null,texture=null,portrait=null,pending=null,failed=false,disposed=false,lastBounty=null,paints=0;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 function clear(){if(mesh){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();mesh=null;}world=null;}
 function load(data,w){if(pending||portrait||failed)return;const image=new Image();image.decoding='async';pending=new Promise((resolve,reject)=>{image.onload=()=>resolve(image);image.onerror=reject;image.src=new URL('world/'+data.portrait,w.baseUrl).href;}).then(value=>{if(!disposed){portrait=value;update();}}).catch(()=>{failed=true;}).finally(()=>pending=null);}
 function update(){
  if(disposed)return;const w=s.world,g=s.game,settings=w?.markedData,data=settings?.projections?.[w.areaId]??settings?.projection;
  if(mesh&&(world!==w||mesh.parent!==w.group))clear();
  if(!data||w.areaId!==data.areaId||!g?.marked||g.runSaveInvalid){if(mesh)mesh.visible=false;return;}
  if(g.marked.bounty<=0){if(mesh)mesh.visible=false;return;}
  if(!portrait){load(data,w);return;}
  if(!canvas){canvas=document.createElement('canvas');canvas.width=384;canvas.height=768;texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;}
  if(!mesh){world=w;mesh=createWantedMesh(w,data,texture);}
  if(lastBounty!==g.marked.bounty){paintWanted(canvas,portrait,g.marked.bounty);texture.needsUpdate=true;lastBounty=g.marked.bounty;paints++;}
  mesh.visible=true;mesh.userData.bounty=g.marked.bounty;mesh.userData.textureUpdates=paints;
  const t=g.time??0;mesh.material.opacity=data.opacity*(reduced?.matches?1:1+data.flicker*(Math.sin(t*17)+Math.sin(t*43))*.5);
 }
 return{update,dispose(){disposed=true;clear();texture?.dispose();texture=null;canvas=portrait=null;}};
}
