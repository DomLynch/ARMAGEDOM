#!/usr/bin/env python3
"""Submit one bounded job and recover its owned result immediately, including EXIT1."""
import argparse, datetime, hashlib, shutil, json, pathlib, re, shlex, subprocess, sys, tempfile
RUNNER='/Users/domininclynch/Desktop/Business/Vibe Coding Management/scripts/vps-run.py'
SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8','-i','/Users/domininclynch/.ssh/binance_futures_tool','root@49.12.7.18']
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def validate_driver_preflight(stage,command):
    """Recheck the frozen static receipt before any VPS launcher or upload."""
    if '--' not in command:raise RuntimeError('Unbound release-test command rejected')
    separator=command.index('--');prefix=command[:separator];remote_command=command[separator+1:]
    if len(prefix) not in (5,6) or prefix[:3]!=[sys.executable,RUNNER,'--timeout'] or not prefix[3].isdigit() or int(prefix[3])<1 or prefix[-1]!=str(stage.resolve()) or (len(prefix)==6 and prefix[4]!='--small-release'):raise RuntimeError('Unbound release-test launcher rejected')
    build=remote_command==['bash','scripts/qa/release-run.sh']
    checked=remote_command==['bash','scripts/qa/run-checked.sh']
    native=remote_command==['bash','scripts/qa/run-native-proof.sh']
    if not (build or checked or native):raise RuntimeError('Unbound release-test command rejected')
    maintained_files=('driver-preflight.mjs','package.json','package-lock.json')+(('release-run.sh','release-run.py') if build else ('run-checked.sh','run-checked.mjs','run-controls.mjs','ui-interaction-guard.mjs') if checked else ('run-native-proof.sh','gameplay-actions.mjs','weapon-action-guard.mjs','ui-interaction-guard.mjs'))
    for name in maintained_files:
        relative=pathlib.Path('scripts/qa')/name
        staged=stage/relative;maintained=pathlib.Path(__file__).resolve().with_name(name)
        if not staged.is_file() or digest(staged)!=digest(maintained):raise RuntimeError('Maintained release-test wrapper mismatch: '+str(relative))
    if native:
        for name in ('package.json','package-lock.json'):
            if not (stage/name).is_file() or digest(stage/name)!=digest(pathlib.Path(__file__).resolve().with_name(name)):raise RuntimeError('Native root dependency pin mismatch: '+name)
        preparation=stage/'observer-preflight.mjs';maintained_preparation=pathlib.Path(__file__).resolve().parent/'fixtures/observer-preflight173.mjs'
        if not preparation.is_file() or digest(preparation)!=digest(maintained_preparation):raise RuntimeError('Native observer preparation differs from reviewed exact bytes')
    config_path=stage/'driver-preflight-config.json';receipt_path=stage/'driver-preflight.json'
    if not config_path.is_file() or not receipt_path.is_file():raise RuntimeError('Missing mandatory driver preflight config or receipt')
    config=json.loads(config_path.read_text());receipt=json.loads(receipt_path.read_text())
    if not isinstance(config,dict) or not isinstance(receipt,dict):raise RuntimeError('Invalid driver preflight config or receipt')
    root=config.get('stageRoot')
    if not isinstance(root,str) or (stage/root).resolve()!=stage.resolve():raise RuntimeError('Driver preflight stage identity mismatch')
    if not isinstance(config.get('entrypoints'),list) or not config['entrypoints']:raise RuntimeError('Missing driver preflight entrypoints')
    required_entries={'scripts/qa/run.mjs','scripts/qa/preflight.mjs'} if build else {'scripts/qa/run-checked.mjs'} if checked else {'proof.mjs'}
    if not required_entries.issubset(config['entrypoints']):raise RuntimeError('Release-test driver entrypoints not covered')
    expect=config.get('expect')
    if not isinstance(expect,dict) or not all(isinstance(expect.get(k),str) and expect[k] for k in ('source','fingerprint')):raise RuntimeError('Missing driver preflight source identity')
    if config.get('packageRoot') and not expect.get('packageSha256'):raise RuntimeError('Missing driver preflight package identity')
    if (checked or native) and not config.get('packageRoot'):raise RuntimeError('Checked export requires exact package identity')
    if checked or native:
        runtime_name='qa-checked-config.json' if checked else 'qa-173-config.json'
        if runtime_name not in config.get('dataFiles',[]):raise RuntimeError('Runtime config missing from static dependency closure')
        runtime=json.loads((stage/runtime_name).read_text())
        if runtime.get('expect')!=expect:raise RuntimeError('Checked runtime/package identity mismatch')
        if native and runtime.get('baseURL')!='http://127.0.0.1:19413/':raise RuntimeError('Native proof requires exact owned local export server')
        if checked:
            paths=('scripts/qa/run-checked.mjs','scripts/qa/run-controls.mjs','scripts/qa/ui-interaction-guard.mjs')
            expected_files={name:digest(stage/name) for name in paths}
            if runtime.get('driverFiles')!=expected_files:raise RuntimeError('Checked runtime driver identity mismatch')
    if build and not config.get('packageRoot') and config.get('sourceManifest')!='source-manifest.json':raise RuntimeError('Missing exact source manifest preflight input')
    manifest=stage/'source-manifest.json'
    if manifest.is_file():
        source=json.loads(manifest.read_text())
        if source.get('head')!=expect['source'] or source.get('fingerprint')!=expect['fingerprint']:raise RuntimeError('Driver preflight source manifest mismatch')
        rows=source.get('files')
        if not isinstance(rows,list) or not rows or source['fingerprint']!=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest():raise RuntimeError('Invalid source manifest fingerprint')
        records={f['path']:f for f in rows}
        if len(records)!=len(rows):raise RuntimeError('Duplicate source manifest path')
        required_source={'scripts/qa/'+name for name in maintained_files}|required_entries
        for name in required_source:
            row=records.get(name)
            if not row or row.get('sha256')!=digest(stage/name) or row.get('bytes')!=(stage/name).stat().st_size:raise RuntimeError('Release-test wrapper or driver source identity mismatch: '+name)
    elif not config.get('packageRoot'):raise RuntimeError('Missing source manifest or exact export')
    validator=pathlib.Path(__file__).resolve().with_name('driver-preflight.mjs')
    if not validator.is_file():raise RuntimeError('Maintained driver preflight validator unavailable')
    with tempfile.TemporaryDirectory(prefix='armagedom-driver-preflight-') as temp:
        result=pathlib.Path(temp)/'report.json'
        run=subprocess.run(['node',str(validator),str(config_path),str(result)],cwd=stage,capture_output=True,text=True)
        if not result.is_file():raise RuntimeError('Driver preflight produced no result')
        current=json.loads(result.read_text())
    if run.returncode!=0 or current.get('status')!='PASS_STATIC_DRIVER_PREFLIGHT':raise RuntimeError('Driver preflight failed: '+str(current.get('errors',run.stderr))[:600])
    if native:
        required_graph={('proof.mjs',name,kind) for name,kind in [('qa-173-config.json','fixture'),('observer.mjs','import'),('scripts/qa/gameplay-actions.mjs','import'),('scripts/qa/weapon-action-guard.mjs','import'),('scripts/qa/ui-interaction-guard.mjs','import')]}
        actual_graph={(edge.get('from'),edge.get('to'),edge.get('kind')) for edge in current.get('graph',[])}
        if not required_graph.issubset(actual_graph):raise RuntimeError('Native proof missing exact config or guarded dependency closure')
        required_files={'proof.mjs','observer.mjs','qa-173-config.json','scripts/qa/gameplay-actions.mjs','scripts/qa/weapon-action-guard.mjs','scripts/qa/ui-interaction-guard.mjs'}
        actual_files={file.get('path'):file.get('sha256') for file in current.get('files',[])}
        if any(actual_files.get(name)!=digest(stage/name) for name in required_files):raise RuntimeError('Native proof file identity absent from static receipt')
    if config.get('packageRoot'):
        if current.get('identity')!=expect:raise RuntimeError('Driver preflight package report identity mismatch')
        if checked or native:
            for file in current.get('files',[]):
                name=file.get('path')
                if file.get('kind') in ('package-release','package-payload') or not isinstance(name,str) or not name.endswith(('.js','.mjs','.cjs')):continue
                if native and not name.startswith('scripts/qa/'):continue
                maintained=pathlib.Path(__file__).resolve().parents[2]/name
                if not maintained.is_file() or file.get('sha256')!=digest(maintained):raise RuntimeError('Checked driver dependency differs from maintained source: '+name)
    else:
        if current.get('identity')!={**expect,'packageSha256':None}:raise RuntimeError('Driver preflight source report identity mismatch')
        for file in current.get('files',[]):
            name=file.get('path')
            row=records.get(name)
            if name=='source-manifest.json' and file.get('kind')=='source-manifest' and file.get('sha256')==digest(manifest):continue
            if row is None and file.get('kind')=='declared-data':continue
            if not row or row.get('sha256')!=file.get('sha256') or row.get('bytes')!=file.get('bytes'):raise RuntimeError('Driver dependency outside frozen source identity: '+str(name))
    if current!=receipt:raise RuntimeError('Driver preflight receipt mismatch')
    return current
