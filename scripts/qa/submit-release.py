#!/usr/bin/env python3
"""Submit one bounded job and recover its owned result immediately, including EXIT1."""
import argparse, datetime, hashlib, shutil, json, pathlib, re, shlex, subprocess, sys
RUNNER='/Users/domininclynch/Desktop/Business/Vibe Coding Management/scripts/vps-run.py'
SSH=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8','-i','/Users/domininclynch/.ssh/binance_futures_tool','root@49.12.7.18']
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
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
    paths={p.relative_to(out).as_posix():remote+('/src/' if p.relative_to(out).parts[0] in ['results','export'] else '/')+p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file() and p.name!='submit.log'}
    code='import json,hashlib,pathlib; d='+repr(paths)+'; print(json.dumps({k:hashlib.sha256(pathlib.Path(v).read_bytes()).hexdigest() for k,v in d.items()}))'
    hashes=json.loads(subprocess.check_output(SSH+['python3 -c '+shlex.quote(code)],text=True))
    for rel,sha in hashes.items():
        if digest(out/rel)!=sha: raise RuntimeError('Output mismatch: '+rel)
    if (out/'export').exists():validate_export(out/'export')
    (out/'recovery.json').write_text(json.dumps({'job':job,'originalInputsVerified':len(request['files_sha256']),'remoteOutputsVerified':len(hashes),'files':hashes,'verifiedBeforeOwnJobCleanup':True,'recoveryStartedUTC':started,'recoveryVerifiedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalJobExit':result['exit_code']},indent=2)+'\n')
    subprocess.run(SSH+['rm -rf '+shlex.quote(remote)],check=True)
    recovery=json.loads((out/'recovery.json').read_text());recovery['remoteCleanupCompletedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'recovery.json').write_text(json.dumps(recovery,indent=2)+'\n')
    return result['exit_code']
def submit(command,stage,out,recover=recover_job):
    out.mkdir(parents=True,exist_ok=True)
    if any(out.iterdir()): raise RuntimeError('Attempt output already exists; preserve earlier results')
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
    code=submit(argv,a.stage.resolve(),a.output.resolve())
    if a.handoff_stage:handoff_export(a.output.resolve(),a.handoff_stage.resolve())
    sys.exit(code)
