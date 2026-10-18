import hashlib,importlib.util,io,json,pathlib,shutil,subprocess,sys,tempfile,unittest
spec=importlib.util.spec_from_file_location('submit_release',pathlib.Path(__file__).with_name('submit-release.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SubmissionRegression(unittest.TestCase):
 def prepared_stage(self,root):
  stage=root/'stage';stage.mkdir();qa=pathlib.Path(__file__).parent
  fixture=qa/'fixtures/driver-preflight/valid'
  for name in ('driver.mjs','read-state.mjs','fixtures/earned.json','scripts/qa/weapon-action-guard.mjs'):
   target=stage/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(fixture/name,target)
  for name in ('release-run.sh','release-run.py','driver-preflight.mjs','package.json','package-lock.json'):
   target=stage/'scripts/qa'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(qa/name,target)
  (stage/'scripts/qa/run.mjs').write_text("import '../../driver.mjs';\n")
  (stage/'scripts/qa/preflight.mjs').write_text('export const ready=true;\n')
  rows=[{'path':p.relative_to(stage).as_posix(),'bytes':p.stat().st_size,'sha256':module.digest(p)} for p in sorted(stage.rglob('*')) if p.is_file()]
  fingerprint=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest();expect={'source':'a'*40,'fingerprint':fingerprint,'packageSha256':None}
  (stage/'source-manifest.json').write_text(json.dumps({'version':1,'head':expect['source'],'fingerprint':fingerprint,'files':rows}))
  (stage/'driver-preflight-config.json').write_text(json.dumps({'stageRoot':'.','entrypoints':['scripts/qa/run.mjs','scripts/qa/preflight.mjs'],'sourceManifest':'source-manifest.json','expect':expect}))
  subprocess.run(['node',str(qa/'driver-preflight.mjs'),'driver-preflight-config.json','driver-preflight.json'],cwd=stage,check=True,capture_output=True)
  command=[sys.executable,module.RUNNER,'--timeout','1',str(stage.resolve()),'--','bash','scripts/qa/release-run.sh']
  return stage,command

 def test_real_static_receipt_valid_and_changed_fixture_rejects_without_launch(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);stage,command=self.prepared_stage(root)
   report=module.validate_driver_preflight(stage,command)
   self.assertEqual(report['status'],'PASS_STATIC_DRIVER_PREFLIGHT')
   original_popen=subprocess.Popen;launches=[]
   class FakeLauncher:
    stdout=io.StringIO('VPS job: qa-valid Remote outputs: /srv/dev-jobs/qa-valid\n')
    def wait(self):return 0
   def launch_once(argv,*args,**kwargs):
    if argv[0]=='node':return original_popen(argv,*args,**kwargs)
    launches.append(argv);return FakeLauncher()
   with patch.object(module.subprocess,'Popen',side_effect=launch_once):
    self.assertEqual(module.submit(command,stage,root/'valid',recover=lambda *_:0,validate_stage=module.validate_driver_preflight),0)
   self.assertEqual(launches,[command]);self.assertEqual(json.loads((root/'valid/driver-preflight-submission.json').read_text())['status'],'PASS_STATIC_DRIVER_PREFLIGHT')
   (stage/'fixtures/earned.json').write_text('{"changed":true}')
   out=root/'attempt'
   def only_preflight(argv,*args,**kwargs):
    if argv[0]=='node':return original_popen(argv,*args,**kwargs)
    raise AssertionError('launcher must not start')
   with patch.object(module.subprocess,'Popen',side_effect=only_preflight):
    with self.assertRaisesRegex(RuntimeError,'Driver preflight failed'):
     module.submit(command,stage,out,validate_stage=module.validate_driver_preflight)
   self.assertFalse(out.exists())

 def test_missing_receipt_or_changed_maintained_validator_rejects_before_launch(self):
  from unittest.mock import patch
  for change,expected in [('receipt','Missing mandatory driver preflight'),('validator','Maintained release-test wrapper mismatch')]:
   with self.subTest(change=change),tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp);stage,command=self.prepared_stage(root);out=root/'attempt'
    if change=='receipt':(stage/'driver-preflight.json').unlink()
    else:(stage/'scripts/qa/driver-preflight.mjs').write_text('// changed candidate validator\n')
    with patch.object(module.subprocess,'Popen',side_effect=AssertionError('launcher must not start')):
     with self.assertRaisesRegex(RuntimeError,expected):module.submit(command,stage,out,validate_stage=module.validate_driver_preflight)
    self.assertFalse(out.exists())

 def test_success_and_failure_both_recover_and_keep_partial_outputs(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp)
   for code in [0,1]:
    out=root/str(code);calls=[]
    def recover(job,stage,result):
     calls.append(job);(result/'partial.json').write_text('{"stage":"gate","passed":true}')
    command=[sys.executable,'-c',f'print("VPS job: own-{code} Remote outputs: /srv/dev-jobs/own-{code}",flush=True);raise SystemExit({code})']
    self.assertEqual(module.submit(command,root,out,recover,validate_stage=lambda _stage,_command:None),code);self.assertEqual(calls,[f'own-{code}']);self.assertTrue((out/'partial.json').exists());self.assertTrue((out/'submit.log').exists())
   with self.assertRaisesRegex(RuntimeError,'already exists'):module.submit(command,root,out,recover,validate_stage=lambda _stage,_command:None)
 def test_missing_validator_rejects_before_launcher(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);out=root/'out';marker=root/'launched'
   command=[sys.executable,'-c',f'from pathlib import Path;Path({str(marker)!r}).write_text("launched")']
   with self.assertRaisesRegex(RuntimeError,'Mandatory driver preflight'):module.submit(command,root,out)
   self.assertFalse(marker.exists());self.assertFalse(out.exists())

 def test_preflight_rejection_never_starts_launcher_or_creates_attempt(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);stage=root/'stage';stage.mkdir();out=root/'out';launched=root/'launched'
   command=[sys.executable,'-c',f'from pathlib import Path;Path({str(launched)!r}).write_text("launched")']
   def reject(_stage,_command):raise RuntimeError('preflight identity mismatch')
   with self.assertRaisesRegex(RuntimeError,'preflight identity mismatch'):
    module.submit(command,stage,out,validate_stage=reject)
   self.assertFalse(launched.exists());self.assertFalse(out.exists())

 def test_valid_preflight_runs_before_launcher_and_recovery(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);stage=root/'stage';stage.mkdir();out=root/'out';order=[]
   command=[sys.executable,'-c','print("VPS job: own-valid Remote outputs: /srv/dev-jobs/own-valid",flush=True)']
   def validate(actual,actual_command):self.assertEqual(actual,stage);self.assertEqual(actual_command,command);order.append('preflight');return {'status':'PASS_STATIC_DRIVER_PREFLIGHT'}
   def recover(job,_stage,_out):self.assertEqual(job,'own-valid');self.assertEqual(json.loads((_out/'driver-preflight-submission.json').read_text())['status'],'PASS_STATIC_DRIVER_PREFLIGHT');order.append('recovery');return 0
   self.assertEqual(module.submit(command,stage,out,recover,validate_stage=validate),0)
   self.assertEqual(order,['preflight','recovery'])

 def test_unlisted_remote_driver_rejects_before_launcher(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);stage=root/'stage';stage.mkdir();out=root/'out'
   command=[sys.executable,module.RUNNER,'--timeout','1',str(stage.resolve()),'--','node','unlisted-driver.mjs']
   with patch.object(module.subprocess,'Popen',side_effect=AssertionError('launcher must not start')):
    with self.assertRaisesRegex(RuntimeError,'Unbound release-test command'):
     module.submit(command,stage,out,validate_stage=module.validate_driver_preflight)
   self.assertFalse(out.exists())

class RecoveryFailureRegression(unittest.TestCase):
 def test_copy_or_missing_result_or_ssh_error_never_cleanup(self):
  from unittest.mock import patch
  import json
  for failure in ['copy','missing','ssh']:
   with self.subTest(failure=failure),tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp);stage=root/'stage';stage.mkdir();(stage/'data').write_text('x');out=root/'out';out.mkdir();calls=[]
    def fake_run(argv,**kwargs):
     calls.append(argv)
     if argv[0]=='rsync':
      if failure=='copy':raise subprocess.CalledProcessError(23,argv)
      (out/'request.json').write_text(json.dumps({'files_sha256':{'data':module.digest(stage/'data')}}));(out/'submission.json').write_text('{}');(out/'run.log').write_text('failed job retained')
      if failure!='missing':(out/'result.json').write_text(json.dumps({'job':'own-1','exit_code':1,'finished_epoch':1}))
      return subprocess.CompletedProcess(argv,0)
     return subprocess.CompletedProcess(argv,255)
    with patch.object(module.subprocess,'run',fake_run):
     with self.assertRaises((RuntimeError,subprocess.CalledProcessError)):module.recover_job('own-1',stage,out)
    self.assertFalse(any('rm -rf' in part for argv in calls for part in argv))


