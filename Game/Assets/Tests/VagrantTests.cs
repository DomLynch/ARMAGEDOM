using NUnit.Framework;
using UnityEngine;

namespace Ashvault.Tests
{
    public class VagrantTests
    {
        [Test]
        public void GameplaySelectsSurvivorWithoutChangingCollision()
        {
            var actor = ArenaBuilder.Actor("Survivor test", Vector3.zero, -1);
            try
            {
                Assert.IsNotNull(actor.GetComponentInChildren<VagrantGear>());
                var collider = actor.GetComponent<CharacterController>();
                Assert.AreEqual(1.8f, collider.height);
                Assert.AreEqual(.4f, collider.radius);
                Assert.AreEqual(Vector3.up * .9f, collider.center);
            }
            finally { Object.DestroyImmediate(actor); }
        }

        [Test]
        public void ImportedPiecesShareOriginalSkeletonAndDeformThroughoutClips()
        {
            var model = Object.Instantiate(Resources.Load<GameObject>("Vagrant/Player"));
            var original = Object.Instantiate(Resources.Load<GameObject>("Hero/Warden"));
            var mesh = new Mesh();
            try
            {
                var targetAnimation = model.GetComponentInChildren<Animation>();
                var originalAnimation = original.GetComponentInChildren<Animation>();
                var originalBones = original.GetComponentsInChildren<Transform>();
                var allBones = model.GetComponentsInChildren<Transform>();
                var skins = model.GetComponentsInChildren<SkinnedMeshRenderer>();
                var retainedBones = new System.Collections.Generic.HashSet<Transform>();
                foreach (var skin in skins)
                {
                    Assert.AreEqual(skin.bones.Length, skin.sharedMesh.bindposes.Length);
                    foreach (var bone in skin.bones)
                    {
                        retainedBones.Add(bone);
                        Assert.AreSame(System.Array.Find(allBones, t => t.name == bone.name), bone,
                            "Equipment must share the retained skeleton.");
                    }
                }
                Assert.AreEqual(19, retainedBones.Count);
                foreach (string clip in new[] { "Idle", "Run", "Attack" })
                    foreach (float phase in new[] { 0f, .2f, .4f, .6f, .8f, .99f })
                    {
                        var state = targetAnimation[clip];
                        state.clip.SampleAnimation(targetAnimation.gameObject, state.length * phase);
                        originalAnimation[clip].clip.SampleAnimation(originalAnimation.gameObject, state.length * phase);
                        foreach (var bone in retainedBones)
                        {
                            var source = System.Array.Find(originalBones, t => t.name == bone.name);
                            Assert.IsNotNull(source, bone.name);
                            Assert.AreEqual(source.parent.name, bone.parent.name, bone.name + " parent");
                            Assert.Less(Vector3.Distance(source.localPosition, bone.localPosition), .0001f);
                            Assert.Less(Quaternion.Angle(source.localRotation, bone.localRotation), .01f);
                        }
                        foreach (var skin in skins)
                        {
                            skin.BakeMesh(mesh, false);
                            var vertices = mesh.vertices;
                            var bind = skin.sharedMesh.vertices;
                            var triangles = skin.sharedMesh.triangles;
                            foreach (var vertex in vertices)
                            {
                                Assert.IsFalse(float.IsNaN(vertex.sqrMagnitude) || float.IsInfinity(vertex.sqrMagnitude));
                                if (skin.name == "Machete")
                                    Assert.Greater((skin.transform.position + skin.transform.rotation * vertex).y, -.025f,
                                        "Machete must clear the floor in " + clip);
                            }
                            for (int i = 0; i < triangles.Length; i++)
                            {
                                int a = triangles[i], b = triangles[i % 3 == 2 ? i - 2 : i + 1];
                                // Imported mesh uses centimetres; BakeMesh includes its 0.01 object scale.
                                float rest = Vector3.Distance(Vector3.Scale(bind[a] - bind[b], skin.transform.localScale), Vector3.zero);
                                Assert.Less(Vector3.Distance(vertices[a], vertices[b]) - rest, .2f,
                                    skin.name + " stretched edge in " + clip);
                            }
                        }
                    }
            }
            finally { Object.DestroyImmediate(mesh); Object.DestroyImmediate(model); Object.DestroyImmediate(original); }
        }

