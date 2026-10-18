import {FINISHER_DATA,FLAME_DEATH_DATA,finisherDefinition,finisherPresentationId,withFinisherAliases} from './engine/finisher-data.js';
import * as T from 'three';
import {nativeFinisherSupport} from './engine/finisher-cosmetics.js';
import {prepareSplitCrownSteps} from './finisher-crown.js';
import {prepareOpenedSteps} from './finisher-opened.js';
import {prepareVictimGroundingSteps} from './finisher-grounding.js';

const HEAD_NAMES = ['Photo', 'PhotoEyes', 'PhotoTeeth'];
export function validateHeadParts(parts=HEAD_NAMES){
  if(!Array.isArray(parts)||parts.length<3||parts.length>12||parts[0]!=='Photo'||new Set(parts).size!==parts.length||HEAD_NAMES.some(name=>!parts.includes(name))||Array.from(parts).some(name=>typeof name!=='string'||!/^\w{1,64}$/.test(name)))throw new TypeError('Invalid authored head parts');
  return [...parts];
}
const PART_LIFETIME = FINISHER_DATA.limits.partLifetime;
// Brief victim pose emphasis. Detached-part physics and expiry use real age.
export function finisherVictimPoseAge(age,{enabled=true,restored=false}={}) {
  return enabled&&!restored ? age-.25*Math.min(.2,Math.max(0,age)) : age;
}
export function presentedSeverFlash(entity,{started=false,activePartCost=0}={}) {
  const recipe=entity?.finisher;
  return Number.isFinite(entity?.hp)&&entity.hp<=0&&started===true&&activePartCost>0
    &&recipe?.cost>0&&['decapitation','pistol-decapitation','split-crown','opened'].includes(finisherPresentationId(recipe.recipeId))
    &&Array.isArray(recipe.parts)&&recipe.parts.some(p=>['head','crown','upper-body'].includes(p));
}
const ordinary = duration => ({id:'ordinary', clip:'Death', seconds:duration, cost:0, parts:[], prepared:true});
const durationOf = (clips, name) => clips.find(c => c.name === name)?.duration;
const validDuration = n => Number.isFinite(n) && n > 0;
function directionOf(direction) {
  const x=direction?.x, z=direction?.z, length=Math.hypot(x,z);
  return Number.isFinite(length) && length>1e-6 ? {x:x/length,z:z/length} : null;
}

