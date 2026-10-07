#!/usr/bin/env python3
"""One bounded VPS job: fixed gates, exact package, selected prepared browser config."""
import datetime,hashlib,json,pathlib,re,subprocess,sys
def verify_source_reuse(root,current):
    def record_map(manifest):
        rows=manifest.get('files')
        if not isinstance(rows,list) or not rows:raise RuntimeError('Empty source manifest')
        result={}
        for f in rows:
            name=f.get('path');path=pathlib.PurePosixPath(name) if isinstance(name,str) else None
            if not name or path.is_absolute() or '..' in path.parts or path.as_posix()!=name or '\\' in name or name in result or type(f.get('bytes')) is not int or not re.fullmatch('[0-9a-f]{64}',f.get('sha256','')):raise RuntimeError('Invalid source record')
            result[name]=f
        if manifest.get('fingerprint')!=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest():raise RuntimeError('Source fingerprint mismatch')
        return result
    def eligible(rows):return {k:v for k,v in rows.items() if k!='Web/src/style.css' and not k.startswith('scripts/qa/')}
    prior=json.loads((root/'prior-source-manifest.json').read_text());previous=eligible(record_map(prior));present=record_map(current);required=eligible(present);reuse=json.loads((root/'source-reuse.json').read_text())
    if not required or required!=previous or record_map({'files':reuse.get('files'),'fingerprint':hashlib.sha256(json.dumps(reuse.get('files'),sort_keys=True,separators=(',',':')).encode()).hexdigest()})!=required:raise RuntimeError('Incomplete or changed source reuse input set')
    actual={p.relative_to(root).as_posix() for p in (root/'Web/src').rglob('*.js')}|{p.relative_to(root).as_posix() for p in (root/'Web/tests').rglob('*.test.js')}
    if not actual.issubset(present):raise RuntimeError('Unlisted source/test input')
    for name,f in required.items():
        p=root/name
        if p.stat().st_size!=f['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:raise RuntimeError('Changed source reuse input: '+name)
    stages=json.loads((root/'prior-source-stages.json').read_text());matches=[x for x in stages if x.get('name')=='source']
    if len(matches)!=1 or type(matches[0].get('exit')) is not int or matches[0]['exit']!=0 or matches[0].get('argv')!=['node','scripts/verify_web.mjs']:raise RuntimeError('Prior source stage did not pass')
    result=json.loads((root/'prior-source-result.json').read_text());raw=(root/'source-pass.log').read_bytes();digest=hashlib.sha256(raw).hexdigest();logs=[x for x in result.get('outputs',[]) if x.get('path')=='results/source.log']
    if not re.fullmatch('[0-9a-f]{40}',prior.get('head','')) or result.get('sourceCommit')!=prior['head'] or result.get('sourceFingerprint')!=prior['fingerprint'] or reuse.get('source')!=prior['head'] or len(logs)!=1 or logs[0].get('sha256')!=digest or logs[0].get('bytes')!=len(raw) or reuse.get('receiptSHA256')!=digest:raise RuntimeError('Prior source identity/log mismatch')
    counts={key:re.findall(r'(?m)^ℹ '+key+r' (\d+)$',raw.decode()) for key in ['tests','pass','fail']}
    if any(len(v)!=1 for v in counts.values()) or int(counts['tests'][0])<=0 or counts['tests']!=counts['pass'] or counts['fail']!=['0'] or reuse.get('tests')!=int(counts['tests'][0]) or type(reuse.get('exit')) is not int or reuse['exit']!=0:raise RuntimeError('Prior tests did not pass')
    return {'name':'source-reuse','exit':0,'tests':reuse['tests'],'source':prior['head'],'receiptSHA256':digest,'inputsVerified':len(required),'scope':'Exact complete prior/current relevant set; only portrait CSS and QA runner files excluded; successful prior source stage/log identity bound.'}

root=pathlib.Path.cwd();out=root/'results';out.mkdir(exist_ok=True);receipts=[];server=None
source=json.loads((root/'source-manifest.json').read_text());config=json.loads((root/'qa-config.json').read_text())
def run(name,argv,cwd=None):
    record={'name':name,'startedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':argv}
    with (out/(name+'.log')).open('w') as log: record['exit']=subprocess.run(argv,cwd=cwd,stdout=log,stderr=subprocess.STDOUT).returncode
    record['finishedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();receipts.append(record);(out/'release-stages.json').write_text(json.dumps(receipts,indent=2)+'\n')
    if record['exit']: raise SystemExit(record['exit'])
try:
    for f in source['files']:
        p=root/f['path']
        if p.stat().st_size!=f['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:raise RuntimeError('Frozen input mismatch: '+f['path'])
    if config.get('profile') not in ['camera','hud','weapon','animal','pistol-cue','finisher-presentation','animal-appearance','drone','animal-cycle','portrait-dodge','drone-melee','pack-chaser','qa-readiness','gaunt-body','roach-territory','split-crown','opened','run-through','animal-roles']:raise RuntimeError('Prepare selected browser profile before submission')
    run('qa-imports',['node','--input-type=module','-e',"import assert from 'node:assert/strict';import * as qa from './scripts/qa/scenarios.mjs';for(const name of ['verifyPackage','installObserver','readState','stage','codeDigest','camera','hudMultitouch','controlledEntry','waitSimulation','incomingBite','lowStrike','pistolKill','pauseAndRetry','pistolBodyCue','finisherPrepared','animalAppearanceRows','droneEncounter','animalCycleRows','portraitDodge','droneMeleeInput','dronePistolControl','preflightCompiled','ordinaryInput','equipPistol','inputReadinessScenario'])assert.equal(typeof qa[name],'function',name);console.log('QA_NAMED_IMPORTS_PASS');"])
    run('install',['npm','ci','--no-audit','--no-fund'],root/'Web')
    if config.get('sourceReuse'):
        record=verify_source_reuse(root,source);receipts.append(record);(out/'release-stages.json').write_text(json.dumps(receipts,indent=2)+'\n')
    else:run('source',['node','scripts/verify_web.mjs'])
    run('packaging',['npm','run','test:packaging'],root/'Web')
    run('build',['npm','run','build'],root/'Web')
    run('assets',['node','Web/scripts/verify-assets.mjs','--actors','assets/manifest-hollow.json','--audio','audio/manifest.json'])
    assets=json.loads((out/'assets.log').read_text());release={'version':source['version'],'engine':'three0.182.0','sourceCommit':source['head'],'sourceFingerprint':source['fingerprint'],'bytes':assets['bytes'],'files':assets['files']};manifest=out/'release-manifest.json';manifest.write_text(json.dumps(release,indent=2)+'\n')
    run('package',[sys.executable,'scripts/deploy/package_preview.py','--runtime','Web/dist','--manifest',str(manifest),'--output','export'])
    package=root/'export/release.json';config.update(packageRoot=str(root/'export'),baseURL='http://127.0.0.1:19041/',output=str(out/'browser'),expect={'source':source['head'],'fingerprint':source['fingerprint'],'packageSha256':hashlib.sha256(package.read_bytes()).hexdigest()},observerModuleHash=next(f['sha256'] for f in source['files'] if f['path']=='scripts/qa/scenarios.mjs'));prepared=out/'qa-config.json';prepared.write_text(json.dumps(config,indent=2)+'\n')
    run('probe-preflight',['node','scripts/qa/preflight.mjs',str(prepared)])
    with (out/'server.log').open('w') as log:server=subprocess.Popen([sys.executable,'-m','http.server','19041','--bind','127.0.0.1','--directory','export'],stdout=log,stderr=subprocess.STDOUT)
    run('browser',['node','scripts/qa/run.mjs',str(prepared)])
finally:
    if server:server.terminate();server.wait(timeout=10)
