import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createGauntShapeLibrary} from '../src/gaunt-shape.js';import {GauntSkulkerMotion} from '../src/gaunt-motion.js';

function fixture(){
 const model=new T.Group(), bones=['pelvis','spine_01','spine_02','spine_03','neck_01'].map(name=>{const b=new T.Bone();b.name=name;return b;});
 model.add(bones[0]);for(let i=1;i<bones.length;i++){bones[i-1].add(bones[i]);bones[i].position.y=1;}
 for(const name of ['clavicle_l','clavicle_r']){const b=new T.Bone();b.name=name;bones[3].add(b);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([.3,.4,0,.3,.6,0,-.3,.5,0],3));
 geometry.setAttribute('normal',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1],2));geometry.setIndex([0,1,2]);
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(Array(12).fill(0),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial());mesh.name='Torn_modern_canvas_jacket';model.add(mesh);model.updateMatrixWorld(true);mesh.bind(new T.Skeleton(bones));
 return{model,mesh,bones};
}
test('radial gaunt shape changes girth, preserves axial positions/rig/UV/weights and shares one owned cache',()=>{
 const {model,mesh,bones}=fixture(),source=mesh.geometry, before=bones.map(b=>b.matrixWorld.clone());
 const library=createGauntShapeLibrary(model),a=clone(model),b=clone(model),one=library.apply(a),two=library.apply(b);
 const gaunt=a.getObjectByName(mesh.name).geometry;assert.equal(gaunt,b.getObjectByName(mesh.name).geometry);assert.notEqual(gaunt,source);
 assert.ok(Math.abs(gaunt.attributes.position.getX(0)-.246)<1e-6);assert.equal(gaunt.attributes.position.getY(0),source.attributes.position.getY(0));
 assert.ok(Math.abs(source.attributes.position.getX(0)-.3)<1e-6);
 for(const name of ['uv','skinIndex','skinWeight'])assert.deepEqual(gaunt.attributes[name].array,source.attributes[name].array);
 assert.deepEqual(gaunt.index.array,source.index.array);bones.forEach((bone,i)=>assert.deepEqual(bone.matrixWorld.elements,before[i].elements));
 assert.equal(library.stats().geometries,1);assert.equal(library.stats().users,2);assert.throws(()=>library.dispose(),/Remove gaunt/);
 let own=0,borrowed=0;gaunt.addEventListener('dispose',()=>own++);source.addEventListener('dispose',()=>borrowed++);mesh.material.addEventListener('dispose',()=>borrowed++);
 one.dispose();one.dispose();two.dispose();assert.equal(a.getObjectByName(mesh.name).geometry,source);library.dispose();library.dispose();assert.equal(own,1);assert.equal(borrowed,0);
});

test('skulking posture restores clean native attack/guard/death and forwards the one death pose',()=>{
 const {model,bones}=fixture();let forwarded=null,disposed=0;
 const native={model,currentClip:'HollowWalk',currentPhase:.3,sample(name,phase){this.currentClip=name;this.currentPhase=phase;model.traverse(o=>{if(o.isBone)o.quaternion.identity();});},
 update(entity,time,dt,deathPose){forwarded=deathPose;this.sample(deathPose?.clip??(entity.swing?'Riposte':'HollowWalk'),.3);},dispose(){disposed++;}};
 const motion=new GauntSkulkerMotion(native),entity={hp:40,guarding:false,dodgeUntil:0};motion.update(entity,1,1/60);
 assert.ok(bones[1].quaternion.angleTo(new T.Quaternion())>.2);
 entity.swing={};motion.update(entity,2,1/60);assert.equal(bones[1].quaternion.angleTo(new T.Quaternion()),0);assert.equal(motion.currentClip,'Riposte');
 entity.swing=null;motion.update(entity,3,1/60);assert.ok(bones[1].quaternion.angleTo(new T.Quaternion())>.2);
 entity.hp=0;const deathPose={clip:'Death',phase:.6,offset:{x:.1,z:0}};motion.update(entity,4,1/60,deathPose);
 assert.equal(forwarded,deathPose);assert.equal(bones[1].quaternion.angleTo(new T.Quaternion()),0);
 motion.sample('HollowWalk',.5,true);assert.equal(bones[1].quaternion.angleTo(new T.Quaternion()),0);motion.dispose();motion.dispose();assert.equal(disposed,1);
});
