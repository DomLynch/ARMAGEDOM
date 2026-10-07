import * as T from 'three';
import {prepareSplitCrown} from './finisher-crown.js';
import {prepareOpened as prepareOpenedBody} from './finisher-opened.js';
import {prepareVictimGrounding} from './finisher-grounding.js';

const HEAD_NAMES = ['Photo', 'PhotoEyes', 'PhotoTeeth'];
const PART_LIFETIME = 6;
const ordinary = duration => ({id:'ordinary', clip:'Death', seconds:duration, cost:0, parts:[], prepared:true});
const durationOf = (clips, name) => clips.find(c => c.name === name)?.duration;
const validDuration = n => Number.isFinite(n) && n > 0;
function directionOf(direction) {
  const x=direction?.x, z=direction?.z, length=Math.hypot(x,z);
  return Number.isFinite(length) && length>1e-6 ? {x:x/length,z:z/length} : null;
}

// Spawn/loading preparation, never called from a lethal event. Own static head
// buffers and materials; selected face geometry/maps/skeletons remain borrowed.
function snapshotHead(model, bone, maxVertices) {
  const nodes=HEAD_NAMES.map(name=>model.getObjectByName(name));
  const hair=model.getObjectByName('Scavenger hair');
  if(hair?.visible)nodes.push(hair);
  if(nodes.some(n=>!n?.isSkinnedMesh || !n.visible) ||
     !model.getObjectByName('Recovered_donor_lower_neck') ||
     nodes.reduce((n,o)=>n+o.geometry.attributes.position.count,0)>maxVertices) return null;
  model.updateWorldMatrix(true,true);
  model.updateMatrixWorld(true); // SkinnedMesh refreshes bindMatrixInverse here.
  const inverse=bone.matrixWorld.clone().invert(), group=new T.Group(), geometries=[], materials=[];
  group.name='Prepared detached Hollow head';
  const clean=()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();};
  try {
    for(const node of nodes) {
      node.skeleton.update();
      const source=node.geometry, geometry=new T.BufferGeometry();geometries.push(geometry);
      const worldToHead=inverse.clone().multiply(node.matrixWorld), normalMatrix=new T.Matrix3().getNormalMatrix(worldToHead);
      const indices=source.attributes.skinIndex, weights=source.attributes.skinWeight;
      if(!indices || !weights || Object.values(node.morphTargetInfluences??{}).some(n=>n!==0)) {clean();return null;}
      for(const [name,attr] of Object.entries(source.attributes)) {
        if(name==='skinIndex'||name==='skinWeight')continue;
        const copy=attr.clone();
        if(name==='position'||name==='normal'||name==='tangent') {
          const v=new T.Vector3(), skin=new T.Matrix4(), joint=new T.Matrix4(), bind=node.bindMatrix, unbind=node.bindMatrixInverse;
          for(let i=0;i<attr.count;i++) {
            v.fromBufferAttribute(attr,i);
            if(name==='position')node.applyBoneTransform(i,v).applyMatrix4(worldToHead);
            else {
              skin.elements.fill(0);
              for(let k=0;k<4;k++) {
                const weight=weights.getComponent(i,k);if(!weight)continue;
                joint.fromArray(node.skeleton.boneMatrices,indices.getComponent(i,k)*16);
                for(let j=0;j<16;j++)skin.elements[j]+=joint.elements[j]*weight;
              }
              skin.premultiply(unbind).multiply(bind);
              v.applyMatrix3(new T.Matrix3().setFromMatrix4(skin)).applyMatrix3(normalMatrix).normalize();
            }
            copy.setXYZ(i,v.x,v.y,v.z);
          }
        }
        geometry.setAttribute(name,copy);
      }
      if(source.index)geometry.setIndex(source.index.clone());
      geometry.groups=source.groups.map(g=>({...g}));
      const borrowed=Array.isArray(node.material)?node.material:[node.material], copies=borrowed.map(m=>m.clone());materials.push(...copies);
      const mesh=new T.Mesh(geometry,Array.isArray(node.material)?copies:copies[0]);mesh.name=node.name;mesh.frustumCulled=false;group.add(mesh);
    }
    const photo=group.children[0].geometry;photo.computeBoundingBox();
    const center=photo.boundingBox.getCenter(new T.Vector3()), bottom=photo.boundingBox.min.y;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    const positions=photo.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<bottom+.008) {
      minX=Math.min(minX,positions.getX(i));maxX=Math.max(maxX,positions.getX(i));
      minZ=Math.min(minZ,positions.getZ(i));maxZ=Math.max(maxZ,positions.getZ(i));
    }
    const rim=new T.Vector3((minX+maxX)/2,bottom,(minZ+maxZ)/2);
    const rx=(maxX-minX)/2, rz=(maxZ-minZ)/2;
    if(!(rx>.005&&rz>.005&&rx<.15&&rz<.15)){clean();return null;}
    let radius=0, vertices=0, triangles=0;
    for(const mesh of group.children) {
      mesh.geometry.translate(-center.x,-center.y,-center.z);
      const p=mesh.geometry.attributes.position;vertices+=p.count;
      for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i),p.getY(i),p.getZ(i)));
      triangles+=(mesh.geometry.index?.count??p.count)/3;
      mesh.geometry.computeBoundingSphere();
    }
    // Small opaque wound surfaces fill both neck openings; no whole-body cut.
    const capGeometry=new T.CylinderGeometry(1,1,.003,12), capMaterial=new T.MeshStandardMaterial({color:0x49251f,roughness:1});
    geometries.push(capGeometry);materials.push(capMaterial);
    const cap=new T.Mesh(capGeometry,capMaterial);cap.scale.set(rx,1,rz);cap.position.copy(rim).sub(center);group.add(cap);
    const stump=new T.Mesh(capGeometry,capMaterial);stump.scale.set(rx,1,rz);stump.position.copy(rim);stump.visible=false;bone.add(stump);
    return {group,stump,nodes,center,radius,vertices,triangles:triangles+48,geometries,materials,
      dispose(){stump.removeFromParent();group.removeFromParent();clean();}};
  } catch(error) {clean();throw error;}
}

