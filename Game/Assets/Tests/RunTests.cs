using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Ashvault.Tests
{
    public class RunTests
    {
        RunManager run;

        [Test]
        public void RenderMaterialsAreExplicitBuildDependencies()
        {
            foreach (string name in new[] { "AshvaultSurface", "AshvaultLine" })
            {
                var material = Resources.Load<Material>(name);
                Assert.IsNotNull(material, name + " must be in Resources so the player retains its shader.");
                Assert.IsNotNull(material.shader);
            }
        }

        [Test]
        public void GothicModelsKeepScaleMaterialsAndGameplaySeparation()
        {
            foreach (string name in new[] { "Knight", "Goblin", "Orc", "Ogre", "Warlock", "Necromancer" })
            {
                var asset = Resources.Load<GameObject>(name == "Knight" ? "Hero/Warden" : "Gothic/" + name);
                Assert.IsNotNull(asset, name);
                var model = Object.Instantiate(asset);
                try
                {
                    Assert.AreEqual(0, model.GetComponentsInChildren<Collider>().Length, name + " art must not change collision.");
                    var renderers = model.GetComponentsInChildren<Renderer>();
                    Assert.Greater(renderers.Length, 0);
                    Assert.Less(renderers.Length, 36, name + " details must be batched.");
                    var animation = model.GetComponentInChildren<Animation>();
                    Assert.IsNotNull(animation, name + " needs its skeletal animation.");
                    animation["Idle"].clip.SampleAnimation(model, 0);
                    var bounds = new Bounds();
                    bool firstVertex = true;
                    foreach (var renderer in renderers)
                    {
                        // Renderer.bounds includes every imported animation, not current geometry.
                        if (renderer is SkinnedMeshRenderer skin)
                        {
                            var mesh = new Mesh();
                            skin.BakeMesh(mesh);
                            foreach (var vertex in mesh.vertices)
                            {
                                var point = renderer.transform.TransformPoint(vertex);
                                Assert.IsFalse(float.IsNaN(point.y) || float.IsInfinity(point.y));
                                if (firstVertex) { bounds = new Bounds(point, Vector3.zero); firstVertex = false; }
                                else bounds.Encapsulate(point);
                            }
                            Object.DestroyImmediate(mesh);
                        }
                        else
                        {
                            if (firstVertex) { bounds = renderer.bounds; firstVertex = false; }
                            else bounds.Encapsulate(renderer.bounds);
                        }
                        foreach (var material in renderer.sharedMaterials)
                        {
                            Assert.IsNotNull(material);
                            Assert.AreEqual("Standard", material.shader.name);
                            Assert.IsNotNull(material.mainTexture, name + " lost its material remap.");
                        }
                    }
                    Assert.That(bounds.size.y, Is.InRange(1f, 3.5f), name + " must import at metre scale.");
                    foreach (string clip in new[] { "Idle", "Run", "Attack" })
                    {
                        Assert.IsNotNull(animation[clip], name + " lost " + clip);
                        Assert.Greater(animation[clip].length, 0);
                    }
                }
                finally { Object.DestroyImmediate(model); }
            }
        }

        [UnitySetUp]
        public IEnumerator Setup()
        {
            SceneManager.LoadScene("Ashvault");
            yield return null;
            yield return null;
            run = RunManager.Instance;
            run.Player.enabled = false;
        }

        [UnityTest]
        public IEnumerator HeroInspectionPreservesGameStateAndOriginalMaterialMaps()
        {
            var material=Resources.Load<Material>("Hero/Warden");
            Assert.IsNotNull(material);
            Assert.GreaterOrEqual(material.mainTexture.width,2048);
            Assert.IsNotNull(material.GetTexture("_MetallicGlossMap"));
            Assert.IsNotNull(material.GetTexture("_BumpMap"));
            var camera=Camera.main;
            var inspect=camera.GetComponent<HeroView>();
            float scale=Time.timeScale,size=camera.orthographicSize;
            bool playerEnabled=run.Player.enabled;
            var hud=GameObject.Find("HUD");
            Assert.IsNotNull(hud);
            inspect.Toggle();
            yield return null;
            Assert.AreEqual(0,Time.timeScale);
            Assert.IsFalse(run.enabled);
            Assert.IsFalse(run.Player.enabled);
            Assert.IsFalse(hud.activeSelf);
            inspect.Toggle();
            Assert.AreEqual(scale,Time.timeScale);
            Assert.AreEqual(size,camera.orthographicSize);
            Assert.AreEqual(playerEnabled,run.Player.enabled);
            Assert.IsTrue(run.enabled);
            Assert.IsTrue(hud.activeSelf);
        }

        [UnityTest]
        public IEnumerator EntranceWaitsForPlayerAndStartsOnMovement()
        {
            yield return new WaitForSeconds(2.2f);
            Assert.AreEqual(0, run.Enemies.Count, "Reading controls at the entrance must be safe.");
            var controller = run.Player.GetComponent<CharacterController>();
            controller.enabled = false;
            run.Player.transform.position += Vector3.forward * 2;
            controller.enabled = true;
            yield return null;
            yield return null;
            Assert.AreEqual(5, run.Enemies.Count, "Moving must begin the first encounter.");
        }

        [UnityTest]
        public IEnumerator DodgeBlocksDamageThenExpiresAndDeathRestarts()
        {
            Assert.IsTrue(run.Player.TryDodge(Vector3.forward));
            Assert.IsFalse(run.Player.TryDodge(Vector3.forward), "Dodge cooldown must apply.");
            Assert.IsFalse(run.Player.Life.Hit(10));
            Assert.AreEqual(100, run.Player.Life.current);
            yield return new WaitForSeconds(.3f);
            Assert.IsTrue(run.Player.Life.Hit(10));
            Assert.AreEqual(90, run.Player.Life.current);
            run.Player.Life.Hit(1000);
            Assert.IsTrue(run.Finished);
            Assert.IsFalse(run.Won);
            run.Restart();
            yield return null;
            yield return null;
            Assert.IsFalse(RunManager.Instance.Finished);
            Assert.AreEqual(100, RunManager.Instance.Player.Life.current);
        }

        [UnityTest]
        public IEnumerator AttacksRespectRangeDirectionCooldownAndWalls()
        {
            var player = run.Player;
            player.transform.rotation = Quaternion.identity;
            var enemy = ArenaBuilder.Actor("Test enemy", player.transform.position + Vector3.forward * 2, 0).AddComponent<EnemyController>();
            enemy.enabled = false;
            run.Enemies.Add(enemy);
            yield return null;
            Assert.IsTrue(player.TryAttack(0));
            Assert.AreEqual(80, enemy.Life.current);
            Assert.IsFalse(player.TryAttack(0));
            yield return new WaitForSeconds(.35f);
            player.transform.rotation = Quaternion.Euler(0, 180, 0);
            Assert.IsTrue(player.TryAttack(0));
            Assert.AreEqual(80, enemy.Life.current, "Behind the player must miss.");
            yield return new WaitForSeconds(.35f);
            player.transform.rotation = Quaternion.identity;
            var wall = ArenaBuilder.Shape("Test wall", PrimitiveType.Cube, player.transform.position + Vector3.forward + Vector3.up,
                new Vector3(2, 2, .2f), ArenaBuilder.Gold);
            Physics.SyncTransforms();
            Assert.IsTrue(player.TryAttack(0));
            Assert.AreEqual(80, enemy.Life.current, "Attacks must not pass through walls.");
            Object.Destroy(wall);
            yield return new WaitForSeconds(.35f);
            enemy.GetComponent<CharacterController>().enabled = false;
            enemy.transform.position = player.transform.position + Vector3.forward * 6;
            Assert.IsTrue(player.TryAttack(2));
            Assert.AreEqual(80, enemy.Life.current, "Shockwave range must be bounded.");
        }

        [UnityTest]
        public IEnumerator EnemyStrikeStaysSynchronizedWithTelegraphWhenStaggered()
        {
            run.enabled = false;
            var enemy = ArenaBuilder.Actor("Telegraph test", run.Player.transform.position + Vector3.forward * 1.4f, 0).AddComponent<EnemyController>();
            run.Enemies.Add(enemy);
            yield return null;
            yield return new WaitForSeconds(.3f);
            Assert.AreEqual(100, run.Player.Life.current, "The windup must be harmless.");
            enemy.Stagger(Vector3.forward, .3f);
            yield return new WaitForSeconds(.16f);
            Assert.AreEqual(91, run.Player.Life.current, "Hit time must match the visible telegraph despite hit reaction.");
        }

        [UnityTest]
        public IEnumerator LootStrengthensPlayerAndFullRunReachesVictory()
        {
            float damage = run.Player.damage;
            var pickup = new GameObject("Test upgrade").AddComponent<LootPickup>();
            pickup.kind = 0;
            pickup.Collect(run.Player);
            Assert.Greater(run.Player.damage, damage);
            run.Player.Life.invulnerableUntil = Time.time + 1000;
            float oldScale = Time.timeScale;
            Time.timeScale = 15;
            int defeated = 0;
            try
            {
                float deadline = Time.realtimeSinceStartup + 30;
                while (!run.Finished && Time.realtimeSinceStartup < deadline)
                {
                    foreach (var enemy in run.Enemies.ToArray())
                    {
                        Assert.LessOrEqual(run.Enemies.Count, 20);
                        enemy.Life.Hit(100000);
                        defeated++;
                    }
                    if (run.Enemies.Count == 0)
                    {
                        var controller = run.Player.GetComponent<CharacterController>();
                        controller.enabled = false;
                        run.Player.transform.position = new Vector3(0, 0, run.Chamber * 24 + 15);
                        controller.enabled = true;
                    }
                    yield return null;
                }
                Assert.IsTrue(run.Won, "All chamber waves must lead to boss victory.");
                Assert.AreEqual(3, run.Chamber);
                Assert.Greater(defeated, 30);
            }
            finally { Time.timeScale = oldScale; }
        }
    }
}
