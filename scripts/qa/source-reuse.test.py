import ast,copy,hashlib,json,pathlib,tempfile
path=pathlib.Path(__file__).with_name('release-run.py');tree=ast.parse(path.read_text());selected=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name=='verify_source_reuse'];scope={};exec(compile(ast.Module(body=selected,type_ignores=[]),str(path),'exec'),scope);verify=scope['verify_source_reuse'];sha=lambda b:hashlib.sha256(b).hexdigest();results=[]
for case in ['success','omitted','incomplete','new_manifest_input','new_unlisted_input','prior_failure','arbitrary_log','wrong_source']:
 with tempfile.TemporaryDirectory() as tmp:
  root=pathlib.Path(tmp);files=[]
  for name in ['Web/src/game.js','Web/tests/game.test.js','Web/src/style.css','scripts/verify_web.mjs']:
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(name.encode());files.append({'path':name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
  prior={'head':'a'*40,'files':files,'fingerprint':sha(json.dumps(files,sort_keys=True,separators=(',',':')).encode())};current=copy.deepcopy(prior);body=b'\xe2\x84\xb9 tests 607\n\xe2\x84\xb9 pass 607\n\xe2\x84\xb9 fail 0\n';reuse={'source':prior['head'],'exit':0,'tests':607,'receiptSHA256':sha(body),'files':[f for f in files if f['path']!='Web/src/style.css']};stages=[{'name':'source','exit':0,'argv':['node','scripts/verify_web.mjs']}];result={'exitCode':1,'sourceCommit':prior['head'],'sourceFingerprint':prior['fingerprint'],'outputs':[{'path':'results/source.log','bytes':len(body),'sha256':sha(body)}]}
  if case=='omitted':reuse['files']=[]
  if case=='incomplete':reuse['files']=reuse['files'][:-1]
  if case in ['new_manifest_input','new_unlisted_input']:
   p=root/'Web/src/new.js';p.write_text('new runtime');f={'path':'Web/src/new.js','bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
   if case=='new_manifest_input':current['files'].append(f);current['fingerprint']=sha(json.dumps(current['files'],sort_keys=True,separators=(',',':')).encode())
  if case=='prior_failure':stages[0]['exit']=1
  if case=='arbitrary_log':body=b'PASS';reuse['receiptSHA256']=sha(body);result['outputs'][0].update(bytes=len(body),sha256=sha(body))
  if case=='wrong_source':result['sourceCommit']='b'*40
  for name,data in [('prior-source-manifest.json',prior),('source-reuse.json',reuse),('prior-source-stages.json',stages),('prior-source-result.json',result)]: (root/name).write_text(json.dumps(data))
  (root/'source-pass.log').write_bytes(body)
  try:out=verify(root,current);assert case=='success';results.append({'case':case,'passed':True,'verified':out})
  except RuntimeError as e:assert case!='success';results.append({'case':case,'rejected':str(e)})
print(json.dumps(results,indent=2))
