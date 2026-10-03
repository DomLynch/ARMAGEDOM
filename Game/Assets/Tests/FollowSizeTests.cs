using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Ashvault.Tests {
public partial class BridgeTests {
    [UnityTest] public IEnumerator FollowKeepsPlayerHeightAndArtworkRegisteredAcrossAreas() {
        SceneManager.LoadScene("Ashvault");yield return null;yield return null;
        var run=RunManager.Instance;run.enabled=false;var player=run.Player;player.enabled=false;
        var camera=Camera.main;var stage=camera.GetComponent<LondonBackdrop>();
        var pose=camera.transform.position;var angle=camera.transform.rotation;
        float expected=0;
        foreach(var area in new[]{"west","south","east"}) {
            // Park existing enemies so destination calibration checks the player only.
            foreach(var actor in Object.FindObjectsByType<EnemyController>(FindObjectsSortMode.None)) actor.gameObject.SetActive(false);
            var capsule=player.GetComponent<CharacterController>();capsule.enabled=false;
            player.transform.position=stage.CalibratedGround(area=="west"?new Vector2(.52f,.78f):area=="south"?new Vector2(.55f,.29f):new Vector2(.10f,.72f));
            string folder=Path.Combine(Application.streamingAssetsPath,"London/Travel",area);
            Assert.IsTrue(stage.TryLoadArea(folder,false,out var error),error);
            if(area=="east") {
                Assert.Greater(stage.Current.masks.Length,0,"Painted east props need foreground depth masks");
                var start=stage.CalibratedGround(new Vector2(.70f,.33f))+Vector3.up*.5f;
                var crate=stage.CalibratedGround(new Vector2(.766f,.333f))+Vector3.up*.5f;
                Assert.IsTrue(Physics.Linecast(start,crate,1<<8),"North road crate needs a solid base");
                Assert.IsTrue(Physics.Linecast(stage.CalibratedGround(new Vector2(.95f,.34f))+Vector3.up*.5f,stage.CalibratedGround(new Vector2(.95f,.29f))+Vector3.up*.5f,1<<8),"Building frontage stays solid");
            }
            foreach(var point in area=="west"?new[]{new Vector2(.52f,.78f),new Vector2(.90f,.40f)}:area=="south"?new[]{new Vector2(.55f,.29f),new Vector2(.30f,.105f),new Vector2(.82f,.94f)}:new[]{new Vector2(.10f,.72f),new Vector2(.82f,.30f),new Vector2(.70f,.29f)}) {
                player.transform.position=stage.CalibratedGround(point);
                yield return new WaitForSecondsRealtime(.9f);
                var bottom=camera.WorldToViewportPoint(player.transform.position);
                var top=camera.WorldToViewportPoint(player.transform.position+Vector3.up*2);
                float height=top.y-bottom.y;
                if(expected==0)expected=height;
                Assert.That(height,Is.EqualTo(expected).Within(expected*.01f),area+" player size changes with depth");
                Assert.That(camera.transform.position,Is.EqualTo(pose));Assert.Less(Quaternion.Angle(angle,camera.transform.rotation),.001f);
                var mesh=GameObject.Find("Original London image").GetComponent<MeshFilter>().sharedMesh;
                var tl=camera.WorldToViewportPoint(mesh.vertices[0]);var br=camera.WorldToViewportPoint(mesh.vertices[2]);
                Assert.LessOrEqual(tl.x,.001f);Assert.GreaterOrEqual(tl.y,.999f);Assert.GreaterOrEqual(br.x,.999f);Assert.LessOrEqual(br.y,.001f);
                var uv=stage.CalibratedPoint(player.transform.position);
                var registered=Vector3.Lerp(Vector3.Lerp(mesh.vertices[0],mesh.vertices[1],uv.x),Vector3.Lerp(mesh.vertices[3],mesh.vertices[2],uv.x),uv.y);
                var screen=camera.WorldToViewportPoint(registered);
                Assert.That(screen.x,Is.EqualTo(bottom.x).Within(.001f));Assert.That(screen.y,Is.EqualTo(bottom.y).Within(.001f));
                Capture(camera,area+"-"+point.y.ToString("F3",System.Globalization.CultureInfo.InvariantCulture));
            }
        }
    }
    static void Capture(Camera camera,string name) {
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../artifacts/follow-size-views"));Directory.CreateDirectory(folder);
        var prior=camera.targetTexture;var active=RenderTexture.active;var target=RenderTexture.GetTemporary(1280,720,24);var texture=new Texture2D(1280,720,TextureFormat.RGB24,false);
        try {camera.targetTexture=target;camera.Render();RenderTexture.active=target;texture.ReadPixels(new Rect(0,0,1280,720),0,0);texture.Apply();File.WriteAllBytes(Path.Combine(folder,name+".png"),texture.EncodeToPNG());}
        finally {camera.targetTexture=prior;RenderTexture.active=active;RenderTexture.ReleaseTemporary(target);Object.Destroy(texture);}
    }
}
}