// Presentation only: caller selects a confirmed lethal outcome and still owns
// damage/rewards/removal and clip sampling. ARM x/z direction is converted only
// for detached render-space motion. One actor, one head, finite lifetime.
export function createFinisherPresentation({root,model,clips,scene,groundY=0,isBlocked,
  isPlayer=false,prepareHead=true,maxVertices=24000,prepareCrown=false,maxCrownVertices=100000,prepareOpened=false,maxOpenedVertices=300000,prepareRunThrough=false}={}) {
  const death=durationOf(clips,'Death'), hit=durationOf(clips,'Hit'), cut=durationOf(clips,'Death_SplitCrown'), runThrough=durationOf(clips,'Death_RunThrough');
  if(!validDuration(death))throw new TypeError('Finisher presentation requires a native Death clip');
  const support=[], bone=model.getObjectByName('Head'),torso=model.getObjectByName('spine_01'),anchorPoint=new T.Vector3();
  let runGrounding=null,runPreparationError=null;const runScale=new T.Vector3();
  if(!isPlayer&&prepareRunThrough&&model.getObjectByName('Photo')&&model.getObjectByName('pelvis')&&validDuration(runThrough)&&runThrough<=1.25){try{runGrounding=prepareVictimGrounding({model,root,clip:clips.find(c=>c.name==='Death_RunThrough')});support.push({id:'run-through',clip:'Death_RunThrough',seconds:runThrough,cost:0,parts:[],prepared:true,requiresGroundLift:true});}catch(error){runPreparationError=error.message;}}
  let head=null, crown=null, opened=null, openedActive=false, openedShown=false, openedPreparationError=null, crownActive=false, crownPreparationError=null, preparationError=null;
  if(!isPlayer&&prepareHead&&bone&&scene?.isScene&&Number.isFinite(groundY)&&typeof isBlocked==='function') {
    try{head=snapshotHead(model,bone,maxVertices);}catch(error){preparationError=error.message;}
  }
  if(!isPlayer&&validDuration(death)&&validDuration(hit)) support.push({id:'pistol-directional',clip:'Death',reactionClip:'Hit',reactionSeconds:hit,seconds:hit+death,cost:0,parts:[],prepared:true});
  if(head&&validDuration(hit))support.push({id:'pistol-decapitation',clip:'Death',reactionClip:'Hit',reactionSeconds:hit,seconds:hit+death,cost:1,parts:['head'],prepared:true,lifetime:PART_LIFETIME});
  if(head&&prepareCrown&&validDuration(cut)){try{crown=prepareSplitCrown(head,{maxVertices:maxCrownVertices});support.push({id:'split-crown',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['crown'],prepared:true,lifetime:PART_LIFETIME});}catch(error){crownPreparationError=error.message;}}
  if(!isPlayer&&prepareOpened&&validDuration(cut)){try{opened=prepareOpenedBody({model,root,clips,groundY,isBlocked,maxVertices:maxOpenedVertices});support.push({id:'opened',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['upper-body'],prepared:true,lifetime:PART_LIFETIME});}catch(error){openedPreparationError=error.message;}}
  if(head&&validDuration(cut))support.push({id:'decapitation',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['head'],prepared:true,lifetime:PART_LIFETIME});
  let chosen=null, recipe=ordinary(validDuration(death)?death:2.4), direction=null, disposed=false, detached=false, expired=false;
  const velocity=new T.Vector3(), spin=new T.Vector3(), axis=new T.Vector3(), matrix=new T.Matrix4();
  const visible=[];
  function expire(){if(expired)return;expired=true;head?.group.removeFromParent();crown?.group.removeFromParent();opened?.group.removeFromParent();if(openedActive){for(const[node,value]of visible)node.visible=value;openedActive=false;}}
  return {
    support,
    start(outcome) {
      if(disposed||chosen)return recipe;
      chosen=outcome;direction=directionOf(outcome?.direction??outcome?.impactDirection);
      const candidate=support.find(s=>s.id===outcome?.recipeId);
      const eligible=direction&&candidate&&(candidate.id.startsWith('pistol-')?outcome.damageType==='bullet':candidate.id==='run-through'?outcome.damageType==='piercing':outcome.damageType==='cutting');
      recipe=eligible&&!(candidate.id==='opened'&&!opened.canStart())?candidate:ordinary(validDuration(death)?death:2.4);
      if(recipe.id==='opened'){root.add(opened.group);opened.group.visible=false;openedActive=true;}
      if(recipe.id==='split-crown'){bone.add(crown.group);crown.open(0);for(const node of head.nodes){visible.push([node,node.visible]);node.visible=false;}crownActive=true;}
      if(recipe.parts.includes('head')) {
        root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
        matrix.copy(bone.matrixWorld).multiply(new T.Matrix4().makeTranslation(...head.center.toArray()));
        matrix.decompose(head.group.position,head.group.quaternion,head.group.scale);
        head.group.matrixAutoUpdate=false;head.group.matrix.copy(matrix);head.group.matrixWorldNeedsUpdate=true;
        scene.add(head.group);head.stump.visible=true;
        for(const node of head.nodes){visible.push([node,node.visible]);node.visible=false;}
        velocity.set(direction.x*1.6,1.8,-direction.z*1.6);spin.set(-direction.z,0,-direction.x).normalize().multiplyScalar(6);
        detached=true;
      }
      return recipe;
    },
    pose(age) {
      const elapsed=Math.max(0,Number.isFinite(age)?age:0);
      if(expired&&recipe.id==='opened')return{clip:'Death',phase:.999999,offset:{x:0,z:0}};
      if(recipe.reactionClip==='Hit'&&elapsed<hit) {
        const amount=.1*Math.sin(Math.PI*elapsed/hit), proposed={x:direction.x*amount,z:direction.z*amount};
        const origin={x:root.position.x,z:-root.position.z};
        const offset=typeof isBlocked==='function'&&!isBlocked({x:origin.x+proposed.x,z:origin.z+proposed.z},.2)?proposed:{x:0,z:0};
        return {clip:'Hit',phase:Math.min(.999999,elapsed/hit),offset};
      }
      const offset={x:0,z:0}, clip=recipe.clip, clipSeconds=durationOf(clips,clip);
      const phase=Math.min(.999999,Math.max(0,elapsed-(recipe.reactionClip==='Hit'?hit:0))/clipSeconds);root.getWorldScale(runScale);return {clip,phase,offset,groundLift:recipe.id==='run-through'?runGrounding.lift(phase)*runScale.y:0};
    },
    update(age,dt) {
      if(disposed||expired)return;
      if(openedActive){if(age>=PART_LIFETIME){expire();return;}if(age>=.045){if(!openedShown){for(const node of opened.nodes){visible.push([node,node.visible]);node.visible=false;}openedShown=true;opened.group.visible=true;}opened.update(T.MathUtils.clamp(age/cut,0,1));}return;}
      if(crownActive){if(age>=PART_LIFETIME){expire();return;}const t=T.MathUtils.clamp((age-.045)/.12,0,1);crown.open(t*t*(3-2*t));return;}
      if(!detached)return;
      if(age>=PART_LIFETIME){expire();return;}
      const elapsed=Math.min(PART_LIFETIME,Math.max(0,Number.isFinite(dt)?dt:0));
      const steps=Math.min(6,Math.ceil(elapsed*60)), step=steps?elapsed/steps:0;
      const radius=head.radius*Math.max(head.group.scale.x,head.group.scale.y,head.group.scale.z);
      for(let i=0;i<steps;i++) {
        velocity.y-=9.8*step;
        const x=head.group.position.x+velocity.x*step,z=head.group.position.z+velocity.z*step;
        if(!isBlocked({x,z:-z},radius,{x:head.group.position.x,z:-head.group.position.z})){head.group.position.x=x;head.group.position.z=z;}else {velocity.x=0;velocity.z=0;}
        head.group.position.y+=velocity.y*step;
        if(head.group.position.y<groundY+radius){head.group.position.y=groundY+radius;velocity.y=velocity.y<-1?-velocity.y*.22:0;velocity.x*=.65;velocity.z*=.65;spin.multiplyScalar(.8);}
        const rate=spin.length();if(rate>.02){axis.copy(spin).multiplyScalar(1/rate);matrix.makeRotationAxis(axis,rate*step);head.group.matrix.premultiply(matrix);}
        head.group.matrix.setPosition(head.group.position);head.group.matrixWorldNeedsUpdate=true;
      }
    },
    impactAnchors(age){
      if(disposed||expired||!chosen||recipe.id==='ordinary')return null;
      if((recipe.id==='opened'&&!openedShown)||(recipe.id==='split-crown'&&age<=.045))return null;
      root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
      const at=node=>{if(!node)return null;node.updateWorldMatrix(true,false);node.getWorldPosition(anchorPoint);return{x:anchorPoint.x,y:anchorPoint.y,z:anchorPoint.z};};
      const capAt=mesh=>{if(!mesh?.geometry.boundingSphere)return null;mesh.updateWorldMatrix(true,false);anchorPoint.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);return{x:anchorPoint.x,y:anchorPoint.y,z:anchorPoint.z};};
      if(recipe.id==='opened'){const upper=at(opened.group.getObjectByName('OpenedTorso')),lower=at(opened.group.getObjectByName('OpenedLegs'));return upper?{body:upper,trails:[upper,lower??upper]}:null;}
      if(recipe.id==='split-crown'){const left=capAt(crown.caps.find(m=>m.parent===crown.halves[0])),right=capAt(crown.caps.find(m=>m.parent===crown.halves[1]));return left?{head:left,trails:[left,right??left]}:null;}
      if(recipe.parts.includes('head')){const seam=at(head.stump),detachedCap=head.group.children.find(n=>n.geometry===head.stump.geometry);return seam?{head:seam,trails:[at(detachedCap)??seam,seam]}:null;}
      const body=at(torso);return body?{body,trails:[body]}:null;
    },
    stats(){return {prepared:!!head,preparationError,vertices:head?.vertices??0,triangles:head?.triangles??0,ownedGeometries:head?.geometries.length??0,ownedMaterials:head?.materials.length??0,lethalVertexCopies:0,detached,expired,crownPrepared:!!crown,crownActive,crownPreparationError,crown:crown?.stats()??null,openedPrepared:!!opened,openedActive,openedPreparationError,opened:opened?.stats()??null,runGrounding:runGrounding?.stats()??null,runPreparationError,activePartCost:expired?0:(openedActive||crownActive||detached?recipe.cost:0)};},
    dispose(){if(disposed)return;disposed=true;expire();for(const[node,value]of visible)node.visible=value;opened?.dispose();opened=null;crown?.dispose();crown=null;head?.dispose();head=null;support.length=0;},
  };
}
