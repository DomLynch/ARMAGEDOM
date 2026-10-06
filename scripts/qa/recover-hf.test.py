import contextlib,hashlib,importlib.util,io,json,pathlib,sys,tarfile,tempfile,types
TARGET=pathlib.Path(__file__).with_name('recover-hf.py')
EXPECTED=hashlib.sha256(TARGET.read_bytes()).hexdigest()
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(TARGET.read_bytes())==EXPECTED
fake=types.ModuleType('huggingface_hub');fake.HfApi=lambda:None;fake.get_token=lambda:'offline-fixture';fake.hf_hub_download=lambda *a,**k:None;sys.modules['huggingface_hub']=fake
spec=importlib.util.spec_from_file_location('helper',TARGET);h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
results=[]
for case in ['success','error_exit7','timeout','command','input','archive','manifest','output','omitted_inputs','unlisted_output','duplicate_output','linked_output','unsafe_output','receipt_collision','unsafe_manifest']:
 with tempfile.TemporaryDirectory() as tmp:
  r=pathlib.Path(tmp);stage=r/'stage';stage.mkdir();(stage/'source.js').write_bytes(b'actual source');archive=r/'input.tar.gz';
  with tarfile.open(archive,'w:gz') as source_tar:source_tar.add(stage/'source.js',arcname='source.js')
  req=r/'request.json';req.write_text(json.dumps({'args':{'command':['run','owned']}}));out=r/'out'
  manifest={'files':[{'path':'source.js','bytes':13,'sha256':sha(b'actual source')}]}
  if case=='omitted_inputs':manifest={'files':[]}
  if case=='unsafe_manifest':manifest['files'][0]['path']='../source.js'
  mb=json.dumps(manifest).encode();payload=b'original output';ob=r/'outputs.tar.gz'
  with tarfile.open(ob,'w:gz') as t:
   for name,b in [('input-manifest.json',mb),('run.log',payload)]+([('unlisted.txt',b'unverified extra')] if case=='unlisted_output' else []):
    info=tarfile.TarInfo(name);info.size=len(b);t.addfile(info,io.BytesIO(b))
   if case in ['duplicate_output','unsafe_output','receipt_collision']:
    name={'duplicate_output':'run.log','unsafe_output':'../escape','receipt_collision':'job.json'}[case];info=tarfile.TarInfo(name);info.size=len(payload);t.addfile(info,io.BytesIO(payload))
   if case=='linked_output':
    info=tarfile.TarInfo('link.log');info.type=tarfile.SYMTYPE;info.linkname='run.log';t.addfile(info)
  result={'exitCode':7 if case=='error_exit7' else 0,'inputSHA':sha(archive.read_bytes()),'archiveSHA':sha(ob.read_bytes()),'inputManifestSHA':sha(mb),'outputs':[{'path':'run.log','bytes':len(payload),'sha256':sha(payload)}]}
  for label,key in [('input','inputSHA'),('archive','archiveSHA'),('manifest','inputManifestSHA')]:
   if case==label:result[key]='bad'
  if case=='output':result['outputs'][0]['sha256']='bad'
  if case=='receipt_collision':result['outputs'].append({'path':'job.json','bytes':len(payload),'sha256':sha(payload)})
  rp=r/'result.json';rp.write_text(json.dumps(result));calls=[]
  class API:
   def inspect_job(self,**kw):
    calls.append('inspect');return types.SimpleNamespace(command=['wrong'] if case=='command' else ['run','owned'],status=types.SimpleNamespace(stage='RUNNING' if case=='timeout' else 'ERROR' if case=='error_exit7' else 'COMPLETED'))
   def __getattr__(self,name):raise AssertionError('Forbidden provider operation '+name)
  h.HfApi=API;h.get_token=lambda:'offline-fixture';h.hf_hub_download=lambda repo,path,**kw:str(rp if path.endswith('result.json') else ob)
  h.urllib.request.urlopen=lambda req:io.BytesIO(json.dumps({'finishedAt':'2026-10-06T16:36:55.244Z','status':'ERROR' if case=='error_exit7' else 'COMPLETED'}).encode())
  try:
   with contextlib.redirect_stdout(io.StringIO()):code=h.recover('owned','namespace','repo','prefix',req,archive,stage,out,timeout=0)
   outcome={'returned':code,'receipt':json.loads((out/'recovery.json').read_text())}
  except Exception as e:outcome={'rejected':type(e).__name__+': '+str(e),'successReceipt':(out/'recovery.json').exists()}
  if case in ['success','error_exit7']:assert outcome.get('returned')==(7 if case=='error_exit7' else 0)
  else:assert 'rejected'in outcome and not outcome['successReceipt']
  assert archive.exists() and stage.exists()
  results.append({'case':case,**outcome,'providerCalls':calls,'localInputsRetained':True})
print(json.dumps({'helperSHA':EXPECTED,'network':'fully mocked; no credential access or remote calls','results':results},indent=2))