class PackageClosureRegression(unittest.TestCase):
 def test_unlisted_missing_duplicate_escape_and_followup_extras_reject(self):
  import json
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);export=root/'export';export.mkdir();(export/'index.html').write_text('x');entry={'path':'index.html','bytes':1,'sha256':module.digest(export/'index.html')};manifest={'sourceCommit':'a'*40,'sourceFingerprint':'b'*64,'files':[entry]}
   def write(value): (export/'release.json').write_text(json.dumps(value))
   write(manifest);module.validate_export(export)
   (export/'unlisted.txt').write_text('extra')
   with self.assertRaisesRegex(RuntimeError,'closure'):module.validate_export(export)
   (export/'unlisted.txt').unlink();(export/'index.html').unlink()
   with self.assertRaisesRegex(RuntimeError,'closure'):module.validate_export(export)
   (export/'index.html').write_text('x');write({**manifest,'files':[entry,entry]})
   with self.assertRaisesRegex(RuntimeError,'Duplicate'):module.validate_export(export)
   write({**manifest,'files':[{**entry,'path':'../outside'}]})
   with self.assertRaisesRegex(RuntimeError,'escaping'):module.validate_export(export)
   write(manifest);target=root/'target';target.mkdir();module.handoff_export(root,target);(target/'export/unlisted.txt').write_text('extra')
   with self.assertRaisesRegex(RuntimeError,'closure'):module.handoff_export(root,target)
 def test_valid_empty_run_log_recovers_before_owned_cleanup(self):
  from unittest.mock import patch
  import json
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);stage=root/'stage';stage.mkdir();(stage/'data').write_text('x');out=root/'out';out.mkdir();cleaned=[]
   def fake_run(argv,**kwargs):
    if argv[0]=='rsync':
     for name,value in [('request.json',{'files_sha256':{'data':module.digest(stage/'data')}}),('result.json',{'job':'own-0','exit_code':0,'finished_epoch':1}),('submission.json',{})]:(out/name).write_text(json.dumps(value))
     (out/'run.log').write_bytes(b'');return subprocess.CompletedProcess(argv,0)
    if any('test -d' in v for v in argv):return subprocess.CompletedProcess(argv,1)
    if any('rm -rf' in v for v in argv):cleaned.append(argv)
    return subprocess.CompletedProcess(argv,0)
   def fake_hashes(*args,**kwargs):return json.dumps({p.name:module.digest(p) for p in out.iterdir() if p.is_file()})
   with patch.object(module.subprocess,'run',fake_run),patch.object(module.subprocess,'check_output',fake_hashes):self.assertEqual(module.recover_job('own-0',stage,out),0)
   self.assertEqual(len(cleaned),1);self.assertEqual((out/'run.log').stat().st_size,0);self.assertTrue((out/'recovery.json').exists())

if __name__=='__main__':unittest.main()
