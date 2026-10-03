"""Capture the actual imported prefab and baked poses with Unity, no scene save."""
from pathlib import Path
import subprocess
import json

ROOT = Path(__file__).resolve().parents[2]
code = r'''
var go=UnityEngine.Object.Instantiate(UnityEngine.Resources.Load<UnityEngine.GameObject>("Vagrant/Player"));
go.transform.position=new UnityEngine.Vector3(1000,0,0);
foreach(var t in go.GetComponentsInChildren<UnityEngine.Transform>())t.gameObject.layer=31;
var anim=go.GetComponentInChildren<UnityEngine.Animation>();
var skins=go.GetComponentsInChildren<UnityEngine.SkinnedMeshRenderer>();
var staticObjects=new System.Collections.Generic.List<UnityEngine.GameObject>();
var cg=new UnityEngine.GameObject("Vagrant review camera");
var cam=cg.AddComponent<UnityEngine.Camera>();cam.cullingMask=1<<31;cam.orthographic=true;
cam.orthographicSize=1.1f;cam.clearFlags=UnityEngine.CameraClearFlags.SolidColor;
cam.backgroundColor=new UnityEngine.Color(.13f,.15f,.17f);cam.nearClipPlane=.05f;cam.farClipPlane=20;
var lightObject=new UnityEngine.GameObject("Vagrant preview key");
var light=lightObject.AddComponent<UnityEngine.Light>();light.type=UnityEngine.LightType.Directional;
light.intensity=1;light.cullingMask=1<<31;lightObject.transform.rotation=UnityEngine.Quaternion.Euler(35,-35,0);
bool fog=UnityEngine.RenderSettings.fog;UnityEngine.RenderSettings.fog=false;
var rt=new UnityEngine.RenderTexture(800,900,24);cam.targetTexture=rt;
var old=UnityEngine.RenderTexture.active;
System.IO.Directory.CreateDirectory("../art/vagrant/review");
try {
for(int i=0;i<10;i++) {
foreach(var o in staticObjects){UnityEngine.Object.DestroyImmediate(o.GetComponent<UnityEngine.MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(o);}staticObjects.Clear();
var clip=anim[(i==3||i==7)?"Attack":(i==4||i==6)?"Run":"Idle"].clip;
clip.SampleAnimation(anim.gameObject,(i==3||i==7)?clip.length*.45f:(i==4||i==6)?clip.length*.35f:0);
foreach(var skin in skins) {
bool visible=skin.name!="Protection vest"&&skin.name!="Backpack"||i>=5;
skin.enabled=false;if(!visible)continue;
var mesh=new UnityEngine.Mesh();skin.BakeMesh(mesh,false);
var v=mesh.vertices;var n=mesh.normals;
for(int j=0;j<v.Length;j++){v[j]=skin.transform.position+skin.transform.rotation*v[j];if(n.Length==v.Length)n[j]=skin.transform.rotation*n[j];}
mesh.vertices=v;mesh.normals=n;mesh.RecalculateBounds();
var o=new UnityEngine.GameObject("Baked pose",typeof(UnityEngine.MeshFilter),typeof(UnityEngine.MeshRenderer));o.layer=31;
o.GetComponent<UnityEngine.MeshFilter>().sharedMesh=mesh;o.GetComponent<UnityEngine.MeshRenderer>().sharedMaterials=skin.sharedMaterials;staticObjects.Add(o);
}
float yaw=(i==1||i==9)?90:(i==2||i==8)?180:0;
var target=go.transform.position+UnityEngine.Vector3.up;
cam.transform.position=target+UnityEngine.Quaternion.Euler(0,yaw,0)*new UnityEngine.Vector3(0,.1f,4);cam.transform.LookAt(target);
cam.Render();UnityEngine.RenderTexture.active=rt;
var tex=new UnityEngine.Texture2D(800,900,UnityEngine.TextureFormat.RGB24,false);
tex.ReadPixels(new UnityEngine.Rect(0,0,800,900),0,0);tex.Apply();
System.IO.File.WriteAllBytes("../art/vagrant/review/"+new[]{"front","side","back","attack","run","equipped","equipped-run","equipped-attack","equipped-back","equipped-side"}[i]+".png",tex.EncodeToPNG());UnityEngine.Object.DestroyImmediate(tex);
}
} finally {
UnityEngine.RenderTexture.active=old;cam.targetTexture=null;UnityEngine.Object.DestroyImmediate(rt);
UnityEngine.RenderSettings.fog=fog;
foreach(var o in staticObjects){UnityEngine.Object.DestroyImmediate(o.GetComponent<UnityEngine.MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(o);}
UnityEngine.Object.DestroyImmediate(cg);UnityEngine.Object.DestroyImmediate(lightObject);UnityEngine.Object.DestroyImmediate(go);
}
return "ten actual imported-model baked-pose captures";
'''
p = subprocess.run(["unity", "command", "eval", "--caller", "plugin", "--skill", "unity-cli",
                    "--project-path", str(ROOT / "Game"), "--result-only", code],
                   capture_output=True, text=True, cwd=ROOT, timeout=60)
print(p.stdout)
assert p.returncode == 0, p.stderr
assert json.loads(p.stdout)["success"], p.stdout
