import{attachFlame,flameGripProfile,applyFlamePitch}from'./engine/flame-presentation.js';
import{selectCombatTarget,combatTargetHeight}from'./pistol-targeting.js';
import{MELEE_VARIANTS,selectedMeleeVariant,setPlayerMeleeWeapon}from'./melee-equipment.js';
import cleaverLowClip from'./donor/cleaver-rat-low.json'with{type:'json'};
import {ratMeleePosePhase} from './rat-melee-definition.js';
import {withPresentedRecipe} from './finisher-selection.js';
import {createGauntShapeLibrary} from './gaunt-shape.js';
import {createFeralBodyShapeLibrary} from './feral-body-shapes.js';
import {createRoachAppearanceLibrary} from './roach-appearance.js';
import {createLowHoverDroneLibrary} from './low-hover-drone.js';
import {createAnimalAppearanceLibrary} from './animal-appearance.js';
import {createFeralCoatProfileLibrary} from './feral-coat-profiles.js';
import {animalAppearanceFor} from './area-mob-spawns.js';
import roachBite from './roach-data/bite-scaled.json' with {type:'json'};
import {createFeralDogLibrary} from './feral-dog.js';
import dogBite from './dog-data/bite-scaled.json' with {type:'json'};
import dogMidClip from './dog-data/mid-slash.json' with {type:'json'};
import dogBlade from './dog-data/blade-path.json' with {type:'json'};
import dogReceiverAppend from './dog-data/receiver-append.json' with {type:'json'};
import {createRatBiteReceiver,ratLowBlade} from './rat-contact.js';
import footBindings from './rat-data/foot-bindings.json' with {type:'json'};
import lowClip from './rat-data/low-slash.json' with {type:'json'};
import lowBlade from './rat-data/blade-path.json' with {type:'json'};
import {attachPistolSlide} from './pistol-slide.js';
import {createHitReaction} from './combat-impact.js';
import {createFinisherPresentationSteps,finisherVictimPoseAge,validateHeadParts} from './finisher-presentation.js';
import {createVestView} from './vest-view.js';
import * as THREE from "three";
const damageCrimson=new THREE.Color(0x831428);
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {HOLLOW_GARMENTS,hollowPaletteFor,applyHollowPalette} from "./hollow-palette.js";
import { ActorMotion } from "./motion.js";
import {attachPistol,applyPistolAim,restoreGripProfile} from "./pistol-pose.js";
import { DonorMotion, equipDonorPlayer, donorSwingPhase } from "./donor-motion.js";
import { disposeActorSources } from "./actor-resources.js";
import { hollowLocomotionFor, AREA_MOB_SPAWNS } from "./area-mob-spawns.js";
import { CrookedHollowMotion } from "./crooked-hollow.js";
import {createFaceAppearanceLibrary} from './face-appearance.js';
import {FACE_APPEARANCE_VERSION,FACE_RECIPES,ORIGINAL_FACE_ID,faceRecipeFor} from './face-recipes.js';
import {allocateFaceRecipes} from './face-allocator.js';
const residentFaces=allocateFaceRecipes('london-residents',Object.values(AREA_MOB_SPAWNS).flat().map(r=>r.key),{version:FACE_APPEARANCE_VERSION,recipes:FACE_RECIPES});
const names = ["revenant", "orc", "warlock", "warlord"];
function actorModelRef(entity,manifest){
  if(entity.appearanceRef!==undefined){
    const ref=entity.appearanceRef;
    if(entity.kind<0||typeof ref!=='string'||!/^[a-z][a-z0-9-]*$/.test(ref)||!manifest.models||!Object.hasOwn(manifest.models,ref)||manifest.models[ref].rig!==entity.rig)throw Error('Invalid actor appearance reference');
    return ref;
  }
  return entity.kind<0?'vagrant':manifest.pilot==='donor-knife'?entity.rig:names[entity.kind];
}
// Keep an already-presented corpse age through registered area reconstruction.
export function finisherPresentationAge(entity,time){
 const elapsed=Math.max(0,time-(entity.response?.start??time)),shown=entity.finisherPresentationAge;
 return Math.max(elapsed,Number.isFinite(shown)&&shown>=0?shown:0);
}

