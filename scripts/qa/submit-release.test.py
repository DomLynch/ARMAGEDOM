import importlib.util,pathlib,subprocess,sys,tempfile,unittest
spec=importlib.util.spec_from_file_location('submit_release',pathlib.Path(__file__).with_name('submit-release.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SubmissionRegression(unittest.TestCase):
 def test_success_and_failure_both_recover_and_keep_partial_outputs(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp)
   for code in [0,1]:
    out=root/str(code);calls=[]
    def recover(job,stage,result):
     calls.append(job);(result/'partial.json').write_text('{"stage":"gate","passed":true}')
    command=[sys.executable,'-c',f'print("VPS job: own-{code} Remote outputs: /srv/dev-jobs/own-{code}",flush=True);raise SystemExit({code})']
    self.assertEqual(module.submit(command,root,out,recover),code);self.assertEqual(calls,[f'own-{code}']);self.assertTrue((out/'partial.json').exists());self.assertTrue((out/'submit.log').exists())
   with self.assertRaisesRegex(RuntimeError,'already exists'):module.submit(command,root,out,recover)

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
