#!/usr/bin/env node
// Post-Vite runtime closure. No build, source edits, packaging or publishing.
import {readFile, readdir, lstat, realpath, unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash = raw => createHash('sha256').update(raw).digest('hex');
function safe(name) {
 if(typeof name!=='string'||!name||/[\\%?#:]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')) throw Error(`Unsafe asset path: ${name}`);
 return name;
}
async function read(root,name) {
 safe(name);
 let current=root;
 for(const part of name.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error(`Symlink asset: ${name}`);}
 return readFile(current);
}
async function walk(root, prefix='') {
 const names=[];
 for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=prefix?`${prefix}/${entry.name}`:entry.name;safe(name);
  if(entry.isSymbolicLink())throw Error(`Symlink asset: ${name}`);
  if(entry.isDirectory())names.push(...await walk(root,name));
  else if(entry.isFile())names.push(name);
  else throw Error(`Unexpected filesystem entry: ${name}`);
 }
 return names.sort();
}
export async function verifyAssets({dist,publicDir,actors='assets/manifest-lossless.json',world='world/manifest.json',audio,prune=false}) {
 dist=await realpath(dist);publicDir=await realpath(publicDir);
 if(dist===publicDir||dist.startsWith(publicDir+path.sep)||publicDir.startsWith(dist+path.sep))throw Error('Generated/source directories overlap');
 const selected=new Map(),all=await walk(dist);
 async function select(name,expected) {
  name=safe(name);const raw=await read(dist,name);
  if(expected&&(expected.bytes!==raw.length||expected.sha256!==hash(raw)))throw Error(`Manifest hash/size mismatch: ${name}`);
  if(selected.has(name))return raw;
  selected.set(name,{path:name,bytes:raw.length,sha256:hash(raw)});return raw;
 }
 // Only Vite-generated hashed JavaScript/CSS plus the entry HTML are treated
 // as build output. All other files must resolve through public manifests.
 const html=(await select('index.html')).toString();
 const generated=all.filter(name=>/^assets\/[\w-]+-[\w-]+\.(js|css)$/.test(name));
 if(!generated.some(name=>name.endsWith('.js')))throw Error('Missing generated JavaScript');
 const reachable=new Set();
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const name=match[1].replace(/^\.\//,'');safe(name);
  if(name!=='index.html'&&!generated.includes(name))throw Error(`Unexpected HTML resource: ${name}`);
  if(generated.includes(name))reachable.add(name);
 }
 let code='';
 for(const name of reachable){
  const text=(await select(name)).toString();code+=text;
  if(name.endsWith('.css'))for(const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)){
   const ref=match[1];if(ref.startsWith('data:')||ref.startsWith('#'))continue;
   const resource=path.posix.join(path.posix.dirname(name),safe(ref.replace(/^\.\//,'')));
   const bytes=await select(resource);
   if(!bytes.equals(await read(publicDir,resource)))throw Error(`CSS resource differs from source: ${resource}`);
  }
  for(const match of text.matchAll(/["']((?:\.\/|assets\/)?[\w./-]+-[\w-]+\.(?:js|css))["']/g)){
   const ref=match[1].replace(/^\.\//,'');safe(ref);
   const dependency=ref.startsWith('assets/')?ref:path.posix.join(path.posix.dirname(name),ref);
   if(!generated.includes(dependency))throw Error(`Missing generated dependency: ${dependency}`);
   reachable.add(dependency);
  }
 }
 if(generated.some(name=>!reachable.has(name)))throw Error('Unexpected unreferenced generated asset');
 if(!code.includes(actors)||!code.includes(world))throw Error('Generated code does not select configured actor/world manifests');
 async function manifest(name){const raw=await select(name);if(!raw.equals(await read(publicDir,name)))throw Error(`Copied manifest differs from source: ${name}`);return JSON.parse(raw);}
 const modelManifest=await manifest(actors),worldManifest=await manifest(world);
 if(!modelManifest.models||!Object.keys(modelManifest.models).length||!Array.isArray(worldManifest.files)||!worldManifest.files.length)throw Error('Empty asset manifest');
 const actorRecords=new Map();
 function checkedHash(record,name){
  if(!Number.isSafeInteger(record.bytes)||record.bytes<0||!/^[0-9a-f]{64}$/.test(record.sha256))throw Error(`Missing or invalid hash record: ${name}`);
  return record;
 }
 if(modelManifest.files){
  if(Array.isArray(modelManifest.files)||typeof modelManifest.files!=='object')throw Error('Unexpected actor files schema');
  for(const record of Object.values(modelManifest.files)){
   const file=safe(record.file);checkedHash(record,file);const prior=actorRecords.get(file);
   if(prior&&(prior.bytes!==record.bytes||prior.sha256!==record.sha256))throw Error(`Conflicting actor hash records: ${file}`);
   actorRecords.set(file,record);
  }
 }
 const descriptors=Object.values(modelManifest.models).flatMap(model=>model.equipment?[model,model.equipment]:[model]);
 for(const descriptor of descriptors){
  const url=safe(descriptor.url),record=actorRecords.get(url);
  const inline=descriptor.bytes!==undefined||descriptor.sha256!==undefined?checkedHash(descriptor,url):null;
  if(inline&&record&&(inline.bytes!==record.bytes||inline.sha256!==record.sha256))throw Error(`Conflicting actor hash records: ${url}`);
  const expected=inline??record;if(!expected)throw Error(`Missing actor hash record: ${url}`);
  const name=path.posix.join(path.posix.dirname(actors),url);
  const raw=await select(name,expected);
  if(!raw.equals(await read(publicDir,name)))throw Error(`Copied actor differs from source: ${name}`);
  let gltf;
  if(name.endsWith('.glb')){
   if(raw.length<20||raw.readUInt32LE(0)!==0x46546c67||raw.readUInt32LE(4)!==2||raw.readUInt32LE(8)!==raw.length||raw.readUInt32LE(16)!==0x4e4f534a||20+raw.readUInt32LE(12)>raw.length)throw Error(`Invalid GLB header: ${name}`);
   gltf=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString().trim());
  }else if(name.endsWith('.gltf'))gltf=JSON.parse(raw);
  else throw Error(`Unexpected actor format: ${name}`);
  for(const resource of [...(gltf.buffers??[]),...(gltf.images??[])]){
   if(!resource.uri||resource.uri.startsWith('data:'))continue;
   const resourceName=path.posix.join(path.posix.dirname(name),safe(resource.uri));
   const bytes=await select(resourceName);
   if(!bytes.equals(await read(publicDir,resourceName)))throw Error(`External resource differs from source: ${resourceName}`);
  }
 }
 for(const file of worldManifest.files){const name=path.posix.join(path.posix.dirname(world),safe(file.path));const raw=await select(name,file);if(!raw.equals(await read(publicDir,name)))throw Error(`Copied world differs from source: ${name}`);}
 for(const [area,texture] of Object.entries(worldManifest.backdrops??{})){
  const name=path.posix.join(safe(area),safe(texture));
  if(!worldManifest.files.some(file=>file.path===name))throw Error(`Unlisted backdrop: ${name}`);
 }
 if(audio){
  safe(audio);
  if(!code.includes(audio))throw Error('Generated code does not select configured audio manifest');
  const audioManifest=await manifest(audio);
  const name=path.posix.join(path.posix.dirname(audio),safe(audioManifest.url));
  const raw=await select(name,checkedHash(audioManifest,name));
  if(!raw.equals(await read(publicDir,name)))throw Error(`Copied audio differs from source: ${name}`);
  if(!name.endsWith('.wav')||raw.length<12||raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE'||raw.readUInt32LE(4)+8!==raw.length)throw Error(`Unexpected or invalid WAV: ${name}`);
 }
 // Validate every exclusion before deleting anything. No blanket directory rm.
 const excluded=all.filter(name=>!selected.has(name));
 for(const name of excluded){let source;try{source=await read(publicDir,name);}catch{throw Error(`Unexpected generated asset: ${name}`);}if(!(await read(dist,name)).equals(source))throw Error(`Unexpected altered public copy: ${name}`);}
 if(excluded.length&&!prune)throw Error(`Unselected copied assets: ${excluded.join(', ')}`);
 if(prune)for(const name of excluded)await unlink(path.join(dist,name));
 const files=[...selected.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));
 return {actors,world,...(audio?{audio}:{}),files,bytes:files.reduce((n,f)=>n+f.bytes,0),removed:excluded};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const options={dist:path.join(web,'dist'),publicDir:path.join(web,'public')};
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  if(args[i]==='--prune')options.prune=true;
  else if(['--dist','--public','--actors','--world','--audio'].includes(args[i])){const key={'--dist':'dist','--public':'publicDir','--actors':'actors','--world':'world','--audio':'audio'}[args[i]];if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${args[i]} value`);options[key]=args[++i];}
  else throw Error(`Unknown argument: ${args[i]}`);
 }
 console.log(JSON.stringify(await verifyAssets(options),null,2));
}
