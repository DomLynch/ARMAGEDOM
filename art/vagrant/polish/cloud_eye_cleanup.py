# /// script
# dependencies = ["bpy==5.2.2", "huggingface_hub==1.7.2", "numpy"]
# ///
import os,subprocess,runpy,json,traceback
from pathlib import Path
subprocess.run(["apt-get","update","-qq"],check=True,stdout=subprocess.DEVNULL)
subprocess.run(["apt-get","install","-y","-qq","libxfixes3","libxi6","libxrender1","libxkbcommon0","libsm6","libgl1","libxrandr2"],check=True,stdout=subprocess.DEVNULL)
from huggingface_hub import HfApi,hf_hub_download
api=HfApi(); repo='Domlynch/armagedom-vagrant-pilot-20261003'; revision='8a6bf9a9d2310486b74d16837c6ab0c36da00bb3'
root=Path("/tmp/vagrant"); root.mkdir(exist_ok=True)
# Verify write/read permission using the actual secret before expensive authoring.
api.upload_file(repo_id=repo,repo_type="dataset",path_or_fileobj=b"vagrant-job-write-proof",path_in_repo="receipts/job-roundtrip.txt")
assert Path(hf_hub_download(repo,"receipts/job-roundtrip.txt",repo_type="dataset")).read_bytes()==b"vagrant-job-write-proof"
for name in ["inputs/rig.blend","inputs/donor.npz","inputs/CC0-LICENSE.md","polish-source/build_pilot.py","polish-source/validate_pilot.py"]:
 p=Path(hf_hub_download(repo,name,repo_type="dataset",revision=revision));dest=root/(name if name.startswith("inputs/") else Path(name).name);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())

CHECKPOINT='8a6bf9a9d2310486b74d16837c6ab0c36da00bb3'
# Resume the baked checkpoint rather than repeat texture authoring.
import bpy,hashlib
for name in api.list_repo_files(repo_id=repo,repo_type='dataset',revision=CHECKPOINT):
 if name.startswith('pilot-polish/'):
  local=root/'output'/name.removeprefix('pilot-polish/');local.parent.mkdir(parents=True,exist_ok=True)
  local.write_bytes(Path(hf_hub_download(repo,name,repo_type='dataset',revision=CHECKPOINT)).read_bytes())
bpy.ops.wm.open_mainfile(filepath=str(root/'output/candidate.blend'),use_scripts=False)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');vest=bpy.data.objects['Protection vest']
for group in vest.vertex_groups:group.remove(list(range(len(vest.data.vertices))))
vest.vertex_groups['Chest'].add(list(range(len(vest.data.vertices))),1,'REPLACE')
# Remove four misplaced eye/pupil planes after visual review. The donor's
# own eye anatomy remains; no rig or anatomy vertex changes.
import bmesh
body=bpy.data.objects['Vagrant body'];owned=set()
for poly in body.data.polygons:
 if len(poly.vertices)==4 and all(abs(body.data.vertices[i].co.x)>.03 and abs(body.data.vertices[i].co.x)<.065 and 1.79<body.data.vertices[i].co.z<1.815 and -.12<body.data.vertices[i].co.y<-.09 for i in poly.vertices):
  owned.update(poly.vertices)
assert len(owned)==16,('unexpected eye-plane ownership',len(owned))
bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.verts[i] for i in owned],context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
 if obj.type in ('MESH','ARMATURE'):obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(root/'output/candidate.blend'))
bpy.ops.export_scene.fbx(filepath=str(root/'output/Vagrant.fbx'),use_selection=True,object_types={'MESH','ARMATURE'},axis_forward='-Z',axis_up='Y',apply_scale_options='FBX_SCALE_ALL',global_scale=1,add_leaf_bones=False,bake_space_transform=False,bake_anim=True,bake_anim_step=.25,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,path_mode='STRIP')
manifest=json.loads((root/'output/manifest.json').read_text());manifest['fbx_sha256']=hashlib.sha256((root/'output/Vagrant.fbx').read_bytes()).hexdigest();manifest['pieces']=[{'name':o.name,'vertices':len(o.data.vertices),'material':o.data.materials[0].name} for o in bpy.data.objects if o.type=='MESH'];manifest['face_repair']='removed raised brow tubes and misplaced eye planes after visual rejection';manifest['vest_repair']='rigid Chest attachment avoids arm-weight stretch';(root/'output/manifest.json').write_text(json.dumps(manifest,indent=2))
runpy.run_path(str(root/'validate_pilot.py'),run_name='__main__')
(root/'output/error.txt').unlink(missing_ok=True)
commit=api.upload_folder(repo_id=repo,repo_type='dataset',folder_path=root/'output',path_in_repo='pilot-polish',commit_message='Remove misplaced eye planes; preserve original donor eye anatomy')
print('OUTPUT_REVISION='+commit.oid,flush=True)
os._exit(0)
