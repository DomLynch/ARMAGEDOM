#!/usr/bin/env python3
"""Bounded foreground recovery for an already MCP-submitted, owned HF job."""
import argparse,datetime,hashlib,importlib.util,json,pathlib,tarfile,time,urllib.request
from huggingface_hub import HfApi,get_token,hf_hub_download
spec=importlib.util.spec_from_file_location('submission',pathlib.Path(__file__).with_name('submit-release.py'));submission=importlib.util.module_from_spec(spec);spec.loader.exec_module(submission)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def safe_path(raw):
    if not isinstance(raw,str) or not raw or '\\' in raw:raise RuntimeError('Unsafe archive path')
    path=pathlib.PurePosixPath(raw)
    if path.is_absolute() or '..' in path.parts or path.as_posix()!=raw or raw=='.':raise RuntimeError('Unsafe archive path: '+raw)
    return raw

def archive_files(tar):
    files={};seen=set()
    for member in tar.getmembers():
        name=safe_path(member.name.rstrip('/') if member.isdir() else member.name)
        if name in seen:raise RuntimeError('Duplicate archive path: '+name)
        seen.add(name)
        if member.isdir():continue
        if not member.isfile():raise RuntimeError('Archive link or special file: '+name)
        files[name]=member
    return files

def records(rows):
    if not isinstance(rows,list):raise RuntimeError('Missing manifest records')
    result={}
    for row in rows:
        if not isinstance(row,dict):raise RuntimeError('Invalid manifest record')
        name=safe_path(row.get('path'))
        if name in result or type(row.get('bytes')) is not int or row['bytes']<0 or not isinstance(row.get('sha256'),str) or len(row['sha256'])!=64:raise RuntimeError('Invalid or duplicate manifest record: '+name)
        result[name]={'bytes':row['bytes'],'sha256':row['sha256']}
    return result