export async function loadActors(
  baseUrl,
  onProgress = () => {},
  manifestPath = "assets/manifest-lossless.json",
) {
  const manifestURL = new URL(manifestPath, baseUrl);
  const response = await fetch(manifestURL);
  if (!response.ok) throw Error(`Character manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = new Map(),pendingModels=new Map();
  let pistolAsset=null;
  const urls = new Map();
  const sources = new Set();
  function load(url) {
    if(!urls.has(url)){
      const pending=loader.loadAsync(url).then(gltf=>{
        if(disposed){disposeActorSources(new Set([gltf]));throw Error('Actor library disposed');}
        sources.add(gltf);return gltf;
      }).catch(error=>{if(urls.get(url)===pending)urls.delete(url);throw error;});
      urls.set(url,pending);
    }
    return urls.get(url);
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeActorSources(sources);
    sources.clear();
    models.clear();pendingModels.clear();
    urls.clear();
  };

  function loadModel(name){
    if(disposed)return Promise.reject(Error('Actor library disposed'));
    if(models.has(name))return Promise.resolve(models.get(name));
    if(pendingModels.has(name))return pendingModels.get(name);
    if(!Object.hasOwn(manifest.models,name))return Promise.reject(Error('Unknown actor model: '+name));
    const description=manifest.models[name];
    const pending=(async()=>{
      if(description.faceRecipeId!==undefined)faceRecipeFor(description.faceRecipeId);
      const headParts=description.headParts===undefined?null:validateHeadParts(description.headParts);
      const parts=await Promise.allSettled([load(new URL(description.url,manifestURL).href),description.equipment?load(new URL(description.equipment.url,manifestURL).href):Promise.resolve(null)]);
      const failed=parts.find(part=>part.status==='rejected');if(failed)throw failed.reason;
      if(disposed)throw Error('Actor library disposed');
      const[gltf,equipment]=parts.map(part=>part.value);
      const missing=headParts?.find(part=>!gltf.scene.getObjectByName(part)?.isSkinnedMesh);if(missing)throw Error('Appearance head part missing: '+name+'/'+missing);
      onProgress(name);
      const value={gltf,description,equipment};models.set(name,value);return value;
    })().finally(()=>pendingModels.delete(name));
    pendingModels.set(name,pending);return pending;
  }
  async function ensureModels(names){
    const settled=await Promise.allSettled([...new Set(names)].map(loadModel)),failed=settled.find(row=>row.status==='rejected');if(failed)throw failed.reason;
  }
  // Initial source settlement keeps existing ownership; area-scoped models stay deferred.
  const results=await Promise.allSettled([
    ...Object.entries(manifest.models).filter(([,description])=>description.deferred!==true).map(([name])=>loadModel(name)),
    ...(manifest.pistol?[load(new URL(manifest.pistol.url,manifestURL).href).then(asset=>{pistolAsset=asset})]:[]),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure || !models.has("vagrant")) {
    dispose();
    throw failure?.reason ?? Error("Survivor export missing");
  }
  return {
    models,ensureModels,
    manifest,
    pistolAsset,
    complete:
      manifest.pilot === "donor-knife"
        ? models.has(manifest.encounter === "hollow-scavengers" ? "hollow-scavenger" : "goblin") && !!models.get("vagrant").equipment
        : names.every((name) => models.has(name)),
    dispose,
  };
}
function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    g = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
  g.addColorStop(0, "rgba(0,0,0,.6)");
  g.addColorStop(0.55, "rgba(0,0,0,.25)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
export function createActors(scene, world, library, { visualScale = 1 } = {}) {
  const bodyShapes=createFeralBodyShapeLibrary(),roachLooks=createRoachAppearanceLibrary(THREE),droneKits=createLowHoverDroneLibrary(),faceKits=new Map(),dogKits=new Map(),animalLooks=createAnimalAppearanceLibrary(THREE),dogCoats=createFeralCoatProfileLibrary(THREE);
  const gauntKits=new Map(),humanFoundation=library.models.get('hollow-scavenger')?.gltf.scene;
  let gauntPreparationError=null;
  if(humanFoundation?.getObjectByName('Hollow_body_and_worn_trousers'))try{gauntKits.set(humanFoundation,createGauntShapeLibrary(humanFoundation));}catch(error){gauntPreparationError=String(error.message??error);}
  let feedbackMode='high',lastReduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const parkedViews=new Map(),groundingCache=new WeakMap();
  const views = new Map(),
    shadowMap = shadowTexture(),
    shadowGeometry = new THREE.PlaneGeometry(1, 1);
  function make(entity,finishers=false,restoreCorpses=false){const steps=makeSteps(entity,finishers,restoreCorpses);for(;;){const step=steps.next();if(step.done)return step.value;}}
  function* makeSteps(entity,finishers=false,restoreCorpses=false,{stageWorld=world,renderScene=scene,store=views}={}) {
    if(entity.rig==='low-hover-drone'){
      const drone=droneKits.spawn({scene:renderScene,position:stageWorld.toRender(entity.pos),heading:Math.atan2(entity.facing.x,-entity.facing.z)});
      const view={root:drone.root,model:drone.root,drone,entity,description:{motion:'drone',scale:1},flashMaterials:[],pistolSlide:attachPistolSlide(null),hitReaction:createHitReaction({mode:feedbackMode,reducedMotion:reducedMotion()})};
      store.set(entity.id,view);return view;
    }
    const name = actorModelRef(entity,library.manifest),
      source = library.models.get(name);
    if (!source) throw Error(`Original ${name} export not ready`);
    const garments=source.description.clothingMaterials??(entity.rig==='hollow-scavenger'?HOLLOW_GARMENTS:null);
    const palette=entity.kind>=0&&garments?hollowPaletteFor(entity,stageWorld.areaId):null;
    const root = new THREE.Group(),
      model = clone(source.gltf.scene),
      description = source.description,
      materials = [];
    let animations = source.equipment
      ? equipDonorPlayer(
          { scene: model, animations: source.gltf.animations },
          source.equipment,
        ).animations
      : source.gltf.animations;
    if(entity.kind<0)animations=[...animations,THREE.AnimationClip.parse(lowClip),THREE.AnimationClip.parse(dogMidClip),...(library.manifest.models?.['vagrant-cleaver']?[THREE.AnimationClip.parse(cleaverLowClip)]:[])];
    if(entity.rig==='original-roach'&&(description.scale===3||description.scale===4))animations=[...animations,THREE.AnimationClip.parse(roachBite)];
    let feral=null;
    if(entity.rig==='original-dog'&&description.scale===2){
      if(!dogKits.has(source.gltf.scene))dogKits.set(source.gltf.scene,createFeralDogLibrary(source.gltf.scene));
      feral=dogKits.get(source.gltf.scene).apply(model);
      animations=[...animations,THREE.AnimationClip.parse(dogBite)];
    }
    const animalAppearanceId=animalAppearanceFor(entity);
    const bodyShape=['dog-gaunt-hound','dog-stocky-yard'].includes(animalAppearanceId)?bodyShapes.apply(model,animalAppearanceId):null;
    if(animalAppearanceId){if(entity.rig==='original-rat')animalLooks.apply(model,animalAppearanceId,entity.rig);else if(entity.rig==='original-roach')roachLooks.apply(model,animalAppearanceId);else dogCoats.apply(model,animalAppearanceId);}
    const pistolMount=entity.kind<0&&library.pistolAsset?attachPistol(model,library.pistolAsset.scene):null;
    if(pistolMount)pistolMount.visible=false;
    const knife=entity.kind<0?model.getObjectByName('WeaponDrawn'):null;
    root.name = name;
    root.position.copy(stageWorld.toRender(entity.pos));
    root.scale.setScalar(
      (stageWorld.layout.characterScale ?? 1.265) * (description.scale ?? 1) * visualScale * (entity.kind>=0?(entity.mobSize??1):1),
    );
    root.add(model);
    const hidden = new Set(
      (description.starterHidden ?? []).map(
        THREE.PropertyBinding.sanitizeNodeName,
      ),
    );
    model.traverse((o) => {
      if (hidden.has(o.name)) o.visible = false;
      if (o.isMesh) {
        o.frustumCulled = false;
        const original = Array.isArray(o.material) ? o.material : [o.material];
        const copies = original.map((m) => {
          const own = m.clone();
          if(palette)applyHollowPalette(own,palette,garments);
          materials.push({
            material: own,
            emissive: own.emissive?.clone(),
            intensity: own.emissiveIntensity,
          });
          return own;
        });
        o.material = Array.isArray(o.material) ? copies : copies[0];
      }
    });
    let appearance=null,humanBody=null,humanBodyRecipe=null;
    const humanBodyRequest=entity.kind>=0&&entity.rig==='hollow-scavenger'?entity.humanBodyRecipe:null;
    const flashMaterials=[];
    const shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: shadowMap,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.25 * root.scale.x, 1.25 * root.scale.x, 1);
    shadow.renderOrder = 0;
    const view = {
      root,
      model,
      shadow,
      motion: null,
      materials,appearance,feral,bodyShape,humanBody,humanBodyRecipe,humanBodyRequest,flashMaterials,
      entity,
      description,
      locomotionVariant: hollowLocomotionFor(entity),
      palette,
      animalAppearanceId,pistolMount,pistolSlide:attachPistolSlide(pistolMount),knife,hitReaction:createHitReaction({mode:feedbackMode,reducedMotion:reducedMotion()}),
    };
    store.set(entity.id, view);
    let completed=false;
    try {
      yield 'actor-clone';
      if(entity.kind>=0&&entity.rig==='hollow-scavenger'){
        if(!faceKits.has(source.gltf.scene))faceKits.set(source.gltf.scene,createFaceAppearanceLibrary(source.gltf.scene));
        appearance=yield* faceKits.get(source.gltf.scene).applySteps(model,description.faceRecipeId??residentFaces.get(entity.placementKey)??ORIGINAL_FACE_ID);
        view.appearance=appearance;
      }
      humanBody=humanBodyRequest==='human-gaunt-skulker'?gauntKits.get(source.gltf.scene)?.apply(model)??null:null;
      humanBodyRecipe=humanBody?humanBodyRequest:null;view.humanBody=humanBody;view.humanBodyRecipe=humanBodyRecipe;
      flashMaterials.push(...[...materials,...(appearance?.extraMaterials??[]).map(material=>({material,emissive:material.emissive?.clone(),intensity:material.emissiveIntensity}))].map(m=>({...m,color:m.material.color?.clone()})));
      const Motion =
        ["donor-knife","rat","dog","roach"].includes(description.motion) ? DonorMotion : ActorMotion;
      view.motion = new Motion(root, model, animations, description);
      if (view.locomotionVariant === 'crooked-hollow')
        view.motion = new CrookedHollowMotion(view.motion);
      renderScene.add(root, shadow);
      yield 'actor-motion';
      if(finishers&&entity.kind>=0&&entity.rig==='hollow-scavenger'){
        view.finisher=yield* createFinisherPresentationSteps({root,model,clips:animations,headParts:description.headParts,scene:renderScene,groundY:0,groundingCache,prepareRunThrough:entity.hp>0||restoreCorpses&&entity.finisher?.recipeId==='run-through',prepareHead:finishers.maxHeads>0&&(entity.hp>0||restoreCorpses&&['decapitation','pistol-decapitation','split-crown'].includes(entity.finisher?.recipeId)),prepareCrown:finishers.maxHeads>0&&(entity.hp>0||restoreCorpses&&entity.finisher?.recipeId==='split-crown'),prepareOpened:finishers.maxHeads>0&&entity.placementKey===({westminster:'westminster-roamer-3',east:'east-roamer-3',south:'south-roamer-4'})[stageWorld.areaId]&&(entity.hp>0||restoreCorpses&&entity.finisher?.recipeId==='opened'),isBlocked:(point,radius,from)=>!stageWorld.geometry.clear(point,radius)||!!from&&!stageWorld.geometry.lineClear(from,point)});
        entity.finisherSupport=view.finisher.support;
        view.restoredCorpse=restoreCorpses&&entity.hp<=0;
      }
      completed=true;
    } finally {if(!completed)remove(entity.id,store);}
    return view;
  }
  function remove(id,store=views) {
    const view = store.get(id);
    if (!view) return;
    if(view.drone){view.drone.dispose();store.delete(id);return;}
    view.impactFlashLife=0;restoreFlash(view);
    view.footReceiver?.dispose();view.dogReceiver?.dispose();view.ratReceiver?.dispose();
    view.finisher?.dispose();
    if(view.finisher){view.entity.finisherSupport=[];view.entity.finisherHeadUntil=0;view.entity.finisherPartsUntil=0;}
    view.pistolSlide.dispose();
    view.appearance?.dispose();view.humanBody?.dispose();view.bodyShape?.dispose();view.feral?.dispose();
    view.vest?.dispose();
    view.motion?.dispose();
    const skeletons = new Set();
    view.model.traverse((o) => {
      if (o.skeleton) skeletons.add(o.skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
    view.root.removeFromParent();view.shadow.removeFromParent();
    view.shadow.material.dispose();
    for (const m of view.materials) m.material.dispose();
    store.delete(id);
  }
  function restoreFlash(view){for(const m of view.flashMaterials){if(m.color)m.material.color.copy(m.color);if(m.emissive)m.material.emissive.copy(m.emissive);m.material.emissiveIntensity=m.intensity;}}
  return {
    views,
    ensureFlame(){const data=world.flameData;return data?library.ensureModels([data.modelRef]):Promise.reject(Error('Flamethrower unavailable'));},
    flameAsset(){return library.models.get(world.flameData?.modelRef)?.gltf??null;},
    flameReady(){return !!library.models.get(world.flameData?.modelRef);},
    flameSource(){const mount=views.get(0)?.flameMount,muzzle=mount?.visible&&mount.getObjectByName('Muzzle');if(!muzzle)return null;const p=muzzle.getWorldPosition(new THREE.Vector3()),d=muzzle.getWorldDirection(new THREE.Vector3());return{position:{x:p.x,y:p.y,z:-p.z},direction:{x:d.x,y:d.y,z:-d.z}};},
    ensureMeleeVariant(itemId){const profile=MELEE_VARIANTS[itemId];if(!profile)throw Error('Unknown melee variant');return profile.modelRef?library.ensureModels([profile.modelRef]):Promise.resolve();},
    meleeVariantSource(itemId){const profile=MELEE_VARIANTS[itemId];return profile?.modelRef?library.models.get(profile.modelRef):null;},
    ensureAreaModels(record,areaId=world.areaId){
      const flame=world.flameData,reward=world.uniqueRewardData,refs=[...(record.enemies??[]),...(record.corpses??[])].filter(e=>e.bossProfile||e.appearanceRef!==undefined).map(e=>actorModelRef(e,library.manifest));
      if(reward&&(areaId===reward.areaId||record.uniqueReward?.status==='owned'))refs.push(reward.modelRef);
      const required=library.ensureModels?.([...new Set(refs)])??Promise.resolve();return required.then(async()=>{if(flame&&areaId===flame.areaId)try{await library.ensureModels([flame.modelRef]);}catch{/* Optional pickup keeps its marker and manual Equipment retry. */}});
    },
    parkArea(areaId){
      const stored=parkedViews.get(areaId)??new Map();parkedViews.set(areaId,stored);
      for(const[id,view]of [...views])if(id!==0){view.impactFlashLife=0;view.hitReactionFresh=false;restoreFlash(view);view.hitReaction.reset();view.pistolSlide.reset();view.finisher?.setDormant(true);view.root.removeFromParent();view.shadow?.removeFromParent();stored.set(id,view);views.delete(id);}
    },
    *prepareAreaSteps(areaId,record,stageWorld,finishers){
      const stored=parkedViews.get(areaId)??new Map();parkedViews.set(areaId,stored);
      const added=[];let completed=false;
      try{for(const entity of [...record.enemies,...(record.corpses??[])])if(!stored.has(entity.id)){added.push(entity.id);yield* makeSteps(entity,finishers,true,{stageWorld,renderScene:stageWorld.scene,store:stored});yield 'actor-ready';}completed=true;}
      finally{if(!completed)for(const id of added)remove(id,stored);}
    },
    bindPreparedArea(areaId,renderScene){const stored=parkedViews.get(areaId);if(!stored)return;for(const view of stored.values()){renderScene.add(view.root);if(view.shadow)renderScene.add(view.shadow);view.finisher?.setScene(renderScene);}},
    activateArea(areaId){const stored=parkedViews.get(areaId);if(!stored)return;for(const[id,view]of stored){views.set(id,view);scene.add(view.root);if(view.shadow)scene.add(view.shadow);view.finisher?.setScene(scene);view.finisher?.setDormant(false);}parkedViews.delete(areaId);},
    discardArea(areaId){const stored=parkedViews.get(areaId);if(stored){for(const id of [...stored.keys()])remove(id,stored);parkedViews.delete(areaId);}},
    areaViewStats(){const all=new Set([...views.values(),...[...parkedViews.values()].flatMap(stored=>[...stored.values()])]);return{active:views.size,parked:[...parkedViews].map(([area,stored])=>({area,count:stored.size})),ownedFinisherGeometryBytes:[...all].reduce((n,v)=>n+(v.finisher?.stats().ownedGeometryBytes??0),0),finisherGeometryBudgetBytes:128*1024*1024};},
    humanBodyStats(){return {libraries:[...gauntKits.values()].map(kit=>kit.stats()),preparationError:gauntPreparationError};},
    ratContact(){
      const point=new THREE.Vector3(),ray=new THREE.Raycaster();
      function preparePlayer(view){
        if(view.footReceiver)return;
        view.footReceiver=createRatBiteReceiver(view.model,footBindings.bindings);view.footPoints=[];
        for(const binding of footBindings.bindings){const mesh=view.model.getObjectByName(binding.runtimeName),g=mesh.geometry,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;
          for(const side of ['l','r']){const indices=new Set(binding.faceBindings.flatMap(f=>f.vertices)),valid=[...indices].filter(i=>{let total=0;for(let k=0;k<4;k++)if(['foot_'+side,'ball_'+side].includes(mesh.skeleton.bones[ix.getComponent(i,k)]?.name))total+=w.getComponent(i,k);return total>.85;});
            const chosen=new Set();for(const axis of ['X','Y','Z'])for(const sign of [-1,1]){let best=null;for(const i of valid)if(best===null||sign*g.attributes.position['get'+axis](i)>sign*g.attributes.position['get'+axis](best))best=i;if(best!==null)chosen.add(best);}
            for(const i of chosen)view.footPoints.push({mesh,i});
          }
        }
      }
      function visible(mesh){for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;}
      function tooth(view){const mesh=view.model.getObjectByName('Original_ARM_rat_surface_3');mesh.getVertexPosition(80,point);return point.applyMatrix4(mesh.matrixWorld).toArray();}
      return {
        capture:game=>{
          this.update(game,0,0,{presentationDt:0,contactOnly:true});const player=views.get(0);player.root.updateWorldMatrix(true,true);preparePlayer(player);
          if(!player.dogReceiver&&game.enemies.some(e=>e.rig==='original-dog'&&views.get(e.id)?.description.scale===2)){
            const bindings=footBindings.bindings.map(b=>({...b,faceBindings:[...b.faceBindings,...dogReceiverAppend.filter(f=>f.runtimeName===b.runtimeName).map(({face,vertices})=>({face,vertices}))]}));
            player.dogReceiver=createRatBiteReceiver(player.model,bindings);
          }
          const rats=new Map();
          for(const e of game.enemies)if(['original-rat','original-dog','original-roach','low-hover-drone'].includes(e.rig)){const view=views.get(e.id);view.root.updateWorldMatrix(true,true);if(view.drone){rats.set(e.id,{view,root:view.root.matrixWorld.clone()});continue;}const teeth=view.description.contact?.canines?.map(({mesh,vertex})=>{const m=view.model.getObjectByName(mesh);m.getVertexPosition(vertex,point);return point.applyMatrix4(m.matrixWorld).toArray();});rats.set(e.id,{tooth:teeth?null:tooth(view),teeth,view,root:view.root.matrixWorld.clone()});}
          const swing=game.player.swing,posedMelee=game.player.meleeVariantId&&game.player.meleeVariantId!=='knife'&&swing?.def.ratLow,contact=posedMelee?MELEE_VARIANTS[game.player.meleeVariantId].contact:[.12,.52],playerBlade=swing?.def.ratRetimed||posedMelee?contact.map(y=>player.model.getObjectByName('WeaponDrawn').localToWorld(point.set(0,y,0)).toArray()):null,playerBladePhase=playerBlade?swing.native?Math.max(0,Math.min(1,(game.time-swing.start)/(swing.end-swing.start))):ratMeleePosePhase(swing,donorSwingPhase):null;
          return {playerBlade,playerBladePhase,player:player.footReceiver.capture(),playerDog:player.dogReceiver?.capture()??null,playerRoot:player.root.matrixWorld.clone(),rats};
        },
        foot:(game,rat)=>{
          const player=views.get(0);if(!player)return null;preparePlayer(player);let best=null,distance=Infinity;
          for(const{mesh,i}of player.footPoints){if(!visible(mesh))continue;mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);if(point.y<-.01||point.y>.20)continue;const next={x:point.x,y:point.y,z:-point.z},d=Math.hypot(next.x-rat.pos.x,next.z-rat.pos.z);if(d<distance&&world.geometry.clear(next,0)&&world.lineClear(rat.pos,next)){best=next;distance=d;}}
          return best;
        },
        calf:(game,dog)=>{
          this.update(game,0,0,{presentationDt:0,contactOnly:true});
          const player=views.get(0),view=views.get(dog.id);if(!player||!view)return null;let best=null,distance=Infinity;
          player.root.updateMatrixWorld(true);
          for(const binding of view.description.contact.calfFaces){const mesh=player.model.getObjectByName(binding.runtimeName);if(!visible(mesh))continue;const goal=new THREE.Vector3();for(const i of binding.vertices){mesh.getVertexPosition(i,point);goal.add(point.applyMatrix4(mesh.matrixWorld));}goal.multiplyScalar(1/3);const band=view.description.contact.calfBand??[.49,.54];if(goal.y<band[0]||goal.y>band[1])continue;const next={x:goal.x,y:goal.y,z:-goal.z,face:binding.face},d=Math.hypot(next.x-dog.pos.x,next.y,next.z-dog.pos.z);if(d<distance&&world.lineClear(dog.pos,next)){best=next;distance=d;}}
          return best;
        },
        hit:(a,d,s,before,after)=>{
          if(a.rig==='original-rat'){const old=before.rats.get(a.id),now=after.rats.get(a.id);return old&&now&&views.get(0).footReceiver.sweep(before.player,after.player,old.tooth,now.tooth).hit;}
          if(a.rig==='original-dog'||a.rig==='original-roach'){const old=before.rats.get(a.id),now=after.rats.get(a.id),scaled=a.rig==='original-dog'&&now?.view.description.scale===2,receiver=scaled?views.get(0).dogReceiver:views.get(0).footReceiver;return old&&now&&now.teeth.some((to,i)=>receiver.sweep(scaled?before.playerDog:before.player,scaled?after.playerDog:after.player,old.teeth[i],to).hit);}
          if(!['original-rat','original-dog','original-roach','low-hover-drone'].includes(d.rig)||!s.def.ratLow)return false;
          const view=after.rats.get(d.id)?.view;if(!view||s.def.ratRetimed&&!after.playerBlade)return false;const [from,to]=after.playerBlade??ratLowBlade(s.clip==='DogMidSlash'?dogBlade:lowBlade,s.ageTicks/60,after.playerRoot),start=new THREE.Vector3(...from),end=new THREE.Vector3(...to),delta=end.sub(start),length=delta.length();ray.set(start,delta.normalize());ray.near=0;ray.far=length;
          const meshes=[];view.model.traverse(m=>{if(visible(m)&&(view.drone?m.isMesh&&m.name==='ARM_Drone_Rigid_Frame':m.isSkinnedMesh)){if(m.isSkinnedMesh)m.computeBoundingSphere();else{m.geometry.computeBoundingSphere();m.geometry.computeBoundingBox();}meshes.push(m);}});return ray.intersectObjects(meshes,false).length>0;
        },
      };
    },
    configureFeedback(mode){feedbackMode=mode;for(const v of views.values()){v.hitReaction.configure({mode,reducedMotion:reducedMotion()});v.impactFlashLife=0;restoreFlash(v);v.pistolSlide.reset();}},
    resetFeedback(){for(const v of views.values()){v.hitReaction.reset();v.hitReactionFresh=false;v.impactFlashLife=0;restoreFlash(v);v.pistolSlide.reset();}},
    events(game){for(const e of game.events)if(e.type==='hit'&&e.amount>0){const v=views.get(e.actor?.id);if(v){v.hitReactionFresh=true;v.impactFlashLife=.1;if(!e.blocked)v.hitReaction.hit({x:e.impactDirection?.x??0,z:e.impactDirection?.z??0,killed:e.actor.hp<=0});}}},
    reset() {
      for (const id of [...views.keys()]) remove(id);
      for(const stored of parkedViews.values())for(const id of [...stored.keys()])remove(id,stored);parkedViews.clear();
    },
    update(game, dt, pistolRecoil=0, {presentationDt=dt,restoreCorpses=false,contactOnly=false}={}) {
      if(lastReduced!==reducedMotion()){lastReduced=reducedMotion();this.configureFeedback(feedbackMode);}
      const entities = [game.player, ...game.enemies, ...(game.corpses ?? [])],
        ids = new Set(entities.map((e) => e.id));
      for (const id of [...views.keys()]) if (!ids.has(id)) remove(id);
      for (const entity of entities) {
        if(contactOnly&&entity.kind>=0&&!['original-rat','original-dog','original-roach','low-hover-drone'].includes(entity.rig))continue;
        const view = views.get(entity.id) ?? make(entity,game.finishers,restoreCorpses);if(entity.kind<0)restoreGripProfile(view.model);
        if(entity.kind<0&&world.uniqueRewardData){const profile=selectedMeleeVariant(game);setPlayerMeleeWeapon(view,profile.modelRef?library.models.get(profile.modelRef):null,profile.itemId);}
        if(view.drone){
          const warning=entity.droneState.warning,dead=entity.hp<=0,state=dead?'death':warning?'alert':entity.droneState.phase==='recover'&&game.time-entity.droneState.readyAt+1.4<.12?'attack':entity.alerted?'idle':'patrol';
          view.drone.update({time:game.time,dt:Math.max(0,dt),position:world.toRender(entity.pos),heading:Math.atan2(entity.facing.x,-entity.facing.z),state,phase:dead?(game.time-(entity.response?.start??game.time))/.8:warning?(game.time-warning.start)/.6:0});
          view.root.updateWorldMatrix(true,true);continue;
        }
        view.root.scale.setScalar((world.layout.characterScale??1.265)*(view.description.scale??1)*visualScale*(entity.kind>=0?(entity.mobSize??1):1));
        view.root.position.copy(world.toRender(entity.pos));
        view.root.rotation.y =
          Math.atan2(entity.facing.x, -entity.facing.z) +
          (view.description.forwardCorrection ?? 0);
        if(entity.hp<=0)view.root.rotation.x=view.root.rotation.z=0;
        view.root.updateMatrixWorld(true);
        let deathPose=null;
        if(!contactOnly&&entity.hp<=0&&view.finisher&&entity.finisher){
          if(!view.finisherStarted){
            view.finisherRequestedRecipeId=entity.finisher.recipeId;const recipe=view.finisher.start(entity.finisher),chosen=entity.finisher;entity.finisher=withPresentedRecipe(chosen,recipe);if(entity.finisher!==chosen&&game.finishers?.lastVictimId===entity.id)game.finishers.recentRecipeId=recipe.id;view.finisherStarted=true;view.finisherAge=finisherPresentationAge(entity,game.time);
            if(view.restoredCorpse&&recipe.cost>0){
              if(view.finisherAge>=6)view.finisher.update(view.finisherAge,0);
              else for(let age=0;age<view.finisherAge;){const step=Math.min(1/60,view.finisherAge-age);age+=step;view.finisher.update(age,step);}
              entity.finisherPartsUntil=game.time+Math.max(0,6-view.finisherAge);if(recipe.parts.includes('head'))entity.finisherHeadUntil=entity.finisherPartsUntil;
            }
            const parts=view.finisher.stats();if(!parts.detached)entity.finisherHeadUntil=0;if(!parts.activePartCost)entity.finisherPartsUntil=0;
          }
          else view.finisherAge=Math.max(game.time-(entity.response?.start??game.time),view.finisherAge+Math.max(0,presentationDt));
          view.finisher.update(view.finisherAge,presentationDt);view.finisherPoseAge=finisherVictimPoseAge(view.finisherAge,{enabled:feedbackMode!=='off'&&!reducedMotion(),restored:!!view.restoredCorpse});deathPose=view.finisher.pose(view.finisherPoseAge);entity.finisherPresentationAge=view.finisherAge;
          if(view.finisher.stats().expired){entity.finisherHeadUntil=0;entity.finisherPartsUntil=0;}
        }
        view.motion.update(
          entity,
          game.time,
          game.finished && view.description.motion !== "donor-knife" ? 0 : dt,
          deathPose,
        );
        const reaction=view.hitReaction.update(contactOnly||view.hitReactionFresh?0:Math.min(.05,presentationDt),{paused:presentationDt===0});
        if(!contactOnly&&!view.hitReactionFresh)view.impactFlashLife=Math.max(0,(view.impactFlashLife??0)-Math.min(.05,Math.max(0,presentationDt)));if(!contactOnly)view.hitReactionFresh=false;
        // Living flinch and native corpse pose share this sole render transform owner.
        if(entity.hp>0){const lean=reaction.energy*.30;view.root.rotation.x=-reaction.z*lean;view.root.rotation.z=-reaction.x*lean;const flinch={x:entity.pos.x+reaction.x*reaction.energy*.10,z:entity.pos.z+reaction.z*reaction.energy*.10};if((!world.geometry?.clear||world.geometry.clear(flinch,entity.radius))&&(!world.lineClear||world.lineClear(entity.pos,flinch)))view.root.position.copy(world.toRender(flinch));}else{view.root.rotation.x=view.root.rotation.z=0;}
        if(deathPose){view.root.position.y+=deathPose.groundLift??0;view.root.position.x+=deathPose.offset.x;view.root.position.z-=deathPose.offset.z;view.root.updateMatrixWorld(true);}
        if(view.pistolMount){
          const holding=entity.weapon==='pistol'&&!(entity===game.player&&game.flame?.equipped),pose=holding&&entity.hp>0&&game.time>=entity.dodgeUntil&&game.time>=entity.hurtUntil;
          if(view.knife)view.knife.visible=!holding;view.pistolMount.visible=pose;
          if(pose)applyPistolAim(view.model,view.pistolMount,{recoil:pistolRecoil});
          view.pistolSlide.setRecoil(pose?pistolRecoil:0);
        }
        if(entity===game.player){
          const equipped=!!game.flame?.equipped,pose=equipped&&entity.hp>0&&game.time>=entity.dodgeUntil&&game.time>=entity.hurtUntil;
          if(view.knife)view.knife.visible=!equipped&&entity.weapon!=='pistol';
          if(pose&&!view.flameMount){const source=library.models.get(world.flameData?.modelRef);if(source){const record=Object.values(library.manifest.files??{}).find(r=>r.file===library.manifest.models.vagrant.url);view.flameGrip=flameGripProfile(view.model,record?.sha256);view.flameMount=attachFlame(view.model,source.gltf);}}
          if(view.flameMount){view.flameMount.visible=pose;if(pose){applyPistolAim(view.model,view.flameMount,{recoil:0,gripProfile:view.flameGrip});const muzzle=view.flameMount.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3()),target=selectCombatTarget({position:entity.pos,aim:entity.facing,targets:game.enemies,lineClear:(a,b)=>world.lineClear(a,b),range:world.flameData.contact.range,rangeOffset:e=>e.radius,coneDegrees:world.flameData.contact.coneDegrees/2,areaId:world.areaId});const enemy=target&&game.enemies.find(e=>e.id===target.targetId),pitch=enemy?Math.atan2(muzzle.y-combatTargetHeight(enemy,game.time),Math.hypot(enemy.pos.x-muzzle.x,enemy.pos.z+muzzle.z)):0;game.flame.aimPitch=pitch;applyFlamePitch(view.model,view.flameMount,pitch);}}
        }
        if(entity===game.player&&game.vest){
          view.vest??=createVestView(view.model);
          view.vest.setVisible(game.vest.equipped);view.vest.update();
        }
        view.shadow.position.copy(world.toRender(entity.pos, 0.016));
        // Only confirmed positive damage starts this window; legacy flashUntil also marks zero-damage blocks.
        const flash=(view.impactFlashLife??0)>0;
        for (const m of view.flashMaterials) {
          if(m.material.emissive){
            m.material.emissive.copy(flash?damageCrimson:m.emissive);
            m.material.emissiveIntensity=flash?.35:m.intensity;
          }
          if(m.color)m.material.color.copy(flash?damageCrimson:m.color);
        }
      }
    },
    dispose() {
      this.reset();
      droneKits.dispose();
      shadowMap.dispose();
      for(const kit of faceKits.values())kit.dispose();
      faceKits.clear();
      for(const kit of gauntKits.values())kit.dispose();
      gauntKits.clear();
      animalLooks.dispose();dogCoats.dispose();bodyShapes.dispose();roachLooks.dispose();
      for(const kit of dogKits.values())kit.dispose();
      dogKits.clear();
      shadowGeometry.dispose();
      library.dispose();
    },
  };
}
