#!/usr/bin/env python3
"""One bounded VPS job: fixed gates, exact package, selected prepared browser config."""
import datetime,hashlib,json,pathlib,subprocess,sys
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
    if config.get('profile') not in ['camera','hud','weapon','animal','pistol-cue','finisher-presentation','animal-appearance']:raise RuntimeError('Prepare selected browser profile before submission')
    run('qa-imports',['node','--input-type=module','-e',"import assert from 'node:assert/strict';import * as qa from './scripts/qa/scenarios.mjs';for(const name of ['verifyPackage','installObserver','readState','stage','codeDigest','camera','hudMultitouch','controlledEntry','waitSimulation','incomingBite','lowStrike','pistolKill','pauseAndRetry','pistolBodyCue','finisherPrepared','animalAppearanceRows'])assert.equal(typeof qa[name],'function',name);console.log('QA_NAMED_IMPORTS_PASS');"])
    run('install',['npm','ci','--no-audit','--no-fund'],root/'Web')
    run('source',['node','scripts/verify_web.mjs'])
    run('packaging',['npm','run','test:packaging'],root/'Web')
    run('build',['npm','run','build'],root/'Web')
    run('assets',['node','Web/scripts/verify-assets.mjs','--actors','assets/manifest-hollow.json','--audio','audio/manifest.json'])
    assets=json.loads((out/'assets.log').read_text());release={'version':source['version'],'engine':'three0.182.0','sourceCommit':source['head'],'sourceFingerprint':source['fingerprint'],'bytes':assets['bytes'],'files':assets['files']};manifest=out/'release-manifest.json';manifest.write_text(json.dumps(release,indent=2)+'\n')
    run('package',[sys.executable,'scripts/deploy/package_preview.py','--runtime','Web/dist','--manifest',str(manifest),'--output','export'])
    package=root/'export/release.json';config.update(packageRoot=str(root/'export'),baseURL='http://127.0.0.1:19041/',output=str(out/'browser'),expect={'source':source['head'],'fingerprint':source['fingerprint'],'packageSha256':hashlib.sha256(package.read_bytes()).hexdigest()});prepared=out/'qa-config.json';prepared.write_text(json.dumps(config,indent=2)+'\n')
    with (out/'server.log').open('w') as log:server=subprocess.Popen([sys.executable,'-m','http.server','19041','--bind','127.0.0.1','--directory','export'],stdout=log,stderr=subprocess.STDOUT)
    run('browser',['node','scripts/qa/run.mjs',str(prepared)])
finally:
    if server:server.terminate();server.wait(timeout=10)