def verify_archive(owned_input,output,result):
    with tarfile.open(owned_input) as tar:
        members=archive_files(tar);frozen={}
        original_manifest=tar.extractfile(members['input-manifest.json']).read() if 'input-manifest.json' in members else None
        for name,member in members.items():
            if name=='input-manifest.json':continue
            data=tar.extractfile(member).read();frozen[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        if original_manifest is not None and records(json.loads(original_manifest)['files'])!=frozen:raise RuntimeError('Owned input archive manifest mismatch')
    with tarfile.open(output) as tar:
        members=archive_files(tar);declared=records(result.get('outputs'))
        metadata={'input-manifest.json','package-lock.json','source-manifest.json','results/result.json'}
        reserved={'job.json','result.json','recovery.json','outputs.tar.gz'}
        if declared.keys()&(metadata|reserved):raise RuntimeError('Output receipt/metadata collision')
        allowed=set(declared)|{'input-manifest.json'}|(set(members)&(metadata-{'input-manifest.json'}))
        if set(members)!=allowed:raise RuntimeError('Output archive closure mismatch')
        manifest=tar.extractfile(members['input-manifest.json']).read()
        if hashlib.sha256(manifest).hexdigest()!=result['inputManifestSHA']:raise RuntimeError('Input manifest mismatch')
        if original_manifest is not None and manifest!=original_manifest:raise RuntimeError('Returned input manifest differs from owned input archive')
        if records(json.loads(manifest)['files'])!=frozen:raise RuntimeError('Returned input set differs from owned input archive')
        for name,record in declared.items():
            data=tar.extractfile(members[name]).read()
            if len(data)!=record['bytes'] or hashlib.sha256(data).hexdigest()!=record['sha256']:raise RuntimeError('Output mismatch: '+name)
        if 'source-manifest.json' in members:
            data=tar.extractfile(members['source-manifest.json']).read()
            if 'source-manifest.json' not in frozen or {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}!=frozen['source-manifest.json']:raise RuntimeError('Source metadata differs from owned input')
        if 'results/result.json' in members:
            archived=json.loads(tar.extractfile(members['results/result.json']).read())
            if archived!={k:v for k,v in result.items() if k not in ['archiveSHA','archiveBytes']}:raise RuntimeError('Archived workload result differs from provider result')
        if 'package-lock.json' in members:json.loads(tar.extractfile(members['package-lock.json']).read())
        return json.loads(manifest)

def recover(job,namespace,repo,prefix,request,archive,stage,out,timeout=600):
    helper_started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not job or not namespace or not repo:raise RuntimeError('Owned job binding required')
    if out.exists() and any(out.iterdir()):raise RuntimeError('Preserve previous recovery attempt')
    out.mkdir(parents=True,exist_ok=True);api=HfApi();expected=json.loads(request.read_text())['args'];deadline=time.monotonic()+timeout
    while True:
        info=api.inspect_job(job_id=job,namespace=namespace)
        if info.command!=expected['command']:raise RuntimeError('Owned job command mismatch')
        if info.status.stage in ['COMPLETED','ERROR','CANCELED','CANCELLED']:break
        if time.monotonic()>=deadline:raise RuntimeError('Own completion wait expired; no duplicate job or cleanup')
        time.sleep(5)
    terminal_observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
    started=terminal_observed
    raw=json.load(urllib.request.urlopen(urllib.request.Request('https://huggingface.co/api/jobs/'+namespace+'/'+job,headers={'Authorization':'Bearer '+get_token()})))
    if not raw.get('finishedAt'):raise RuntimeError('Missing provider completion receipt')
    (out/'job.json').write_text(json.dumps({'job':job,'status':raw['status'],'jobFinishedUTC':raw['finishedAt'],'commandSHA256':hashlib.sha256(json.dumps(info.command).encode()).hexdigest()},indent=2)+'\n')
    p=pathlib.Path(hf_hub_download(repo,prefix+'/outputs/result.json',repo_type='dataset'));result=json.loads(p.read_text());(out/'result.json').write_bytes(p.read_bytes())
    if type(result.get('exitCode')) is not int or result.get('inputSHA')!=digest(archive):raise RuntimeError('Missing or different original workload result')
    p=pathlib.Path(hf_hub_download(repo,prefix+'/outputs/outputs.tar.gz',repo_type='dataset'))
    if digest(p)!=result['archiveSHA']:raise RuntimeError('Output archive mismatch')
    (out/'outputs.tar.gz').write_bytes(p.read_bytes())
    manifest=verify_archive(archive,p,result)
    with tarfile.open(p)as tar:tar.extractall(out,filter='data')
    if digest(out/'input-manifest.json')!=result['inputManifestSHA']:raise RuntimeError('Input manifest mismatch')
    manifest=json.loads((out/'input-manifest.json').read_text())
    for f in manifest['files']:
        p=stage/f['path']
        if p.stat().st_size!=f['bytes'] or digest(p)!=f['sha256']:raise RuntimeError('Frozen input mismatch: '+f['path'])
    for f in result['outputs']:
        p=out/f['path']
        if not p.resolve().is_relative_to(out.resolve()) or p.stat().st_size!=f['bytes'] or digest(p)!=f['sha256']:raise RuntimeError('Output mismatch: '+f['path'])
    if (out/'export/release.json').exists():submission.validate_export(out/'export')
    receipt={'job':job,'status':info.status.stage,'originalJobExit':result['exitCode'],'jobFinishedUTC':raw['finishedAt'],'helperStartedUTC':helper_started,'terminalObservedUTC':terminal_observed,'recoveryStartedUTC':started,'recoveryEndedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputsVerified':len(manifest['files']),'outputsVerified':len(result['outputs']),'archiveSHA':result['archiveSHA'],'packageSHA':result.get('packageSHA'),'providerCleanupAttempted':False}
    (out/'recovery.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return result['exitCode']
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--job',required=True);p.add_argument('--namespace',default='Domlynch');p.add_argument('--repo',required=True);p.add_argument('--prefix',required=True);p.add_argument('--request',type=pathlib.Path,required=True);p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--stage',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--timeout',type=int,default=600);a=p.parse_args()
    raise SystemExit(recover(a.job,a.namespace,a.repo,a.prefix,a.request,a.archive,a.stage,a.output,a.timeout))
