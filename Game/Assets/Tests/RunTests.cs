using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace Ashvault.Tests
{
    // Isolate synthetic input from desktop focus and physical mouse/keyboard events.
    public class RunTests
    {
        RunManager run;
        readonly System.Collections.Generic.List<InputDevice> desktopDevices = new System.Collections.Generic.List<InputDevice>();
        InputSettings.BackgroundBehavior background;
        InputSettings.EditorInputBehaviorInPlayMode editorInput;

        [SetUp]
        public void IsolateDesktopInput()
        {
            background = InputSystem.settings.backgroundBehavior;
            editorInput = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            foreach (var device in InputSystem.devices)
                if (device.enabled) desktopDevices.Add(device);
            foreach (var device in desktopDevices) InputSystem.DisableDevice(device);
        }

        [TearDown]
        public void RestoreDesktopInput()
        {
            foreach (var device in desktopDevices)
                if (device.added) InputSystem.EnableDevice(device);
            desktopDevices.Clear();
            InputSystem.settings.backgroundBehavior = background;
            InputSystem.settings.editorInputBehaviorInPlayMode = editorInput;
        }

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
            foreach (string name in new[] { "Knight", "Revenant", "Orc", "Warlock" })
            {
                var asset = Resources.Load<GameObject>(name == "Knight" ? "Hero/Warden" : "Enemies/" + name);
                Assert.IsNotNull(asset, name);
                if (name != "Knight")
                {
                    var surface = Resources.Load<Material>("Enemies/" + name);
                    Assert.AreEqual(4096, surface.mainTexture.width);
                    Assert.IsNotNull(surface.GetTexture("_MetallicGlossMap"));
                    Assert.IsNotNull(surface.GetTexture("_BumpMap"));
                }
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
                        // Check real deformed geometry for every delivered character.
                        {
                            foreach (float phase in new[] { .25f, .5f, .75f })
                            {
                                animation[clip].clip.SampleAnimation(model, animation[clip].length * phase);
                                foreach (var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>())
                                {
                                    var baked = new Mesh();
                                    animation["Idle"].clip.SampleAnimation(model, 0);
                                    skin.BakeMesh(baked); var rest = baked.vertices;
                                    animation[clip].clip.SampleAnimation(model, animation[clip].length * phase);
                                    skin.BakeMesh(baked); var posed = baked.vertices;
                                    var indices = baked.triangles;
                                    float maximumStretch = 0;
                                    for (int t = 0; t < indices.Length; t += 3)
                                    for (int edge = 0; edge < 3; edge++)
                                    {
                                        int a = indices[t + edge], b = indices[t + (edge + 1) % 3];
                                        float stretch = Vector3.Distance(posed[a], posed[b]) - Vector3.Distance(rest[a], rest[b]);
                                        maximumStretch = Mathf.Max(maximumStretch, stretch);
                                    }
                                    Assert.Less(maximumStretch, .2f, name + " " + clip + " must not stretch fingers/arm triangles into long spikes.");
                                    Object.DestroyImmediate(baked);
                                }
                            }
                        }
                    }
                }
                finally { Object.DestroyImmediate(model); }
            }
        }

        [UnitySetUp]
        public IEnumerator LoadArena()
        {
            SceneManager.LoadScene("Ashvault");
            yield return null;
            yield return null;
            run = RunManager.Instance;
            run.Player.enabled = false;
        }

        [UnityTest]
        public IEnumerator EnemiesTurnGraduallyBeforeStriking()
        {
            run.enabled = false;
            var actor = ArenaBuilder.Actor("Turning revenant", new Vector3(0, .04f, -4), 0);
            var enemy = actor.AddComponent<EnemyController>();
            run.Player.transform.position = new Vector3(0, .04f, -6);
            int rate = Time.captureFramerate; Time.captureFramerate = 30;
            try
            {
                float before = run.Player.Life.current;
                yield return null;
                Assert.Less(Quaternion.Angle(Quaternion.identity, actor.transform.rotation), 20,
                    "An enemy must turn with weight, not snap 180 degrees in one frame.");
                yield return new WaitForSeconds(.2f);
                Assert.AreEqual(before, run.Player.Life.current, "A turning enemy cannot hit behind itself.");
                yield return new WaitForSeconds(1.1f);
                Assert.Greater(Vector3.Dot(actor.transform.forward, Vector3.back), .95f);
                Assert.Less(run.Player.Life.current, before, "The enemy must finish turning and attack.");
            }
            finally { Time.captureFramerate = rate; Object.DestroyImmediate(actor); }
        }

        [UnityTest]
        public IEnumerator MobSolesClearFloorDuringTravelTurnsAndStops()
        {
            run.enabled = false;
            int rate = Time.captureFramerate; Time.captureFramerate = 30;
            try
            {
                foreach (int kind in new[] { 0, 1, 2, 3 })
                {
                    var actor = ArenaBuilder.Actor("Foot contact review", new Vector3(0, .04f, -4), kind);
                    var enemy = actor.AddComponent<EnemyController>(); enemy.kind = kind; enemy.enabled = false;
                    actor.GetComponent<CharacterController>().enabled = false;
                    var skin = System.Array.Find(actor.GetComponentsInChildren<SkinnedMeshRenderer>(), s => s.name.EndsWith("armour"));
                    var staff = kind == 2 ? System.Array.Find(actor.GetComponentsInChildren<SkinnedMeshRenderer>(), s => s.name == "Ritual staff") : null;
                    if (kind == 2) Assert.IsNotNull(staff);
                    Assert.IsNotNull(skin);
                    var indices = new System.Collections.Generic.List<int>[2];
                    for (int side = 0; side < 2; side++)
                    {
                        indices[side] = new System.Collections.Generic.List<int>();
                        int foot = System.Array.FindIndex(skin.bones, t => t.name == "Foot." + (side == 0 ? "L" : "R"));
                        var weights = skin.sharedMesh.boneWeights;
                        for (int i = 0; i < weights.Length; i++)
                            if (weights[i].boneIndex0 == foot && weights[i].weight0 > .6f) indices[side].Add(i);
                        Assert.Greater(indices[side].Count, 50);
                    }
                    var mesh = new Mesh(); int contacts = 0, stablePairs = 0, retreatPairs = 0; float lift = 0;
                    var animation = actor.GetComponentInChildren<Animation>();
                    int plantedVertex = -1; Vector3 plantedPoint = Vector3.zero;
                    try
                    {
                        yield return null;
                        for (int frame = 0; frame < (kind == 2 ? 180 : 90); frame++)
                        {
                            bool moving = frame < 70 || frame >= 90 && frame < 160;
                            if (moving)
                            {
                                actor.transform.rotation = Quaternion.Euler(0, frame < 35 ? 0 : Mathf.Min(60, (frame - 35) * 6), 0);
                                actor.transform.position += actor.transform.forward * ((frame >= 90 ? -2 : kind == 1 ? 1.65f : kind == 3 ? 2.1f : 2.8f) / 30);
                            }
                            yield return null;
                            skin.BakeMesh(mesh, false); var vertices = mesh.vertices;
                            float lowest = float.PositiveInfinity;
                            foreach (var footIndices in indices)
                            {
                                float sole = float.PositiveInfinity;
                                foreach (int index in footIndices) sole = Mathf.Min(sole, skin.transform.TransformPoint(vertices[index]).y);
                                Assert.Greater(sole, -.025f, $"Mob {kind} sole penetrates floor, frame {frame}");
                                lowest = Mathf.Min(lowest, sole); lift = Mathf.Max(lift, sole);
                            }
                            if (lowest < .065f) contacts++;
                            if (!moving && frame % 90 > 80) Assert.Less(lowest, .065f, "Stopped mobs must settle onto the floor.");
                            float phase = Mathf.Repeat(animation["Run"].normalizedTime, 1);
                            bool stance = moving && frame > 10 && (kind == 1 || kind == 3 ? phase > .1f && phase < .25f : phase > .07f && phase < .16f);
                            if (!stance) plantedVertex = -1;
                            else if (plantedVertex < 0)
                            {
                                plantedVertex = indices[0][0];
                                foreach (int index in indices[0])
                                    if (vertices[index].y < vertices[plantedVertex].y) plantedVertex = index;
                                plantedPoint = skin.transform.TransformPoint(vertices[plantedVertex]);
                            }
                            else
                            {
                                Vector3 point = skin.transform.TransformPoint(vertices[plantedVertex]);
                                Assert.Less(Vector3.ProjectOnPlane(point - plantedPoint, Vector3.up).magnitude, .035f,
                                    $"Mob {kind} planted sole skates, frame {frame}");
                                plantedPoint = point; stablePairs++;
                                if (frame >= 90) retreatPairs++;
                            }
                            if (staff)
                            {
                                staff.BakeMesh(mesh, false); float bottom = float.PositiveInfinity;
                                foreach (var vertex in mesh.vertices) bottom = Mathf.Min(bottom, staff.transform.TransformPoint(vertex).y);
                                Assert.Greater(bottom, -.025f, "The carried staff must clear the floor during movement and blends.");
                            }
                        }
                        Assert.Greater(contacts, 20, "The gait must repeatedly contact the floor.");
                        Assert.Greater(lift, kind == 1 || kind == 3 ? .07f : .15f, "Walking/running swing soles must lift rather than slide flat.");
                        Assert.Greater(stablePairs, 1, "The test must observe consecutive planted-foot samples.");
                        if (kind == 2) Assert.Greater(retreatPairs, 1, "Warlock retreat must exercise planted-foot samples too.");
                    }
                    finally { Object.DestroyImmediate(mesh); Object.DestroyImmediate(actor); }
                }
            }
            finally { Time.captureFramerate = rate; }
        }

        [UnityTest]
        public IEnumerator AuthoredHeroBootsClearFloorDuringTravelAndTurns()
        {
            run.enabled = false;
            var player = run.Player;
            var controller = player.GetComponent<CharacterController>();
            controller.enabled = false;
            player.transform.position = new Vector3(0, .04f, -4);
            var skin = System.Array.Find(player.GetComponentsInChildren<SkinnedMeshRenderer>(), s => s.name == "Warden armour");
            Assert.IsNotNull(skin);
            var weights = skin.sharedMesh.boneWeights;
            var feet = new System.Collections.Generic.HashSet<int>();
            for (int i = 0; i < skin.bones.Length; i++) if (skin.bones[i].name.StartsWith("Foot.")) feet.Add(i);
            var indices = new System.Collections.Generic.List<int>();
            for (int i = 0; i < weights.Length; i++)
            {
                var w = weights[i];
                if (feet.Contains(w.boneIndex0) && w.weight0 > .6f) indices.Add(i);
            }
            Assert.Greater(indices.Count, 100);
            var mesh = new Mesh(); int contacts = 0; float maximumLift = 0;
            int oldRate = Time.captureFramerate; Time.captureFramerate = 30;
            try
            {
                yield return null;
                for (int frame = 0; frame < 60; frame++)
                {
                    player.transform.rotation = Quaternion.Euler(0, frame < 30 ? 0 : Mathf.Min(60, (frame - 30) * 6), 0);
                    player.transform.position += player.transform.forward * (.14f);
                    yield return null;
                    skin.BakeMesh(mesh, false);
                    var vertices = mesh.vertices;
                    float low = float.PositiveInfinity, high = float.NegativeInfinity;
                    foreach (int index in indices)
                    {
                        float y = skin.transform.TransformPoint(vertices[index]).y;
                        low = Mathf.Min(low, y); high = Mathf.Max(high, y);
                    }
                    Assert.Greater(low, -.025f, $"Boot sole penetrates floor at frame {frame}");
                    if (low < .065f) contacts++;
                    maximumLift = Mathf.Max(maximumLift, high);
                }
                Assert.Greater(contacts, 8, "Running must repeatedly contact the floor.");
                Assert.Greater(maximumLift, .3f, "The swing boot must lift, not shuffle flat.");
            }
            finally { Time.captureFramerate = oldRate; Object.DestroyImmediate(mesh); controller.enabled = true; }
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
        public IEnumerator KeyboardTravelTurnsHeroAndPreservesDiagonalSpeed()
        {
            run.enabled = false;
            var oldKeyboard=Keyboard.current; var oldMouse=Mouse.current;
            var keyboard=InputSystem.AddDevice<Keyboard>(); var mouse=InputSystem.AddDevice<Mouse>();
            try
            {
                var player=run.Player; player.enabled=true;
                InputSystem.QueueStateEvent(mouse,new MouseState { position=new Vector2(1,1) });
                var camera=Camera.main;
                var forward=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;
                var right=camera.transform.right;
                Key[][] keys={new[]{Key.W},new[]{Key.D},new[]{Key.S},new[]{Key.A},new[]{Key.W,Key.D}};
                Vector3[] directions={forward,right,-forward,-right,(forward+right).normalized};
                for(int i=0;i<keys.Length;i++)
                {
                    Vector3 start=player.transform.position; float began=Time.time;
                    InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys[i]));
                    yield return new WaitForSeconds(.3f);
                    Vector3 travelled=Vector3.ProjectOnPlane(player.transform.position-start,Vector3.up);
                    Assert.Less(Vector3.Angle(player.transform.forward,directions[i]),5,"Walking must turn the whole hero, independent of cursor.");
                    Assert.Greater(Vector3.Dot(travelled,directions[i]),.5f,$"Direction {i}, start {start}, travel {travelled}");
                    Assert.LessOrEqual(travelled.magnitude/(Time.time-began),player.speed*1.08f,"Diagonal speed must stay bounded.");
                }
                InputSystem.QueueStateEvent(keyboard,new KeyboardState());
                yield return null; yield return null;
                Quaternion facing=player.transform.rotation;
                yield return new WaitForSeconds(.1f);
                Assert.Less(Quaternion.Angle(facing,player.transform.rotation),.1f,"Idle must keep the last heading.");
            }
            finally
            {
                run.Player.enabled=false; InputSystem.RemoveDevice(keyboard); InputSystem.RemoveDevice(mouse);
                oldKeyboard?.MakeCurrent(); oldMouse?.MakeCurrent();
            }
        }

        [UnityTest]
        public IEnumerator LeftClickSlashesWithoutMovingAndFacesCursor()
        {
            run.enabled = false;
            var keyboard = InputSystem.AddDevice<Keyboard>(); var mouse = InputSystem.AddDevice<Mouse>();
            try
            {
                var player = run.Player; player.enabled = true;
                // Let the capsule settle onto the newly loaded floor before measuring input travel.
                Physics.SyncTransforms();
                yield return new WaitForSeconds(.1f);
                Vector3 start = player.transform.position;
                Vector3 aim = Vector3.left;
                Vector2 screen = Camera.main.WorldToScreenPoint(start + aim * 3);
                InputSystem.QueueStateEvent(mouse, new MouseState { position = screen }.WithButton(MouseButton.Left));
                InputSystem.QueueStateEvent(mouse, new MouseState { position = screen });
                yield return null; yield return null;
                Assert.Greater(player.attackReady, Time.time, "A rapid trackpad click must start a slash.");
                Assert.Less(Vector3.Angle(player.transform.forward, aim), 5);
                yield return new WaitForSeconds(.8f);
                Assert.Less(Vector3.Distance(start, player.transform.position), .03f,
                    "Clicking ground must never create travel. Start " + start + ", end " + player.transform.position);
            }
            finally
            {
                run.Player.enabled = false; InputSystem.RemoveDevice(keyboard); InputSystem.RemoveDevice(mouse);
            }
        }

        [UnityTest]
        public IEnumerator HeldSlashKillsNearbyEnemyWithoutApproaching()
        {
            run.enabled = false;
            var keyboard = InputSystem.AddDevice<Keyboard>(); var mouse = InputSystem.AddDevice<Mouse>();
            try
            {
                var player = run.Player; player.enabled = true;
                Physics.SyncTransforms();
                yield return new WaitForSeconds(.1f);
                Vector3 start = player.transform.position;
                var enemy = ArenaBuilder.Actor("Slash target", start + Vector3.forward * 2, 0).AddComponent<EnemyController>();
                enemy.enabled = false; enemy.Life.current = 40; run.Enemies.Add(enemy);
                yield return null;
                Vector2 screen = Camera.main.WorldToScreenPoint(enemy.transform.position);
                InputSystem.QueueStateEvent(mouse, new MouseState { position = screen }.WithButton(MouseButton.Left));
                yield return new WaitForSeconds(1.3f);
                Assert.AreEqual(0, run.Enemies.Count, "Held slash must repeat and kill a nearby enemy.");
                Assert.Less(Vector3.Distance(start, player.transform.position), .03f);
                Assert.IsFalse(run.Finished);
            }
            finally
            {
                run.Player.enabled = false; InputSystem.RemoveDevice(keyboard); InputSystem.RemoveDevice(mouse);
            }
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
            foreach (int kind in new[] { 0, 1, 2 })
            {
                var enemy = run.Enemies.Find(e => e.kind == kind);
                Assert.IsNotNull(enemy, "First wave must show each distinct enemy design.");
                string model = kind == 0 ? "Revenant" : kind == 1 ? "Orc" : "Warlock";
                Assert.IsNotNull(enemy.transform.Find("Visual/" + model + "(Clone)"), model + " must use its own imported art.");
            }
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
            Assert.IsNull(GameObject.Find("Attack telegraph"), "Hero slash must not draw a yellow cone.");
            Assert.AreEqual(100, enemy.Life.current, "Wind-up must not deal damage.");
            Assert.IsFalse(player.TryAttack(0));
            yield return new WaitForSeconds(.20f);
            Assert.AreEqual(80, enemy.Life.current, "Damage must land during the strike.");
            yield return new WaitForSeconds(.25f);
            player.transform.rotation = Quaternion.Euler(0, 180, 0);
            Assert.IsTrue(player.TryAttack(0));
            yield return new WaitForSeconds(.45f);
            Assert.AreEqual(80, enemy.Life.current, "Behind the player must miss.");
            player.transform.rotation = Quaternion.identity;
            var wall = ArenaBuilder.Shape("Test wall", PrimitiveType.Cube, player.transform.position + Vector3.forward + Vector3.up,
                new Vector3(2, 2, .2f), ArenaBuilder.Gold);
            Physics.SyncTransforms();
            Assert.IsTrue(player.TryAttack(0));
            yield return new WaitForSeconds(.45f);
            Assert.AreEqual(80, enemy.Life.current, "Attacks must not pass through walls.");
            Object.Destroy(wall);
            enemy.GetComponent<CharacterController>().enabled = false;
            enemy.transform.position = player.transform.position + Vector3.forward * 6;
            Assert.IsTrue(player.TryAttack(2));
            yield return new WaitForSeconds(.25f);
            Assert.AreEqual(80, enemy.Life.current, "Shockwave range must be bounded.");
        }

        [UnityTest]
        public IEnumerator DodgeCancelsPendingStrike()
        {
            run.enabled = false;
            var player = run.Player;
            player.transform.rotation = Quaternion.identity;
            var enemy = ArenaBuilder.Actor("Cancel target", player.transform.position + Vector3.forward * 2, 0).AddComponent<EnemyController>();
            enemy.enabled = false; run.Enemies.Add(enemy);
            yield return null;
            Assert.IsTrue(player.TryAttack(1));
            Assert.IsTrue(player.TryDodge(Vector3.back));
            yield return new WaitForSeconds(.30f);
            Assert.AreEqual(100, enemy.Life.current, "A cancelled wind-up must never deal a ghost hit.");
        }

        [UnityTest]
        public IEnumerator EnemyStrikeKeepsWindupTimingWithoutFloorConesWhenStaggered()
        {
            run.enabled = false;
            var enemy = ArenaBuilder.Actor("Windup test", run.Player.transform.position + Vector3.forward * 1.4f, 0).AddComponent<EnemyController>();
            // Measure the strike wind-up after facing, separately from gradual turning.
            enemy.transform.rotation = Quaternion.Euler(0, 180, 0);
            run.Enemies.Add(enemy);
            yield return null;
            yield return new WaitForSeconds(.3f);
            Assert.AreEqual(100, run.Player.Life.current, "The windup must be harmless.");
            Assert.IsNull(GameObject.Find("Attack telegraph"), "Enemy wind-up must not draw floor cones.");
            enemy.Stagger(Vector3.forward, .3f);
            yield return new WaitForSeconds(.16f);
            Assert.AreEqual(91, run.Player.Life.current, "Hit time must match the animated wind-up despite hit reaction.");
            Assert.IsNull(GameObject.Find("Attack telegraph"), "Enemy impact must not draw floor outlines.");
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
                        run.Player.transform.position = new Vector3(0, 0, -4);
                        controller.enabled = true;
                    }
                    yield return null;
                }
                Assert.IsTrue(run.Won, "All three arena waves must lead to captain victory.");
                Assert.AreEqual(3, run.Wave);
                Assert.AreEqual(12, defeated);
                Assert.IsNull(GameObject.Find("Connecting bridge"));
                Assert.IsNotNull(GameObject.Find(Resources.Load<GameObject>("London/Area").name + "(Clone)"), "Victory must keep the London arena loaded.");
            }
            finally { Time.timeScale = oldScale; }
        }
    }
}
