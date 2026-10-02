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
            var source = Resources.Load<GameObject>("London/Area");
            var road = source.GetComponentInChildren<MeshFilter>().sharedMesh;
            bool found = false;
            foreach (var filter in Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None))
                if (filter.sharedMesh == road) found = true;
            Assert.IsTrue(found, "The playable run must instantiate the saved London road, not the old arena.");
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
