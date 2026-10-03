# /// script
# dependencies = ["bpy==5.2.2", "huggingface_hub==1.7.2", "numpy"]
# ///
import os,subprocess,runpy,json,traceback
from pathlib import Path
subprocess.run(["apt-get","update","-qq"],check=True,stdout=subprocess.DEVNULL)
subprocess.run(["apt-get","install","-y","-qq","libxfixes3","libxi6","libxrender1","libxkbcommon0","libsm6","libgl1","libxrandr2"],check=True,stdout=subprocess.DEVNULL)
from huggingface_hub import HfApi,hf_hub_download
api=HfApi(); repo='Domlynch/armagedom-vagrant-pilot-20261003'; revision='4cbcfe833291ff80e8810a801442221f017010b7'
root=Path("/tmp/vagrant"); root.mkdir(exist_ok=True)
# Verify write/read permission using the actual secret before expensive authoring.
api.upload_file(repo_id=repo,repo_type="dataset",path_or_fileobj=b"vagrant-job-write-proof",path_in_repo="receipts/job-roundtrip.txt")
assert Path(hf_hub_download(repo,"receipts/job-roundtrip.txt",repo_type="dataset")).read_bytes()==b"vagrant-job-write-proof"
for name in ["inputs/rig.blend","inputs/donor.npz","inputs/CC0-LICENSE.md","polish-source/build_pilot.py","polish-source/validate_pilot.py"]:
 p=Path(hf_hub_download(repo,name,repo_type="dataset",revision=revision));dest=root/(name if name.startswith("inputs/") else Path(name).name);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
try:
 runpy.run_path(str(root/"build_pilot.py"),run_name="__main__")
 checkpoint=api.upload_folder(repo_id=repo,repo_type="dataset",folder_path=root/"output",path_in_repo="pilot-polish",commit_message="Persist modular pilot before validation/render")
 print("MODEL_CHECKPOINT="+checkpoint.oid,flush=True)
 runpy.run_path(str(root/"validate_pilot.py"),run_name="__main__")
 commit=api.upload_folder(repo_id=repo,repo_type="dataset",folder_path=root/"output",path_in_repo="pilot-polish",commit_message="Persist pilot preservation and deformation validation")
 print("OUTPUT_REVISION="+commit.oid,flush=True)
except Exception:
 traceback.print_exc();(root/"output").mkdir(exist_ok=True);(root/"output/error.txt").write_text(traceback.format_exc());api.upload_folder(repo_id=repo,repo_type="dataset",folder_path=root/"output",path_in_repo="pilot-polish",commit_message="Preserve partial pilot and diagnostic failure");raise
os._exit(0)
