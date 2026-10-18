import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {fileURLToPath} from 'node:url';
import {parse,version as parserVersion} from 'acorn';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const property=node=>node?.type==='MemberExpression'?node.computed?literal(node.property):node.property.name:null;
const literal=node=>node?.type==='Literal'?node.value:node?.type==='TemplateLiteral'&&!node.expressions.length?node.quasis[0].value.cooked:undefined;
const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
const interactions=new Set(['click','dblclick','tap','press','pressSequentially','type','fill','down','up','move','wheel','hover','focus','blur','check','uncheck','selectOption','setInputFiles','dispatchEvent','dragTo','goto','reload','goBack','goForward','touchStart','touchEnd']);
const reads=new Set(['readFile','readFileSync','createReadStream']);
const processes=new Set(['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']);
// Maintained authority, not a candidate-supplied exemption. Submission must bind
// THIS module's bytes to its independently maintained copy, not merely a report.
export const MAINTAINED_ADAPTER_POLICY=Object.freeze([Object.freeze({path:'scripts/qa/weapon-action-guard.mjs',sha256:'0f86143254648d07b41d452b0221593807b3a65b26b147adc358257e1b5624a4',exports:Object.freeze(['weaponAction']),callbackSlots:Object.freeze(['press','release']),callbackArguments:Object.freeze([])}),Object.freeze({path:'scripts/qa/ui-interaction-guard.mjs',sha256:'da80a0f8ba98617ae70dfd36e7e1dc914491ab1aead5c3a52e033c9a9c76be0b',exports:Object.freeze(['checkedControl','checkedNavigation']),internals:Object.freeze(['perform','releaseInputs']),browserCallbacks:Object.freeze(['ack']),callbackSlots:Object.freeze([]),callbackArguments:Object.freeze([])})]);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const manifestJSON=value=>JSON.stringify(canonical(value)).replace(/[\u007f-\uffff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
const patternNames=node=>!node?[]:node.type==='Identifier'?[node.name]:node.type==='RestElement'?patternNames(node.argument):node.type==='AssignmentPattern'?patternNames(node.left):node.type==='ObjectPattern'?node.properties.flatMap(p=>patternNames(p.value??p.argument)):node.type==='ArrayPattern'?node.elements.flatMap(patternNames):[];
function walk(node,visit,ancestors=[]){
 if(!node||typeof node.type!=='string')return;
 visit(node,ancestors);
 for(const [key,value]of Object.entries(node))if(!['loc','start','end'].includes(key)){
  if(Array.isArray(value))for(const child of value)walk(child,visit,[...ancestors,node]);
  else if(value&&typeof value.type==='string')walk(value,visit,[...ancestors,node]);
 }
}

/** Static-only, no driver import/execution, browser, upload or child process. */
export async function driverPreflight(config={}){
 const report={schemaVersion:1,status:'FAIL_STATIC_DRIVER_PREFLIGHT',phase:'static',root:null,identity:null,configSHA256:hash(JSON.stringify(canonical(config))),policySHA256:hash(JSON.stringify(MAINTAINED_ADAPTER_POLICY)),files:[],graph:[],errors:[],tool:{sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),parser:{name:'acorn',version:parserVersion,sha256:hash(fs.readFileSync(fileURLToPath(import.meta.resolve('acorn'))))}},limits:[
  'No driver execution, visibility/readiness, selected-weapon binding, acknowledgement or gameplay-result proof. Those remain the browser phase.',
  'Bounded JS/ESTree syntax analysis, not arbitrary JavaScript data-flow verification. Dynamic code/paths/calls outside the supported subset fail closed.',
  'Only maintained entrypoints and their resolved local closure are checked. Direct shell/legacy launch routes that skip this module are not intercepted.',
  'Trusted adapter exemptions require exact source hash and named function exports; their behavior still needs the existing owner review and runtime tests.',
  'External packages are recorded via explicit pinned lockfile entries, not recursively analyzed; runtime package installation/resolution is outside this static result.',
  'Package identity checks the actual release manifest and listed payload hashes; the submission owner also enforces complete export closure.'
 ]};
 const error=(code,file,message,node)=>report.errors.push({code,path:file??null,line:node?.loc?.start.line??null,message});
 let root;
 try{root=fs.realpathSync(config.stageRoot);if(!fs.statSync(root).isDirectory())throw Error('not directory');report.root=root;}catch(e){error('INVALID_STAGE_ROOT',null,String(e.message));return report;}
 for(const key of ['dataFiles','trustedAdapters','externals'])if(config[key]!==undefined&&!Array.isArray(config[key])){error('INVALID_CONFIG',null,key+' must be an array');return report;}
 const records=new Map(),asts=new Map(),queue=[],trust=new Map(),externals=new Map();
 function local(input,base=root){
  if(typeof input!=='string'||!input||input.includes('\0'))throw Error('literal nonempty file path required');
  const resolved=path.resolve(base,input),relative=path.relative(root,resolved);
  if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('path outside staged root');
  const real=fs.realpathSync(resolved);if(real!==resolved)throw Error('symlink/aliased input rejected');
  if(!fs.statSync(real).isFile())throw Error('not a regular file');return{absolute:real,relative:relative.split(path.sep).join('/')};
 }
 function add(input,kind,from=null,base=root,edge=kind){
  try{
   const file=local(input,base),bytes=fs.readFileSync(file.absolute);let record=records.get(file.relative);
   if(!record){record={path:file.relative,kind,sha256:hash(bytes),bytes:bytes.length};records.set(file.relative,record);if(/\.(mjs|cjs|js)$/.test(file.relative))queue.push({...file,code:bytes.toString('utf8')});else if(file.relative.endsWith('.json'))JSON.parse(bytes.toString('utf8'));}
   if(from)report.graph.push({from,to:file.relative,kind:edge});return{...file,record};
  }catch(e){error('DEPENDENCY_UNAVAILABLE',from??String(input),`${kind}: ${String(input)}: ${e.message}`);return null;}
 }
 if(!Array.isArray(config.entrypoints)||!config.entrypoints.length)error('MISSING_ENTRYPOINTS',null,'At least one submitted maintained JS entrypoint is required');
 else for(const entry of config.entrypoints){if(typeof entry!=='string'||!(/\.(mjs|cjs|js)$/.test(entry)))error('UNSUPPORTED_ENTRYPOINT',String(entry),'Only explicit JS entrypoints are supported; shell/Python wrappers are not analyzed');else add(entry,'entrypoint');}
 for(const data of config.dataFiles??[])add(data,'declared-data');
 for(const item of config.trustedAdapters??[]){
  const maintained=MAINTAINED_ADAPTER_POLICY.find(row=>row.path===item.path);
  if(!maintained||JSON.stringify(canonical({...item,callbackArguments:item.callbackArguments??[],callbackSlots:item.callbackSlots??[]}))!==JSON.stringify(canonical(maintained)))error('CANDIDATE_TRUST_REJECTED',item.path,'Candidate cannot add/change maintained adapter policy');
 }
 for(const external of config.externals??[]){
  const file=add(external.manifest,'external-lockfile');if(!file)continue;
  try{const lock=JSON.parse(fs.readFileSync(file.absolute,'utf8')),entry=lock.packages?.['node_modules/'+external.specifier];if(!external.specifier||typeof external.version!=='string'||entry?.version!==external.version||!entry.integrity)throw Error('Matching resolved lockfile version/integrity required');externals.set(external.specifier,{specifier:external.specifier,version:entry.version,integrity:entry.integrity,manifest:file.relative});}catch(e){error('UNPINNED_EXTERNAL',external.manifest,e.message);}
 }
 // Parse first, resolving only syntax-declared local imports and literal fixtures.
 const imports=new Map(),exportsByFile=new Map(),definitionsByFile=new Map();
 while(queue.length){
  const file=queue.shift();let ast;
  try{ast=parse(file.code,{ecmaVersion:'latest',sourceType:file.relative.endsWith('.cjs')?'script':'module',locations:true,allowHashBang:true});asts.set(file.relative,ast);}catch(e){error('SYNTAX_ERROR',file.relative,e.message,{loc:{start:{line:e.loc?.line}}});continue;}
  const bindings=new Map(),constants=new Map(),ambiguous=new Set(),definitions=new Map(),exported=new Map(),readAliases=new Set();
  walk(ast,node=>{
   if(node.type==='VariableDeclaration')for(const d of node.declarations)for(const name of patternNames(d.id)){if(constants.has(name)||node.kind!=='const'||d.id.type!=='Identifier')ambiguous.add(name);if(node.kind==='const'&&d.id.type==='Identifier')constants.set(name,d.init);}
   if(functions.has(node.type))for(const name of node.params.flatMap(patternNames))ambiguous.add(name);
   if(node.type==='CatchClause')for(const name of patternNames(node.param))ambiguous.add(name);
   if(node.type==='FunctionDeclaration'&&node.id)definitions.set(node.id.name,node);
   if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&functions.has(node.init?.type))definitions.set(node.id.name,node.init);
  });
  function evaluate(node,depth=0){
   if(depth>12)return undefined;const text=literal(node);if(typeof text==='string')return text;
   if(node?.type==='Identifier'&&constants.has(node.name)&&!ambiguous.has(node.name))return evaluate(constants.get(node.name),depth+1);
   if(node?.type==='BinaryExpression'&&node.operator==='+'){const a=evaluate(node.left,depth+1),b=evaluate(node.right,depth+1);return typeof a==='string'&&typeof b==='string'?a+b:undefined;}
   if(node?.type==='MemberExpression'&&node.object.type==='MetaProperty'&&node.object.meta.name==='import'){if(property(node)==='url')return{url:file.absolute};if(property(node)==='dirname')return path.dirname(file.absolute);if(property(node)==='filename')return file.absolute;}
   if(node?.type==='NewExpression'&&node.callee.name==='URL'&&!constants.has('URL')&&!ambiguous.has('URL')&&node.arguments.length===2){const value=evaluate(node.arguments[0],depth+1),base=evaluate(node.arguments[1],depth+1);if(typeof value==='string'&&base?.url&&!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value))return{file:path.resolve(path.dirname(base.url),value)};}
   if(node?.type==='CallExpression'){
    const binding=bindings.get(node.callee.type==='Identifier'?node.callee.name:node.callee.object?.name),method=node.callee.type==='Identifier'?binding?.export:property(node.callee);
    if(binding?.source==='node:url'&&method==='fileURLToPath'){const value=evaluate(node.arguments[0],depth+1);return value?.url??value?.file;}
    if(binding?.source==='node:path'&&['join','resolve','dirname'].includes(method)){const values=node.arguments.map(n=>evaluate(n,depth+1));if(values.every(x=>typeof x==='string'))return method==='dirname'&&values.length===1?path.dirname(values[0]):method==='join'?path.join(...values):method==='resolve'?path.resolve(root,...values):undefined;}
   }
   return undefined;
  }
  function dependency(spec,node){
   if(typeof spec!=='string'){error('DYNAMIC_DEPENDENCY',file.relative,'Import/require must have a literal specifier',node);return null;}
   if(spec.startsWith('.')){if(!/\.(js|mjs|cjs|json)$/.test(spec)){error('UNSUPPORTED_MODULE_SYNTAX',file.relative,'Only explicit JS/JSON module paths are supported: '+spec,node);return null;}return add(spec,'local-module',file.relative,path.dirname(file.absolute),'import')?.relative;}
   if(isBuiltin(spec)){const builtin='node:'+spec.replace(/^node:/,'');if(builtin==='node:child_process')error('UNSUPPORTED_PROCESS_CAPABILITY',file.relative,'Child-process import/require cannot be a submitted driver dependency, including aliases',node);return builtin;}
   const external=externals.get(spec);if(external){report.graph.push({from:file.relative,to:spec,kind:'pinned-external'});return spec;}
   error('UNRESOLVED_EXTERNAL',file.relative,'Not a builtin or explicit pinned external: '+spec,node);return null;
  }
  for(const node of ast.body){
   if(node.type==='ImportDeclaration'){
    const source=dependency(node.source.value,node);for(const spec of node.specifiers){bindings.set(spec.local.name,{source,export:spec.type==='ImportNamespaceSpecifier'?'*':spec.type==='ImportDefaultSpecifier'?'default':spec.imported.name??spec.imported.value});if(['fs','node:fs','fs/promises','node:fs/promises'].includes(node.source.value)&&reads.has(spec.imported?.name))readAliases.add(spec.local.name);}
   }else if(node.type==='ExportNamedDeclaration'){
    if(node.source)dependency(node.source.value,node);
    else if(node.declaration){const d=node.declaration;if(d.type==='FunctionDeclaration')exported.set(d.id.name,d);else if(d.type==='VariableDeclaration')for(const v of d.declarations)if(v.id.type==='Identifier'&&functions.has(v.init?.type))exported.set(v.id.name,v.init);}
    else for(const spec of node.specifiers){const fn=definitions.get(spec.local.name);if(fn)exported.set(spec.exported.name??spec.exported.value,fn);}
   }else if(node.type==='ExportAllDeclaration')dependency(node.source.value,node);
   else if(node.type==='ExportDefaultDeclaration'&&functions.has(node.declaration.type))exported.set('default',node.declaration);
  }
  walk(ast,node=>{
   if(node.type==='ImportExpression')dependency(literal(node.source),node);
   if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='require')dependency(literal(node.arguments[0]),node);
   if(node.type==='CallExpression'&&(reads.has(property(node.callee))||readAliases.has(node.callee.name))){const value=evaluate(node.arguments[0]);if(typeof value==='string'||value?.file)add(value?.file??value,'data-fixture',file.relative,root,'fixture');else error('DYNAMIC_FIXTURE',file.relative,'Data read cannot be resolved statically; declare/refactor a literal fixture path',node);}
  });
  imports.set(file.relative,bindings);exportsByFile.set(file.relative,exported);definitionsByFile.set(file.relative,definitions);
 }
 for(const item of MAINTAINED_ADAPTER_POLICY)if(records.has(item.path)){
  if(records.get(item.path).sha256!==item.sha256)error('TRUSTED_HELPER_HASH_MISMATCH',item.path,'Maintained adapter bytes differ; no exemptions granted');
  else trust.set(item.path,item);
 }
 const ranges=new Map();
 for(const [file,item]of trust){const approved=[];for(const name of item.exports){const fn=exportsByFile.get(file)?.get(name);if(!fn)error('TRUST_EXPORT_UNRESOLVED',file,'Approved export is not a directly resolved function: '+name);else approved.push({start:fn.start,end:fn.end,reason:'trusted-export:'+name,browserCallbacks:item.browserCallbacks??[]});}for(const name of item.internals??[]){const fn=definitionsByFile.get(file)?.get(name);if(!fn)error('TRUST_INTERNAL_UNRESOLVED',file,'Reviewed internal is not a directly resolved function: '+name);else approved.push({start:fn.start,end:fn.end,reason:'trusted-internal:'+name,browserCallbacks:item.browserCallbacks??[]});}ranges.set(file,approved);}
 for(const [file,ast]of asts){
  const bindings=imports.get(file),approved=ranges.get(file)??[],shadowed=new Set();
  walk(ast,node=>{let names=[];if(functions.has(node.type))names=node.params.flatMap(patternNames);if(node.type==='VariableDeclarator')names.push(...patternNames(node.id));if(node.type==='CatchClause')names.push(...patternNames(node.param));if(node.type==='FunctionDeclaration'&&node.id)names.push(node.id.name);for(const name of names)if(bindings.has(name))shadowed.add(name);});
  function adapterFor(callee){
   let binding,name;if(callee.type==='Identifier'){if(shadowed.has(callee.name))return null;binding=bindings.get(callee.name);name=binding?.export;}else if(callee.type==='MemberExpression'&&callee.object.type==='Identifier'&&!shadowed.has(callee.object.name)){binding=bindings.get(callee.object.name);if(binding?.export==='*')name=property(callee);}
   const item=trust.get(binding?.source);return item&&item.exports.includes(name)?item:null;
  }
  walk(ast,node=>{
   if(node.type!=='CallExpression')return;const item=adapterFor(node.callee);if(!item)return;
   for(const index of item.callbackArguments){const argument=node.arguments[index];if(functions.has(argument?.type))approved.push({start:argument.start,end:argument.end,reason:'adapter-callback-argument'});}
   for(const argument of node.arguments)if(argument.type==='ObjectExpression')for(const prop of argument.properties){if(prop.type!=='Property')continue;const name=prop.computed?literal(prop.key):prop.key.name??prop.key.value;if(item.callbackSlots.includes(name)&&functions.has(prop.value?.type))approved.push({start:prop.value.start,end:prop.value.end,reason:'adapter-callback-slot:'+name});}
  });
  const allowed=node=>approved.some(range=>node.start>=range.start&&node.end<=range.end);
  walk(ast,(node,ancestors)=>{
   if(node.type==='CallExpression'||node.type==='NewExpression'){
    const callee=node.callee,method=property(callee);
    if(callee.type==='Identifier'&&['eval','Function'].includes(callee.name))error('UNSUPPORTED_DYNAMIC_CODE',file,'Dynamic code cannot be statically verified',node);
    if(callee.type==='MemberExpression'&&callee.computed&&typeof method!=='string')error('UNRESOLVED_COMPUTED_CALL',file,'Computed call has no literal method name',node);
    const reviewedCallback=node.arguments[0]?.type==='Identifier'&&['evaluate','waitForFunction'].includes(method)&&approved.some(range=>node.start>=range.start&&node.end<=range.end&&(range.browserCallbacks??[]).includes(node.arguments[0].name));
    if(['evaluate','evaluateHandle','waitForFunction','addInitScript'].includes(method)&&!functions.has(node.arguments[0]?.type)&&!reviewedCallback)error('UNSUPPORTED_BROWSER_EVALUATION',file,'Browser callback is not inline or an exact reviewed internal predicate parameter',node);
    if(processes.has(method)||callee.type==='Identifier'&&processes.has(callee.name))error('UNSUPPORTED_PROCESS_DISPATCH',file,'Child-process/shell dispatch is outside supported closure',node);
    const cdp=method==='send'?literal(node.arguments[0]):null;
    if(method==='getBuiltinModule'&&['child_process','node:child_process'].includes(literal(node.arguments[0])))error('UNSUPPORTED_PROCESS_CAPABILITY',file,'Child-process builtin capability is outside supported drivers',node);
    if(method==='require'&&['child_process','node:child_process'].includes(literal(node.arguments[0])))error('UNSUPPORTED_PROCESS_CAPABILITY',file,'Child-process require capability is outside supported drivers',node);
    if(method==='send'&&typeof cdp!=='string'&&!allowed(node))error('UNRESOLVED_PROTOCOL_CALL',file,'Protocol method must be a statically inspectable literal',node);
    if(cdp==='Runtime.evaluate'||cdp==='Runtime.callFunctionOn')error('UNSUPPORTED_DYNAMIC_CODE',file,'CDP evaluation is not statically verified',node);
    if((interactions.has(method)||typeof cdp==='string'&&cdp.startsWith('Input.'))&&!allowed(node))error('UNGUARDED_INTERACTION',file,'Interaction is outside an exact trusted export or direct guarded callback: '+(cdp??method),node);
   }
   if(node.type==='MemberExpression'&&interactions.has(property(node))){const parent=ancestors.at(-1);if(!(parent?.type==='CallExpression'&&parent.callee===node)&&!allowed(node))error('UNGUARDED_INTERACTION_REFERENCE',file,'Interaction method extraction/alias is not guarded',node);}
   if(node.type==='MemberExpression'&&property(node)==='send'){const parent=ancestors.at(-1);if(!(parent?.type==='CallExpression'&&parent.callee===node)&&!allowed(node))error('UNSUPPORTED_PROTOCOL_ALIAS',file,'Protocol send extraction/bind/call/apply is not supported',node);}
   if(node.type==='ObjectPattern'&&!allowed(node))for(const prop of node.properties)if(prop.type==='Property'&&(prop.computed?literal(prop.key):prop.key.name??prop.key.value)==='send')error('UNSUPPORTED_PROTOCOL_ALIAS',file,'Protocol send destructuring is not supported',node);
   if(node.type==='ObjectPattern'&&!allowed(node))for(const prop of node.properties)if(prop.type==='Property'&&interactions.has(prop.computed?literal(prop.key):prop.key.name??prop.key.value))error('UNGUARDED_INTERACTION_DESTRUCTURE',file,'Interaction method destructuring/alias is not guarded',node);
  });
  for(const name of shadowed)if(trust.has(bindings.get(name)?.source))error('ADAPTER_BINDING_SHADOWED',file,'Trusted imported adapter name is shadowed: '+name);
 }
 report.externals=[...externals.values()];report.trustedAdapters=[...trust.values()];
 if(config.sourceManifest){
  const file=add(config.sourceManifest,'source-manifest');
  if(file)try{
   const manifest=JSON.parse(fs.readFileSync(file.absolute,'utf8'));
   if(!/^[a-f0-9]{40}$/.test(manifest.head??'')||!/^[a-f0-9]{64}$/.test(manifest.fingerprint??'')||!Array.isArray(manifest.files)||!manifest.files.length||hash(manifestJSON(manifest.files))!==manifest.fingerprint)throw Error('Source manifest head/fingerprint invalid');
   const seen=new Set();for(const row of manifest.files){if(typeof row.path!=='string'||path.isAbsolute(row.path)||row.path.split(/[\\/]/).includes('..')||seen.has(row.path))throw Error('Invalid/duplicate source path');seen.add(row.path);const input=add(row.path,'source-input',file.relative,root,'source');if(!input||input.record.sha256!==row.sha256||input.record.bytes!==row.bytes)throw Error('Source input mismatch: '+row.path);}
   report.identity={source:manifest.head,fingerprint:manifest.fingerprint,packageSha256:null};
  }catch(e){error('SOURCE_IDENTITY_FAILED',file.relative,e.message);}
 }
 if(config.packageRoot){
  const releaseFile=add(path.join(config.packageRoot,'release.json'),'package-release');
  if(releaseFile)try{
   const release=JSON.parse(fs.readFileSync(releaseFile.absolute,'utf8')),identity={source:release.sourceCommit,fingerprint:release.sourceFingerprint,packageSha256:releaseFile.record.sha256};
   if(report.identity&&(report.identity.source!==identity.source||report.identity.fingerprint!==identity.fingerprint))throw Error('Package/source manifest mismatch');report.identity=identity;
   if(!/^[a-f0-9]{40}$/.test(report.identity.source??'')||!/^[a-f0-9]{64}$/.test(report.identity.fingerprint??''))throw Error('Release needs actual source commit and fingerprint');
   for(const [key,value]of Object.entries(config.expect??{}))if(!Object.hasOwn(report.identity,key)||report.identity[key]!==value)throw Error('Package identity mismatch: '+key);
   if(!Array.isArray(release.files)||!release.files.length)throw Error('Release payload manifest missing');const seen=new Set();
   for(const item of release.files){if(typeof item.path!=='string'||path.isAbsolute(item.path)||item.path.split(/[\\/]/).includes('..')||seen.has(item.path))throw Error('Invalid/duplicate package payload path');seen.add(item.path);const file=add(item.path,'package-payload',releaseFile.relative,path.dirname(releaseFile.absolute),'package');if(!file||file.record.sha256!==item.sha256||file.record.bytes!==item.bytes)throw Error('Package payload mismatch: '+item.path);}
  }catch(e){error('PACKAGE_IDENTITY_FAILED',releaseFile.relative,e.message);}
 }else if(config.expect){
  if(!report.identity)error('PACKAGE_IDENTITY_REQUIRED',null,'Expected identity requires actual sourceManifest or packageRoot/release.json');
  else for(const [key,value]of Object.entries(config.expect))if(!Object.hasOwn(report.identity,key)||report.identity[key]!==value)error('SOURCE_IDENTITY_FAILED',config.sourceManifest,'Source identity mismatch: '+key);
 }
 report.files=[...records.values()].sort((a,b)=>a.path.localeCompare(b.path));
 report.closureSHA256=hash(JSON.stringify(report.files));report.status=report.errors.length?'FAIL_STATIC_DRIVER_PREFLIGHT':'PASS_STATIC_DRIVER_PREFLIGHT';return report;
}

let invokedAsMain=false;
try{invokedAsMain=!!process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url));}catch{ /* An imported module may have a non-file eval argument. */ }
if(invokedAsMain){
 let report;
 try{report=await driverPreflight(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));}catch(e){report={schemaVersion:1,status:'FAIL_STATIC_DRIVER_PREFLIGHT',phase:'static',errors:[{code:'INVALID_CONFIG',message:e.message}]};}
 if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
 process.exitCode=report.status==='PASS_STATIC_DRIVER_PREFLIGHT'?0:1;
}
