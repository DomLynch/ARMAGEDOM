import {attachPistolSlide} from './pistol-slide.js';
import {createHitReaction} from './combat-impact.js';
import {createFinisherPresentation} from './finisher-presentation.js';
import {createVestView} from './vest-view.js';
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {HOLLOW_GARMENTS,hollowPaletteFor,applyHollowPalette} from "./hollow-palette.js";
import { ActorMotion } from "./motion.js";
import {attachPistol,applyPistolAim} from "./pistol-pose.js";
import { DonorMotion, equipDonorPlayer } from "./donor-motion.js";
import { disposeActorSources } from "./actor-resources.js";
import { hollowLocomotionFor, AREA_MOB_SPAWNS } from "./area-mob-spawns.js";
import { CrookedHollowMotion } from "./crooked-hollow.js";
import {createFaceAppearanceLibrary} from './face-appearance.js';
import {FACE_APPEARANCE_VERSION,FACE_RECIPES,ORIGINAL_FACE_ID} from './face-recipes.js';
import {allocateFaceRecipes} from './face-allocator.js';
const residentFaces=allocateFaceRecipes('london-residents',Object.values(AREA_MOB_SPAWNS).flat().map(r=>r.key),{version:FACE_APPEARANCE_VERSION,recipes:FACE_RECIPES});
const names = ["revenant", "orc", "warlock", "warlord"];
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
  const models = new Map();
  let pistolAsset=null;
  const urls = new Map();
  const sources = new Set();
  function load(url) {
    if (!urls.has(url))
      urls.set(
        url,
        loader.loadAsync(url).then((gltf) => {
          sources.add(gltf);
          return gltf;
        }),
      );
    return urls.get(url);
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeActorSources(sources);
    sources.clear();
    models.clear();
    urls.clear();
  };

  // Settle every request before releasing sources: late successful loads also
  // belong to this attempt, including the shared Orc/Warlord GLB.
  const results = await Promise.allSettled(
    [...Object.entries(manifest.models).map(async ([name, description]) => {
      const url = new URL(description.url, manifestURL).href;
      const parts = await Promise.allSettled([
        load(url),
        description.equipment
          ? load(new URL(description.equipment.url, manifestURL).href)
          : Promise.resolve(null),
      ]);
      const failed = parts.find(part => part.status === "rejected");
      if (failed) throw failed.reason;
      const [gltf, equipment] = parts.map(part => part.value);
      models.set(name, { gltf, description, equipment });
      onProgress(name);
    }), ...(manifest.pistol?[load(new URL(manifest.pistol.url,manifestURL).href).then(asset=>{pistolAsset=asset})]:[])],
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure || !models.has("vagrant")) {
    dispose();
    throw failure?.reason ?? Error("Survivor export missing");
  }
  return {
    models,
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
  const faceKits=new Map();
  let feedbackMode='high',lastReduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const views = new Map(),
    shadowMap = shadowTexture(),
    shadowGeometry = new THREE.PlaneGeometry(1, 1);
  function make(entity,finishers=false,restoreCorpses=false) {
    const name =
        entity.kind < 0
          ? "vagrant"
          : library.manifest.pilot === "donor-knife"
            ? entity.rig
            : names[entity.kind],
      source = library.models.get(name);
    if (!source) throw Error(`Original ${name} export not ready`);
    const garments=source.description.clothingMaterials??(entity.rig==='hollow-scavenger'?HOLLOW_GARMENTS:null);
    const palette=entity.kind>=0&&garments?hollowPaletteFor(entity,world.areaId):null;
    const root = new THREE.Group(),
      model = clone(source.gltf.scene),
      description = source.description,
      materials = [];
    const animations = source.equipment
      ? equipDonorPlayer(
          { scene: model, animations: source.gltf.animations },
          source.equipment,
        ).animations
      : source.gltf.animations;
    const pistolMount=entity.kind<0&&library.pistolAsset?attachPistol(model,library.pistolAsset.scene):null;
    if(pistolMount)pistolMount.visible=false;
    const knife=entity.kind<0?model.getObjectByName('WeaponDrawn'):null;
    root.name = name;
    root.position.copy(world.toRender(entity.pos));
    root.scale.setScalar(
      (world.layout.characterScale ?? 1.265) * (description.scale ?? 1) * visualScale * (entity.kind>=0?(entity.mobSize??1):1),
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
    let appearance=null;
    if(entity.kind>=0&&entity.rig==='hollow-scavenger'){
      if(!faceKits.has(source.gltf.scene))faceKits.set(source.gltf.scene,createFaceAppearanceLibrary(source.gltf.scene));
      appearance=faceKits.get(source.gltf.scene).apply(model,residentFaces.get(entity.placementKey)??ORIGINAL_FACE_ID);
    }
    const flashMaterials=[...materials,...(appearance?.extraMaterials??[]).map(material=>({material,emissive:material.emissive?.clone(),intensity:material.emissiveIntensity}))];
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
      materials,appearance,flashMaterials,
      entity,
      description,
      locomotionVariant: hollowLocomotionFor(entity),
      palette,
      pistolMount,pistolSlide:attachPistolSlide(pistolMount),knife,hitReaction:createHitReaction({mode:feedbackMode,reducedMotion:reducedMotion()}),
    };
    views.set(entity.id, view);
    try {
      const Motion =
        description.motion === "donor-knife" ? DonorMotion : ActorMotion;
      view.motion = new Motion(root, model, animations, description);
      if (view.locomotionVariant === 'crooked-hollow')
        view.motion = new CrookedHollowMotion(view.motion);
      scene.add(root, shadow);
      if(finishers&&entity.kind>=0&&entity.rig==='hollow-scavenger'){
        view.finisher=createFinisherPresentation({root,model,clips:animations,scene,groundY:0,prepareHead:finishers.maxHeads>0&&(entity.hp>0||restoreCorpses&&entity.finisher?.recipeId==='decapitation'),isBlocked:(point,radius,from)=>!world.geometry.clear(point,radius)||!!from&&!world.geometry.lineClear(from,point)});
        entity.finisherSupport=view.finisher.support;
        view.restoredCorpse=restoreCorpses&&entity.hp<=0;
      }
    } catch (error) {
      remove(entity.id);
      throw error;
    }
    return view;
  }
  function remove(id) {
    const view = views.get(id);
    if (!view) return;
    view.finisher?.dispose();
    if(view.finisher){view.entity.finisherSupport=[];view.entity.finisherHeadUntil=0;}
    view.pistolSlide.dispose();
    view.appearance?.dispose();
    view.vest?.dispose();
    view.motion?.dispose();
    const skeletons = new Set();
    view.model.traverse((o) => {
      if (o.skeleton) skeletons.add(o.skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
    scene.remove(view.root, view.shadow);
    view.shadow.material.dispose();
    for (const m of view.materials) m.material.dispose();
    views.delete(id);
  }
  return {
    views,
    configureFeedback(mode){feedbackMode=mode;for(const v of views.values()){v.hitReaction.configure({mode,reducedMotion:reducedMotion()});v.pistolSlide.reset();}},
    resetFeedback(){for(const v of views.values()){v.hitReaction.reset();v.hitReactionFresh=false;v.pistolSlide.reset();}},
    events(game){for(const e of game.events)if(e.type==='hit'&&!e.blocked&&e.amount>0){const v=views.get(e.actor?.id);if(v){v.hitReactionFresh=true;v.hitReaction.hit({x:e.impactDirection?.x??0,z:e.impactDirection?.z??0,killed:e.actor.hp<=0});}}},
    reset() {
      for (const id of [...views.keys()]) remove(id);
    },
    update(game, dt, pistolRecoil=0, {presentationDt=dt,restoreCorpses=false}={}) {
      if(lastReduced!==reducedMotion()){lastReduced=reducedMotion();this.configureFeedback(feedbackMode);}
      const entities = [game.player, ...game.enemies, ...(game.corpses ?? [])],
        ids = new Set(entities.map((e) => e.id));
      for (const id of [...views.keys()]) if (!ids.has(id)) remove(id);
      for (const entity of entities) {
        const view = views.get(entity.id) ?? make(entity,game.finishers,restoreCorpses);
        view.root.position.copy(world.toRender(entity.pos));
        view.root.rotation.y =
          Math.atan2(entity.facing.x, -entity.facing.z) +
          (view.description.forwardCorrection ?? 0);
        view.root.updateMatrixWorld(true);
        let deathPose=null;
        if(entity.hp<=0&&view.finisher&&entity.finisher){
          if(!view.finisherStarted){
            const recipe=view.finisher.start(entity.finisher);view.finisherStarted=true;view.finisherAge=Math.max(0,game.time-(entity.response?.start??game.time));
            if(view.restoredCorpse&&recipe.parts.includes('head')){
              if(view.finisherAge>=6)view.finisher.update(view.finisherAge,0);
              else for(let age=0;age<view.finisherAge;){const step=Math.min(1/60,view.finisherAge-age);age+=step;view.finisher.update(age,step);}
              entity.finisherHeadUntil=game.time+Math.max(0,6-view.finisherAge);
            }
            if(!view.finisher.stats().detached)entity.finisherHeadUntil=0;
          }
          else view.finisherAge=Math.max(game.time-(entity.response?.start??game.time),view.finisherAge+Math.max(0,presentationDt));
          deathPose=view.finisher.pose(view.finisherAge);view.finisher.update(view.finisherAge,presentationDt);
          if(view.finisher.stats().expired)entity.finisherHeadUntil=0;
        }
        view.motion.update(
          entity,
          game.time,
          game.finished && view.description.motion !== "donor-knife" ? 0 : dt,
          deathPose,
        );
        const reaction=view.hitReaction.update(view.hitReactionFresh?0:presentationDt,{paused:presentationDt===0});
        view.hitReactionFresh=false;
        // Living flinch and native corpse pose share this sole render transform owner.
        if(entity.hp>0){const lean=reaction.energy*.30;view.root.rotation.x=-reaction.z*lean;view.root.rotation.z=-reaction.x*lean;const flinch={x:entity.pos.x+reaction.x*reaction.energy*.10,z:entity.pos.z+reaction.z*reaction.energy*.10};if((!world.geometry?.clear||world.geometry.clear(flinch,entity.radius))&&(!world.lineClear||world.lineClear(entity.pos,flinch)))view.root.position.copy(world.toRender(flinch));}else{view.root.rotation.x=view.root.rotation.z=0;}
        if(deathPose){view.root.position.x+=deathPose.offset.x;view.root.position.z-=deathPose.offset.z;view.root.updateMatrixWorld(true);}
        if(view.pistolMount){
          const holding=entity.weapon==='pistol',pose=holding&&entity.hp>0&&game.time>=entity.dodgeUntil&&game.time>=entity.hurtUntil;
          if(view.knife)view.knife.visible=!holding;view.pistolMount.visible=pose;
          if(pose)applyPistolAim(view.model,view.pistolMount,{recoil:pistolRecoil});
          view.pistolSlide.setRecoil(pose?pistolRecoil:0);
        }
        if(entity===game.player&&game.vest){
          view.vest??=createVestView(view.model);
          view.vest.setVisible(game.vest.equipped);view.vest.update();
        }
        view.shadow.position.copy(world.toRender(entity.pos, 0.016));
        const flash = !game.finished && entity.flashUntil > game.time;
        for (const m of view.flashMaterials) {
          if (m.material.emissive) {
            m.material.emissive.copy(
              flash ? new THREE.Color(0.65, 0.2, 0.05) : m.emissive,
            );
            m.material.emissiveIntensity = flash ? 0.8 : m.intensity;
          }
        }
      }
    },
    dispose() {
      this.reset();
      shadowMap.dispose();
      for(const kit of faceKits.values())kit.dispose();
      faceKits.clear();
      shadowGeometry.dispose();
      library.dispose();
    },
  };
}