// Spawn/loading preparation, never called from a lethal event. Own static head
// buffers and materials; selected face geometry/maps/skeletons remain borrowed.
function* snapshotHeadSteps(model, bone, maxVertices, headParts) {
  const nodes=headParts.map(name=>model.getObjectByName(name));
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
  let completed=false,since=performance.now();
  try {
    for(const node of nodes) {
      node.skeleton.update();
      const source=node.geometry, geometry=new T.BufferGeometry();geometries.push(geometry);
      const worldToHead=inverse.clone().multiply(node.matrixWorld), normalMatrix=new T.Matrix3().getNormalMatrix(worldToHead);
      const indices=source.attributes.skinIndex, weights=source.attributes.skinWeight;
      if(!indices || !weights || Object.values(node.morphTargetInfluences??{}).some(n=>n!==0)) return null;
      for(const [name,attr] of Object.entries(source.attributes)) {
        if(name==='skinIndex'||name==='skinWeight')continue;
        const copy=attr.clone();
        if(name==='position'||name==='normal'||name==='tangent') {
          const v=new T.Vector3(), skin=new T.Matrix4(), joint=new T.Matrix4(), bind=node.bindMatrix, unbind=node.bindMatrixInverse;
          for(let i=0;i<attr.count;i++) {
            if((i&127)===0&&performance.now()-since>=4){yield 'head-snapshot';since=performance.now();}
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
    if(!(rx>.005&&rz>.005&&rx<.15&&rz<.15))return null;
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
    completed=true;return {group,stump,nodes,headParts,center,radius,vertices,triangles:triangles+48,geometries,materials,
      dispose(){stump.removeFromParent();group.removeFromParent();clean();}};
  } finally {if(!completed)clean();}
}

// Presentation only: caller selects a confirmed lethal outcome and still owns
// damage/rewards/removal and clip sampling. ARM x/z direction is converted only
// for detached render-space motion. One actor, one head, finite lifetime.
export function createFinisherPresentation(options){const steps=createFinisherPresentationSteps(options);for(;;){const step=steps.next();if(step.done)return step.value;}}
export function* createFinisherPresentationSteps({root,model,clips,scene,groundY=0,isBlocked,
  rig=null,isPlayer=false,prepareHead=true,maxVertices=24000,prepareCrown=false,maxCrownVertices=100000,prepareOpened=false,maxOpenedVertices=300000,prepareRunThrough=false,groundingCache=null,headParts=HEAD_NAMES}={}) {
  headParts=validateHeadParts(headParts);
  const death=durationOf(clips,'Death'), hit=durationOf(clips,'Hit'), cut=durationOf(clips,'Death_SplitCrown'), runThrough=durationOf(clips,'Death_RunThrough');
  if(!validDuration(death))throw new TypeError('Finisher presentation requires a native Death clip');
  const support=isPlayer?[]:nativeFinisherSupport({clip:'Death',seconds:death}), bone=model.getObjectByName('Head'),torso=model.getObjectByName('spine_01'),anchorPoint=new T.Vector3(),anchorNormal=new T.Vector3();
  let runGrounding=null,runPreparationError=null,completed=false;const runScale=new T.Vector3();
  let head=null, crown=null, opened=null, openedActive=false, openedShown=false, openedPreparationError=null, crownActive=false, crownPreparationError=null, preparationError=null;
  try {
  if(!isPlayer&&prepareRunThrough&&model.getObjectByName('Photo')&&model.getObjectByName('pelvis')&&validDuration(runThrough)&&runThrough<=1.25){try{runGrounding=yield* prepareVictimGroundingSteps({model,root,clip:clips.find(c=>c.name==='Death_RunThrough'),cache:groundingCache});support.push({id:'run-through',clip:'Death_RunThrough',seconds:runThrough,cost:0,parts:[],prepared:true,requiresGroundLift:true});}catch(error){runPreparationError=error.message;}}
  if(!isPlayer&&prepareHead&&bone&&scene?.isScene&&Number.isFinite(groundY)&&typeof isBlocked==='function') {
    try{head=yield* snapshotHeadSteps(model,bone,maxVertices,headParts);}catch(error){preparationError=error.message;}
  }
  if(!isPlayer&&validDuration(death)&&validDuration(hit)) support.push({id:'pistol-directional',clip:'Death',reactionClip:'Hit',reactionSeconds:hit,seconds:hit+death,cost:0,parts:[],prepared:true});
  if(head&&validDuration(hit))support.push({id:'pistol-decapitation',clip:'Death',reactionClip:'Hit',reactionSeconds:hit,seconds:hit+death,cost:1,parts:['head'],prepared:true,lifetime:PART_LIFETIME});
  if(head&&prepareCrown&&validDuration(cut)){try{crown=yield* prepareSplitCrownSteps(head,{maxVertices:maxCrownVertices});support.push({id:'split-crown',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['crown'],prepared:true,lifetime:PART_LIFETIME});}catch(error){crownPreparationError=error.message;}}
  if(!isPlayer&&prepareOpened&&validDuration(cut)){try{opened=yield* prepareOpenedSteps({model,root,clips,groundY,isBlocked,maxVertices:maxOpenedVertices});support.push({id:'opened',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['upper-body'],prepared:true,lifetime:PART_LIFETIME});}catch(error){openedPreparationError=error.message;}}
  if(head&&validDuration(cut))support.push({id:'decapitation',clip:'Death_SplitCrown',seconds:cut,cost:1,parts:['head'],prepared:true,lifetime:PART_LIFETIME});
  support.splice(0,support.length,...withFinisherAliases(support));
  let chosen=null, recipe=ordinary(validDuration(death)?death:2.4), direction=null, disposed=false, detached=false, expired=false;
  const velocity=new T.Vector3(), spin=new T.Vector3(), axis=new T.Vector3(), matrix=new T.Matrix4();
  const visible=[];
  function expire(){if(expired)return;expired=true;head?.group.removeFromParent();crown?.group.removeFromParent();opened?.group.removeFromParent();if(openedActive){for(const[node,value]of visible)node.visible=value;openedActive=false;}}
  const ownedGeometryBytes=(head?.geometries??[]).reduce((bytes,g)=>bytes+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0),0)+(crown?.stats().geometryBytes??0)+(opened?.stats().geometryBytes??0);
  completed=true;
  return {
    support,
    setScene(next){if(!next?.isScene)throw Error('Finisher scene missing');scene=next;},
    setDormant(value){if(value)head?.group.removeFromParent();else if(detached&&!expired)scene.add(head.group);},
    start(outcome) {
      if(disposed||chosen)return recipe;
      chosen=outcome;direction=directionOf(outcome?.direction??outcome?.impactDirection);
      const candidate=support.find(s=>s.id===outcome?.recipeId);
      const nativeFallback=FINISHER_DATA.bindings.some(b=>b.fallback===candidate?.id),eligible=candidate&&(direction||nativeFallback)&&outcome.damageType===finisherDefinition(candidate.id)?.damageType;
      const fallbackId=FINISHER_DATA.bindings.find(b=>finisherDefinition(b.fallback)?.damageType===outcome?.damageType)?.fallback;
      recipe=eligible&&!(finisherPresentationId(candidate.id)==='opened'&&!opened.canStart())?candidate:direction&&outcome?.damageType?support.find(r=>r.id===fallbackId)??ordinary(death):ordinary(death);
      if(finisherPresentationId(recipe.id)==='opened'){root.add(opened.group);opened.group.visible=false;openedActive=true;}
      if(finisherPresentationId(recipe.id)==='split-crown'){bone.add(crown.group);crown.open(0);for(const node of head.nodes){visible.push([node,node.visible]);node.visible=false;}crownActive=true;}
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
      if(expired&&finisherPresentationId(recipe.id)==='opened')return{clip:'Death',phase:.999999,offset:{x:0,z:0}};
      if(recipe.reactionClip==='Hit'&&elapsed<hit) {
        const amount=.1*Math.sin(Math.PI*elapsed/hit), proposed={x:direction.x*amount,z:direction.z*amount};
        const origin={x:root.position.x,z:-root.position.z};
        const offset=typeof isBlocked==='function'&&!isBlocked({x:origin.x+proposed.x,z:origin.z+proposed.z},.2)?proposed:{x:0,z:0};
        return {clip:'Hit',phase:Math.min(.999999,elapsed/hit),offset};
      }
      const offset={x:0,z:0}, clip=recipe.clip, clipSeconds=durationOf(clips,clip);
      const phase=Math.min(.999999,Math.max(0,elapsed-(recipe.reactionClip==='Hit'?hit:0))/clipSeconds);root.getWorldScale(runScale);return {clip,phase,offset,groundLift:finisherPresentationId(recipe.id)==='run-through'?runGrounding.lift(phase)*runScale.y:0};
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
      if((finisherPresentationId(recipe.id)==='opened'&&!openedShown)||(finisherPresentationId(recipe.id)==='split-crown'&&age<=.045))return null;
      root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);
      const at=node=>{if(!node)return null;node.updateWorldMatrix(true,false);node.getWorldPosition(anchorPoint);return{x:anchorPoint.x,y:anchorPoint.y,z:anchorPoint.z};};
      const capAt=mesh=>{if(!mesh?.geometry.boundingSphere)return null;mesh.updateWorldMatrix(true,false);anchorPoint.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);return{x:anchorPoint.x,y:anchorPoint.y,z:anchorPoint.z};};
      if(finisherPresentationId(recipe.id)==='opened'){const upper=at(opened.group.getObjectByName('OpenedTorso')),lower=at(opened.group.getObjectByName('OpenedLegs'));return upper?{body:upper,trails:[upper,lower??upper]}:null;}
      if(finisherPresentationId(recipe.id)==='split-crown'){const left=capAt(crown.caps.find(m=>m.parent===crown.halves[0])),right=capAt(crown.caps.find(m=>m.parent===crown.halves[1]));return left?{head:left,trails:[left,right??left]}:null;}
      if(recipe.parts.includes('head')){const seam=at(head.stump),detachedCap=head.group.children.find(n=>n.geometry===head.stump.geometry);if(!seam)return null;anchorNormal.set(0,1,0).transformDirection(head.stump.matrixWorld);return{head:seam,neckNormal:{x:anchorNormal.x,y:anchorNormal.y,z:anchorNormal.z},trails:[at(detachedCap)??seam,seam]};}
      const body=at(torso);return body?{body,trails:[body]}:null;
    },
    stats(){return {prepared:!!head,preparationError,vertices:head?.vertices??0,triangles:head?.triangles??0,ownedGeometries:head?.geometries.length??0,ownedGeometryBytes,ownedMaterials:head?.materials.length??0,lethalVertexCopies:0,detached,expired,crownPrepared:!!crown,crownActive,crownPreparationError,crown:crown?.stats()??null,openedPrepared:!!opened,openedActive,openedPreparationError,opened:opened?.stats()??null,runGrounding:runGrounding?.stats()??null,runPreparationError,activePartCost:expired?0:(openedActive||crownActive||detached?recipe.cost:0)};},
    dispose(){if(disposed)return;disposed=true;expire();for(const[node,value]of visible)node.visible=value;opened?.dispose();opened=null;crown?.dispose();crown=null;head?.dispose();head=null;support.length=0;},
  };
  } finally {if(!completed){opened?.dispose();crown?.dispose();head?.dispose();support.length=0;}}
}