def validate_export(export):
    if export.is_symlink() or not export.is_dir():raise RuntimeError('Invalid export directory')
    release=json.loads((export/'release.json').read_text());files=release.get('files')
    if not isinstance(files,list) or not files:raise RuntimeError('Missing package file list')
    expected={'release.json'}
    for f in files:
        raw=f.get('path');path=pathlib.PurePosixPath(raw) if isinstance(raw,str) else None
        if not raw or path.is_absolute() or '..' in path.parts or path.as_posix()!=raw or raw in expected:raise RuntimeError('Duplicate or escaping package path')
        expected.add(raw)
    actual=set()
    for p in export.rglob('*'):
        if p.is_symlink():raise RuntimeError('Package symlink rejected')
        if p.is_file():actual.add(p.relative_to(export).as_posix())
    if actual!=expected:raise RuntimeError('Package closure mismatch: '+str(actual^expected))
    for f in files:
        p=export/f['path']
        if not p.resolve().is_relative_to(export.resolve()) or p.stat().st_size!=f['bytes'] or digest(p)!=f['sha256']:raise RuntimeError('Package payload mismatch: '+f['path'])
    return release
def recover_job(job,stage,out):
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',job): raise RuntimeError('Invalid owned job ID')
    remote='/srv/dev-jobs/'+job; target=SSH[-1]+':'+remote; shell=shlex.join(SSH[:-1])
    subprocess.run(['rsync','-ac','-e',shell,'--include=request.json','--include=result.json','--include=submission.json','--include=run.log','--exclude=*',target+'/',str(out)+'/'],check=True)
    for name in ['request.json','result.json','submission.json','run.log']:
        if not (out/name).is_file() or (name!='run.log' and not (out/name).stat().st_size): raise RuntimeError('Missing original receipt: '+name)
    submission=json.loads((out/'submission.json').read_text())
    if not isinstance(submission,dict):raise RuntimeError('Invalid original submission receipt')
    result=json.loads((out/'result.json').read_text())
    if not isinstance(result,dict):raise RuntimeError('Invalid original result receipt')
    if result.get('job')!=job or type(result.get('exit_code')) is not int or 'finished_epoch' not in result: raise RuntimeError('Missing completed owned result')
    for sub in ['results','export']:
        transport=subprocess.run(SSH+['test -d '+shlex.quote(remote+'/src/'+sub)])
        if transport.returncode not in [0,1]: raise RuntimeError('Recovery SSH transport failed')
        if transport.returncode==0:
            dest=out/sub;dest.mkdir(exist_ok=True);subprocess.run(['rsync','-ac','-e',shell,target+'/src/'+sub+'/',str(dest)+'/'],check=True)
    request=json.loads((out/'request.json').read_text())
    if not isinstance(request,dict) or not isinstance(request.get('files_sha256'),dict) or not request['files_sha256']: raise RuntimeError('Missing frozen input hashes')
    for rel,sha in request['files_sha256'].items():
        if digest(stage/rel)!=sha: raise RuntimeError('Input changed: '+rel)
    paths={}
    for p in out.rglob('*'):
        if not p.is_file():continue
        rel=p.relative_to(out);name=rel.as_posix()
        if len(rel.parts)==1 and name in ('request.json','result.json','submission.json','run.log'):paths[name]=remote+'/'+name
        elif rel.parts[0] in ('results','export'):paths[name]=remote+'/src/'+name
    code='import json,hashlib,pathlib; d='+repr(paths)+'; print(json.dumps({k:hashlib.sha256(pathlib.Path(v).read_bytes()).hexdigest() for k,v in d.items()}))'
    hashes=json.loads(subprocess.check_output(SSH+['python3 -c '+shlex.quote(code)],text=True))
    for rel,sha in hashes.items():
        if digest(out/rel)!=sha: raise RuntimeError('Output mismatch: '+rel)
    if (out/'export').exists():validate_export(out/'export')
    (out/'recovery.json').write_text(json.dumps({'job':job,'originalInputsVerified':len(request['files_sha256']),'remoteOutputsVerified':len(hashes),'files':hashes,'verifiedBeforeOwnJobCleanup':True,'recoveryStartedUTC':started,'recoveryVerifiedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalJobExit':result['exit_code']},indent=2)+'\n')
    subprocess.run(SSH+['rm -rf '+shlex.quote(remote)],check=True)
    recovery=json.loads((out/'recovery.json').read_text());recovery['remoteCleanupCompletedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'recovery.json').write_text(json.dumps(recovery,indent=2)+'\n')
    return result['exit_code']
def submit(command,stage,out,recover=recover_job,validate_stage=None):
    if validate_stage is None:raise RuntimeError('Mandatory driver preflight validator missing')
    validated=validate_stage(stage,command)
    out.mkdir(parents=True,exist_ok=True)
    if any(out.iterdir()): raise RuntimeError('Attempt output already exists; preserve earlier results')
    if validated is not None:(out/'driver-preflight-submission.json').write_text(json.dumps(validated,indent=2)+'\n')
    job=None
    with (out/'submit.log').open('w') as log:
        process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
        for line in process.stdout:
            print(line,end='',flush=True);log.write(line);log.flush()
            match=re.search(r'VPS job: ([a-zA-Z0-9_-]+) Remote outputs:',line)
            if match: job=match[1]
        process.stdout.close()
        code=process.wait()
    if job:
        recover_started=datetime.datetime.now(datetime.timezone.utc).isoformat()
        try: original=recover(job,stage,out)
        except Exception as error:
            original=None
            if (out/'result.json').exists():
                try:original=json.loads((out/'result.json').read_text()).get('exit_code')
                except ValueError:pass
            (out/'submission-chain.json').write_text(json.dumps({'job':job,'launcherExit':code,'originalJobExit':original,'recoveryError':str(error),'recoveryStartedUTC':recover_started,'recoveryFailedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RECOVERY_FAILED_REMOTE_PRESERVED'},indent=2)+'\n');raise
        (out/'submission-chain.json').write_text(json.dumps({'job':job,'launcherExit':code,'originalJobExit':original,'recoveryStartedUTC':recover_started,'recoveryCompletedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'RECOVERED_VERIFIED'},indent=2)+'\n')
        if isinstance(original,int) and original!=0:return original
    return code
def handoff_export(out,target):
    export=out/'export'
    if not export.exists():return
    if not target.is_dir():raise RuntimeError('Prepare the approved follow-up stage first')
    release=validate_export(export)
    destination=target/'export'
    if destination.exists():
        validate_export(destination)
        if digest(destination/'release.json')!=digest(export/'release.json'):raise RuntimeError('Preserve different follow-up export')
        for f in release['files']:
            if digest(destination/f['path'])!=f['sha256']:raise RuntimeError('Preserve changed follow-up payload')
    else:shutil.copytree(export,destination)
    validate_export(destination)
    (out/'handoff.json').write_text(json.dumps({'stage':str(target),'source':release['sourceCommit'],'fingerprint':release['sourceFingerprint'],'packageSHA256':digest(export/'release.json'),'noRebuild':True},indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stage',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--timeout',type=int,default=600);p.add_argument('--small-release',action='store_true');p.add_argument('--handoff-stage',type=pathlib.Path);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
    command=a.command[1:] if a.command[:1]==['--'] else a.command
    if not command: p.error('remote command required')
    argv=[sys.executable,RUNNER,'--timeout',str(a.timeout)]+(['--small-release'] if a.small_release else [])+[str(a.stage.resolve()),'--']+command
    code=submit(argv,a.stage.resolve(),a.output.resolve(),validate_stage=validate_driver_preflight)
    if a.handoff_stage:handoff_export(a.output.resolve(),a.handoff_stage.resolve())
    sys.exit(code)
