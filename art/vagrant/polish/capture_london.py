"""Staged final-import poses in the actual London scene/camera, no scene save.
Complements the real native movement/combat check; these stills are pose reviews.
Run only while owning the shared Unity slot.
"""
import json, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
def evaluate(code):
    p = subprocess.run(['unity','command','eval','--caller','plugin','--skill','unity-cli','--project-path',str(ROOT/'Game'),'--result-only',code], capture_output=True,text=True,timeout=60)
    r = json.loads(p.stdout); assert p.returncode == 0 and r['success'],r
    return r.get('result')
evaluate('UnityEditor.SceneManagement.EditorSceneManager.OpenScene("Assets/Scenes/Ashvault.unity"); UnityEditor.EditorApplication.isPlaying=true; return "started";')
try:
    deadline=time.monotonic()+30
    while True:
        try:
            if evaluate('return Ashvault.RunManager.Instance != null && Ashvault.RunManager.Instance.Player != null && UnityEngine.Camera.main != null;'):break
        except (ValueError, AssertionError):pass
        assert time.monotonic()<deadline,'London scene did not start'
        time.sleep(.5)
    code=r'''
UnityEditor.EditorApplication.isPaused=true;
var player=Ashvault.RunManager.Instance.Player;
var visual=player.transform.Find("Visual");
if(UnityEngine.Mathf.Abs(visual.localScale.x-1.265f)>.0001f)throw new System.Exception("Saved character scale changed");
var animation=player.GetComponentInChildren<UnityEngine.Animation>();
var skins=player.GetComponentsInChildren<UnityEngine.SkinnedMeshRenderer>();
var gear=player.GetComponentInChildren<Ashvault.VagrantGear>();
var cam=UnityEngine.Camera.main;var previous=cam.targetTexture;
var rt=new UnityEngine.RenderTexture(1672,941,24);cam.targetTexture=rt;
var old=UnityEngine.RenderTexture.active;
var pieces=new System.Collections.Generic.List<UnityEngine.GameObject>();
System.IO.Directory.CreateDirectory("../art/vagrant/polish/review/london");
try {
for(int i=0;i<12;i++) {
foreach(var o in pieces){UnityEngine.Object.DestroyImmediate(o.GetComponent<UnityEngine.MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(o);}pieces.Clear();
bool equipped=i>=6;gear.SetProtection(equipped);gear.SetBackpack(equipped);
player.transform.rotation=UnityEngine.Quaternion.Euler(0,(i%6)>=3?180:0,0);
int pose=i%3;var clip=animation[pose==1?"Run":pose==2?"Attack":"Idle"].clip;
clip.SampleAnimation(animation.gameObject,pose==1?clip.length*.35f:pose==2?clip.length*.45f:0);
foreach(var skin in skins) {
bool visible=skin.name!="Protection vest"&&skin.name!="Backpack"||equipped;
skin.enabled=false;if(!visible)continue;
var mesh=new UnityEngine.Mesh();skin.BakeMesh(mesh,false);
var v=mesh.vertices;var n=mesh.normals;
for(int j=0;j<v.Length;j++){v[j]=skin.transform.position+skin.transform.rotation*v[j];n[j]=skin.transform.rotation*n[j];}
mesh.vertices=v;mesh.normals=n;mesh.RecalculateBounds();
var o=new UnityEngine.GameObject("Pose review",typeof(UnityEngine.MeshFilter),typeof(UnityEngine.MeshRenderer));
o.GetComponent<UnityEngine.MeshFilter>().sharedMesh=mesh;o.GetComponent<UnityEngine.MeshRenderer>().sharedMaterials=skin.sharedMaterials;pieces.Add(o);
}
cam.Render();UnityEngine.RenderTexture.active=rt;
var tex=new UnityEngine.Texture2D(1672,941,UnityEngine.TextureFormat.RGB24,false);
tex.ReadPixels(new UnityEngine.Rect(0,0,1672,941),0,0);tex.Apply();
string name=(equipped?"equipped":"starter")+((i%6)>=3?"-front-":"-back-")+new[]{"idle","run","attack"}[pose];
System.IO.File.WriteAllBytes("../art/vagrant/polish/review/london/"+name+".png",tex.EncodeToPNG());UnityEngine.Object.DestroyImmediate(tex);
}
} finally {
foreach(var o in pieces){UnityEngine.Object.DestroyImmediate(o.GetComponent<UnityEngine.MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(o);}
UnityEngine.RenderTexture.active=old;cam.targetTexture=previous;UnityEngine.Object.DestroyImmediate(rt);
}
return new {scale=visual.localScale.x,fieldOfView=cam.fieldOfView,projection=cam.projectionMatrix.ToString(),cameraPosition=cam.transform.position.ToString(),kind="staged imported poses in runtime London camera"};
'''
    receipt=evaluate(code);(ROOT/'art/vagrant/polish/review/london-camera.json').write_text(json.dumps(receipt,indent=2));print(receipt)
finally:
    evaluate('UnityEditor.EditorApplication.isPaused=false; UnityEditor.EditorApplication.isPlaying=false; return "stopped without scene save";')