        [Test]
        public void SurvivorHasSeparateEquipmentAndOriginalMotion()
        {
            var asset = Resources.Load<GameObject>("Vagrant/Player");
            Assert.IsNotNull(asset, "The modular survivor pilot must be imported.");
            var model = Object.Instantiate(asset);
            try
            {
                Assert.IsEmpty(model.GetComponentsInChildren<Collider>(), "Art must retain the gameplay collider.");
                var animation = model.GetComponentInChildren<Animation>();
                Assert.IsNotNull(animation);
                foreach (string clip in new[] { "Idle", "Run", "Attack" })
                {
                    Assert.IsNotNull(animation[clip], "Original motion missing: " + clip);
                    Assert.AreSame(Resources.Load<GameObject>("Hero/Warden").GetComponentInChildren<Animation>()[clip].clip, animation[clip].clip);
                }
                var body = System.Array.Find(model.GetComponentsInChildren<SkinnedMeshRenderer>(), s => s.name == "Vagrant body");
                var baked = new Mesh();
                animation["Idle"].clip.SampleAnimation(model, 0);
                body.BakeMesh(baked); var before = baked.vertices;
                animation["Attack"].clip.SampleAnimation(model, animation["Attack"].length * .45f);
                body.BakeMesh(baked); var after = baked.vertices;
                float displacement = 0;
                for (int i = 0; i < before.Length; i++) displacement = Mathf.Max(displacement, Vector3.Distance(before[i], after[i]));
                Object.DestroyImmediate(baked);
                Assert.Greater(displacement, .02f, "Reused clips must deform the imported survivor, not only move bones.");
                foreach (string name in new[] { "Vagrant body", "Torso jacket", "Legs trousers", "Feet boots", "Machete", "Protection vest", "Backpack" })
                    Assert.IsNotNull(System.Array.Find(model.GetComponentsInChildren<SkinnedMeshRenderer>(), s => s.name == name), name);
                Assert.LessOrEqual(model.GetComponentsInChildren<Renderer>().Length, 10);
                foreach (var renderer in model.GetComponentsInChildren<Renderer>())
                    foreach (var material in renderer.sharedMaterials)
                    {
                        Assert.IsNotNull(material.mainTexture, renderer.name + " missing baked albedo.");
                        Assert.AreEqual("Standard", material.shader.name);
                    }
                Assert.IsNotNull(Resources.Load<GameObject>("Hero/Warden"), "Original knight rollback must remain.");
            }
            finally { Object.DestroyImmediate(model); }
        }

        [Test]
        public void EquipmentChangesKeepTheSameRigAndAnimationPose()
        {
            var asset = Resources.Load<GameObject>("Vagrant/Player");
            Assert.IsNotNull(asset, "The modular survivor pilot must be imported.");
            var model = Object.Instantiate(asset);
            try
            {
                var gear = model.GetComponent("VagrantGear");
                Assert.IsNotNull(gear, "Pilot needs reusable equipment toggles.");
                var skins = model.GetComponentsInChildren<SkinnedMeshRenderer>();
                var vest = System.Array.Find(skins, s => s.name == "Protection vest");
                var bag = System.Array.Find(skins, s => s.name == "Backpack");
                Assert.IsFalse(vest.enabled, "Starting rank has no vest.");
                Assert.IsFalse(bag.enabled, "Starting rank has no backpack.");
                var animation = model.GetComponentInChildren<Animation>();
                animation["Attack"].clip.SampleAnimation(animation.gameObject, animation["Attack"].length * .45f);
                var bones = skins[0].bones;
                var before = System.Array.ConvertAll(bones, b => b.localToWorldMatrix);
                model.SendMessage("SetProtection", true);
                model.SendMessage("SetBackpack", true);
                Assert.IsTrue(vest.enabled);
                Assert.IsTrue(bag.enabled);
                for (int i = 0; i < bones.Length; i++) Assert.AreEqual(before[i], bones[i].localToWorldMatrix);
                model.SendMessage("SetProtection", false);
                model.SendMessage("SetBackpack", false);
                Assert.IsFalse(vest.enabled);
                Assert.IsFalse(bag.enabled);
            }
            finally { Object.DestroyImmediate(model); }
        }
    }
}
