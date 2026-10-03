using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Ashvault.Tests
{
    public class LondonTests
    {
        [UnityTest]
        public System.Collections.IEnumerator PlayableRunLoadsTheSavedLondonLayout()
        {
            SceneManager.LoadScene("Ashvault");
            yield return null;
            var stage = Camera.main.GetComponent<LondonBackdrop>();
            Assert.IsNotNull(stage);
            Assert.Greater(stage.Revision, 0);
            Assert.IsFalse(Camera.main.orthographic);
            var image = GameObject.Find("Original London image").GetComponent<Renderer>();
            Assert.AreEqual(1672, image.sharedMaterial.mainTexture.width);
            Assert.AreEqual(941, image.sharedMaterial.mainTexture.height);
            Assert.IsFalse(GameObject.Find("Area(Clone)").GetComponentInChildren<Renderer>().enabled);
            foreach(var direction in new[]{Vector3.forward,Vector3.back,Vector3.left,Vector3.right})
                Assert.IsTrue(Physics.Raycast(RunManager.Instance.Player.transform.position+Vector3.up,direction,100,1<<8));

        }

        [UnityTest]
        public System.Collections.IEnumerator SavedContentReloadsWithoutRestartAndRejectsInvalidEdits()
        {
            SceneManager.LoadScene("Ashvault"); yield return null;
            var stage=Camera.main.GetComponent<LondonBackdrop>();
            var run=RunManager.Instance; run.enabled=false;
            string path=System.IO.Path.Combine(stage.ContentDirectory,"layout.json");
            string original=System.IO.File.ReadAllText(path);
            string png=System.IO.Path.Combine(stage.ContentDirectory,"backdrop.png");
            byte[] originalImage=System.IO.File.ReadAllBytes(png);
            var oldMesh=GameObject.Find("Original London image").GetComponent<MeshFilter>().sharedMesh;
            int revision=stage.Revision;
            try
            {
                var settings=JsonUtility.FromJson<LondonBackdrop.Layout>(original); settings.exposure=.83f;
                System.IO.File.WriteAllText(path,JsonUtility.ToJson(settings));
                yield return new WaitForSecondsRealtime(1.3f);
                Assert.Greater(stage.Revision,revision); Assert.AreSame(run,RunManager.Instance);
                Assert.IsTrue(oldMesh==null,"Replaced runtime meshes must be released.");
                Assert.That(stage.Current.exposure,Is.EqualTo(.83f).Within(.001f));
                string invalid=JsonUtility.ToJson(settings).Replace("0.83","-10");
                Assert.IsFalse(stage.TryApply(invalid,out _));
                Assert.That(stage.Current.exposure,Is.EqualTo(.83f).Within(.001f));
                settings.road=new[]{new Vector2(.46f,.75f),new Vector2(.54f,.75f),new Vector2(.54f,.95f),new Vector2(.46f,.95f)};
                Assert.IsFalse(stage.TryApply(JsonUtility.ToJson(settings),out string error));
                StringAssert.Contains("wave entrance",error);
                settings.road=new[]{new Vector2(.3f,.4f),new Vector2(.7f,.4f),new Vector2(.7f,.95f),new Vector2(.65f,.95f),new Vector2(.65f,.9f),new Vector2(.6f,.9f),new Vector2(.6f,.95f),new Vector2(.3f,.95f)};
                Assert.IsTrue(stage.TryApply(JsonUtility.ToJson(settings),out error),error);
                int accepted=stage.Revision;
                var next=JsonUtility.FromJson<LondonBackdrop.Layout>(original); next.exposure=.72f;
                System.IO.File.WriteAllText(path,JsonUtility.ToJson(next));
                var wrongAspect=new Texture2D(2,2);
                System.IO.File.WriteAllBytes(png,wrongAspect.EncodeToPNG()); Object.Destroy(wrongAspect);
                LogAssert.Expect(LogType.Warning,new System.Text.RegularExpressions.Regex("LONDON_REJECTED:"));
                yield return new WaitForSecondsRealtime(1.3f);
                Assert.AreEqual(accepted,stage.Revision,"Invalid paired image must not commit the new layout.");
                Assert.That(stage.Current.exposure,Is.EqualTo(.83f).Within(.001f));
                System.IO.File.WriteAllBytes(png,originalImage);
                next.exposure=.83f;System.IO.File.WriteAllText(path,JsonUtility.ToJson(next));
                yield return new WaitForSecondsRealtime(1.3f);
                SceneManager.LoadScene("Ashvault"); yield return null;
                Assert.That(Camera.main.GetComponent<LondonBackdrop>().Current.exposure,Is.EqualTo(.83f).Within(.001f));
            }
            finally { System.IO.File.WriteAllText(path,original); System.IO.File.WriteAllBytes(png,originalImage); }
        }

        [UnityTest]
        public System.Collections.IEnumerator ZoomAndFollowKeepTheImageRegisteredAndWithinItsEdges()
        {
            SceneManager.LoadScene("Ashvault");yield return null;yield return null;
            var camera=Camera.main;var run=RunManager.Instance;run.enabled=false;run.Player.enabled=false;
            var stage=camera.GetComponent<LondonBackdrop>();
            var mesh=GameObject.Find("Original London image").GetComponent<MeshFilter>().sharedMesh;
            Vector3 pose=camera.transform.position;Quaternion angle=camera.transform.rotation;
            Vector3 before=camera.WorldToViewportPoint(mesh.vertices[0]);
            Assert.That(camera.WorldToViewportPoint(mesh.vertices[1]).x-before.x,Is.EqualTo(1.485f).Within(.005f));
            Assert.That(run.Player.transform.Find("Visual").localScale.x,Is.EqualTo(1.265f).Within(.001f));
            var capsule=run.Player.GetComponent<CharacterController>();capsule.enabled=false;
            run.Player.transform.position=new Vector3(0,.04f,2);capsule.enabled=true;
            yield return new WaitForSecondsRealtime(1.2f);
            Vector3 topLeft=camera.WorldToViewportPoint(mesh.vertices[0]), bottomRight=camera.WorldToViewportPoint(mesh.vertices[2]);
            Assert.Greater((topLeft-before).magnitude,.03f,"The image should gently scroll with travel.");
            Assert.LessOrEqual(topLeft.x,.001f);Assert.GreaterOrEqual(topLeft.y,.999f);
            Assert.GreaterOrEqual(bottomRight.x,.999f);Assert.LessOrEqual(bottomRight.y,.001f);
            Assert.AreEqual(pose,camera.transform.position);Assert.Less(Quaternion.Angle(angle,camera.transform.rotation),.001f);
            var inspect=camera.GetComponent<HeroView>();inspect.Toggle();yield return null;inspect.Toggle();yield return null;
            Assert.IsFalse(camera.orthographic);
            Assert.That(camera.WorldToViewportPoint(mesh.vertices[1]).x-camera.WorldToViewportPoint(mesh.vertices[0]).x,Is.EqualTo(1.485f).Within(.005f));
        }

        [Test]
        public void LondonAreaKeepsThePlayableCorridorAndClosedBoundary()
        {
            var asset = Resources.Load<GameObject>("London/Area");
            Assert.IsNotNull(asset, "The London layout must be saved as an editable prefab.");
            var area = Object.Instantiate(asset);
            try
            {
                foreach (var renderer in area.GetComponentsInChildren<Renderer>())
                {
                    if (renderer.name == "Road") Assert.Less(renderer.bounds.size.y, .4f, "Imported road must lie flat.");
                    if (renderer.name == "Lamp") Assert.That(renderer.bounds.size.y, Is.InRange(3.5f, 3.8f), "Imported lamps must stand upright.");
                }
                Physics.SyncTransforms();
                for (int x = -4; x <= 4; x += 2)
                    for (int z = -8; z <= 6; z += 2)
                    {
                        Assert.IsTrue(Physics.Raycast(new Vector3(x, 2, z), Vector3.down, out var hit, 3, 1 << 8));
                        Assert.That(hit.point.y, Is.EqualTo(0).Within(.04f), "Central combat lane must remain level and clear.");
                    }
                foreach (var direction in new[] { Vector3.left, Vector3.right, Vector3.forward, Vector3.back })
                    Assert.IsTrue(Physics.Raycast(Vector3.up, direction, 11, 1 << 8), "The existing arena must stay enclosed.");
            }
            finally { Object.DestroyImmediate(area); }
        }

        [Test]
        public void LondonPropsHaveExplicitMaterialsAndBoundedRendererCount()
        {
            var asset = Resources.Load<GameObject>("London/Area");
            Assert.IsNotNull(asset);
            var renderers = asset.GetComponentsInChildren<Renderer>();
            Assert.That(renderers.Length, Is.InRange(8, 130));
            foreach (var renderer in renderers)
                foreach (var material in renderer.sharedMaterials)
                {
                    Assert.IsNotNull(material, renderer.name);
                    Assert.IsNotNull(material.shader, renderer.name);
                    Assert.IsTrue(material.shader.isSupported, renderer.name);
                }
            Assert.IsEmpty(asset.GetComponentsInChildren<Rigidbody>());
        }
    }
}
