import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {normalizedCopy,sha,decode} from './probe.mjs';
const revision='303af39e97b758f50a84935eeb0cac6196fe98ae';
const donor='/Users/domininclynch/Desktop/Business/frankendom';
const expected=JSON.parse(fs.readFileSync('art/donor/receipts/quaternion-playback-probe.json'));
const output='Web/public/assets/donor';fs.mkdirSync(output,{recursive:true});
const validator=createRequire(import.meta.url)('/Users/domininclynch/Desktop/Business/ARMAGEDOM/worktrees/character/art/browser/tools/node_modules/gltf-validator');
const files={player:['src/assets/warrior.glb','warrior.glb'],opponent:['src/assets/goblin.glb','goblin.glb'],weapon:['src/assets/weapons/player/knife.glb','knife.glb']};
const receipt={revision,files:{}};
for(const [role,[source,file]]of Object.entries(files)){
 const original=execFileSync('git',['-C',donor,'show',`${revision}:${source}`],{maxBuffer:30e6});
 if(sha(original)!==expected.files[role].sourceSha256)throw Error('Pinned source mismatch');
 const candidate=normalizedCopy(original);
 if(sha(candidate.bytes)!==expected.files[role].candidateSha256)throw Error('Probe candidate mismatch');
 fs.writeFileSync(path.join(output,file),candidate.bytes);
 const written=fs.readFileSync(path.join(output,file));
 const report=await validator.validateBytes(new Uint8Array(written),{uri:file});
 fs.writeFileSync(`art/donor/receipts/${role}-validator.json`,JSON.stringify(report,null,2)+'\n');
 if(report.issues.numErrors)throw Error(`${role}: ${report.issues.numErrors} validation errors`);
 const sourceDoc=decode(original).doc,doc=decode(written).doc;
 const rotationAccessors=new Set();for(const clip of sourceDoc.animations??[])for(const channel of clip.channels)if(channel.target.path==='rotation')rotationAccessors.add(clip.samplers[channel.sampler].output);
 const sourceBin=decode(original).bin,candidateBin=decode(written).bin,allowed=new Uint8Array(sourceBin.length);
 for(const id of rotationAccessors){const a=sourceDoc.accessors[id],v=sourceDoc.bufferViews[a.bufferView],start=(v.byteOffset??0)+(a.byteOffset??0);allowed.fill(1,start,start+a.count*16);doc.accessors[id].min=a.min;doc.accessors[id].max=a.max;}
 if(sourceBin.length!==candidateBin.length)throw Error('Binary length changed');
 for(let i=0;i<sourceBin.length;i++)if(sourceBin[i]!==candidateBin[i]&&!allowed[i])throw Error('Non-rotation data changed');
 if(JSON.stringify(doc)!==JSON.stringify(sourceDoc))throw Error('GLB JSON changed outside output bounds');
 receipt.files[role]={source,file,bytes:written.length,sourceSha256:sha(original),sha256:sha(written),normalizedKeyframes:candidate.normalizedKeyframes,errors:report.issues.numErrors,warnings:report.issues.numWarnings};
}
const clips={idle:'Armed',walk:'ArmedWalk',run:'Run',slash:'Attack',return:'Return',stab:'Riposte',heavy:'Heavy',special:'Skill_Pommel',guard:'Guard',dodge:'Roll',hit:'Hit',death:'Death',parry:'Parry',block:'BlockImpact',deflected:'Deflected'};
const manifest={schemaVersion:1,pilot:'donor-knife',revision,models:{vagrant:{url:'warrior.glb',rig:'hero',motion:'donor-knife',scale:1,forwardCorrection:0,stride:1,clips,equipment:{url:'knife.glb',mount:'hand_r',node:'WeaponDrawn',overrides:['Heavy','Death_QuietOne']}},goblin:{url:'goblin.glb',rig:'goblin',motion:'donor-knife',scale:1,forwardCorrection:0,stride:.7014,clips:Object.fromEntries(Object.entries(clips).filter(([key])=>key!=='special'))}},files:receipt.files,review:{status:'CPU-validated candidate; game review pending',provenance:'Pinned donor build scripts cite CC0 base bodies/animations. Generated head/material/knife service license receipts not fully traced.',limits:['Retain embedded root scale/offset and per-rig binds. Apply common characterScale 1.265 once outside original scene.','Goblin capsule bodyScale is not a visual scale multiplier.','No native London/browser/phone/material acceptance claimed.']}};
fs.writeFileSync(`${output}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync('art/donor/receipts/candidate.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
