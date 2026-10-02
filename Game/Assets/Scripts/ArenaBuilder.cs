using System.Collections.Generic;
using UnityEngine;

namespace Ashvault
{
    public static class ArenaBuilder
    {
        public static Material Gold, Teal, Ember, Heal;
        static Material stone, floor, dark, metal;

        static Material Surface(Color color)
        {
            var material = new Material(Resources.Load<Material>("AshvaultSurface"));
            material.color = color;
            material.SetFloat("_Glossiness", .15f);
            return material;
        }

        public static GameObject Shape(string name, PrimitiveType type, Vector3 position, Vector3 size,
            Material material, Transform parent = null, bool solid = true)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            go.transform.localScale = size;
            go.GetComponent<Renderer>().sharedMaterial = material;
            if (material == dark && type == PrimitiveType.Cube)
            {
                var tiled = new Material(material);
                tiled.mainTextureScale = new Vector2(Mathf.Max(size.x, size.z) / 3.5f, size.y / 3.5f);
                go.GetComponent<Renderer>().sharedMaterial = tiled;
            }
            var collider = go.GetComponent<Collider>();
            if (!solid) { collider.enabled = false; Object.Destroy(collider); }
            else go.layer = 8;
            return go;
        }

        public static void Build(List<GameObject> gates)
        {
            Gold = Surface(new Color(.85f, .59f, .23f));
            Teal = Surface(new Color(.17f, .60f, .64f));
            Ember = Surface(new Color(.88f, .27f, .12f));
            Heal = Surface(new Color(.4f, .82f, .47f));
            stone = Resources.Load<Material>("Gothic/Materials/Floor");
            dark = Resources.Load<Material>("Gothic/Materials/Wall");
            metal = Surface(new Color(.49f, .54f, .60f));
            floor = new Material(stone);
            floor.mainTextureScale = Vector2.one * 10;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            RenderSettings.defaultReflectionMode = UnityEngine.Rendering.DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = Resources.Load<Cubemap>("Hero/VaultReflection");
            RenderSettings.reflectionIntensity = .85f;
            QualitySettings.shadowDistance = 70;
            QualitySettings.pixelLightCount = 4;
            QualitySettings.antiAliasing = 4;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.30f, .33f, .37f);
            RenderSettings.ambientEquatorColor = new Color(.18f, .19f, .21f);
            RenderSettings.ambientGroundColor = new Color(.07f, .065f, .055f);
            RenderSettings.fog = true;
            RenderSettings.fogColor = new Color(.06f, .08f, .11f);
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = .009f;
            var sun = new GameObject("Cold skylight").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(.79f, .85f, .90f);
            sun.intensity = 1.1f;
            sun.renderMode = LightRenderMode.ForcePixel;
            RenderSettings.sun = sun;
            sun.shadows = LightShadows.Soft;
            sun.shadowBias = .025f;
            sun.shadowNormalBias = .25f;
            sun.shadowStrength = .85f;
            sun.transform.rotation = Quaternion.Euler(48, -35, 0);
            var world = new GameObject("Ruined vault").transform;
            for (int room = 0; room < 4; room++)
            {
                float z = room * 24;
                var ruins = Object.Instantiate(Resources.Load<GameObject>("Gothic/Ruins"), world, false);
                ruins.transform.localPosition = new Vector3(0, 0, z);
                Shape("Chamber foundation", PrimitiveType.Cube, new Vector3(0, -.94f, z), new Vector3(21, 1.4f, 21), dark, world);
                Shape("Weathered flagstones", PrimitiveType.Cube, new Vector3(0, -.12f, z), new Vector3(21, .24f, 21), floor, world);
                Shape("West wall", PrimitiveType.Cube, new Vector3(-10.3f, 1, z), new Vector3(.6f, 2, 21), dark, world);
                Shape("East wall", PrimitiveType.Cube, new Vector3(10.3f, 1, z), new Vector3(.6f, 2, 21), dark, world);
                for (int side = -1; side <= 1; side += 2)
                {
                    for (int end = -1; end <= 1; end += 2)
                    {
                        Shape("Portal wall", PrimitiveType.Cube, new Vector3(side * 6.7f, .75f, z + end * 10.3f), new Vector3(7.1f, 1.5f, .6f), dark, world);
                        Vector3 post = new Vector3(side * 7.5f, 1.1f, z + end * 6.6f);
                        Shape("Pillar collision", PrimitiveType.Cylinder, post, new Vector3(1, 1.1f, 1), stone, world).GetComponent<Renderer>().enabled = false;
                    }
                    Vector3 brazier = new Vector3(side * 3.6f, .4f, z + 8.7f);
                    var light = new GameObject("Warm firelight").AddComponent<Light>();
                    light.transform.position = brazier + Vector3.up * 1.1f;
                    light.type = LightType.Point;
                    light.color = new Color(1, .48f, .19f);
                    light.range = 7;
                    light.intensity = 2.5f;
                }
                if (room == 3) continue;
                Shape("Connecting bridge", PrimitiveType.Cube, new Vector3(0, -.2f, z + 12), new Vector3(6.4f, .4f, 4.2f), stone, world);
                for (int side = -1; side <= 1; side += 2)
                    Shape("Bridge parapet", PrimitiveType.Cube, new Vector3(side * 3.3f, .5f, z + 12), new Vector3(.4f, 1, 4.4f), dark, world);
                var gate = new GameObject("Sealed gate");
                gate.transform.SetParent(world);
                gate.transform.position = new Vector3(0, 0, z + 11);
                for (int i = -3; i <= 3; i++)
                    Shape("Gate bar", PrimitiveType.Cube, new Vector3(i, 1.1f, 0), new Vector3(.085f, 3.5f, .10f), metal, gate.transform, false);
                var block = gate.AddComponent<BoxCollider>();
                block.center = Vector3.up;
                block.size = new Vector3(6.4f, 2, .35f);
                gate.layer = 8;
                gates.Add(gate);
            }
            Shape("Entrance seal", PrimitiveType.Cube, new Vector3(0, 1, -10.3f), new Vector3(6.4f, 2, .6f), dark, world);
            Shape("Throne wall", PrimitiveType.Cube, new Vector3(0, 1.5f, 82.3f), new Vector3(6.4f, 3, .6f), dark, world);
        }

        public static GameObject Actor(string name, Vector3 position, int kind)
        {
            var root = new GameObject(name);
            root.transform.position = position;
            var controller = root.AddComponent<CharacterController>();
            controller.center = Vector3.up * .9f;
            controller.height = 1.8f;
            controller.radius = kind == 3 ? .65f : .4f;
            controller.stepOffset = .25f;
            controller.skinWidth = .04f;
            root.AddComponent<Health>();
            var visual = new GameObject("Visual").transform;
            visual.SetParent(root.transform, false);
            string model = kind == -1 ? "Knight" : kind == 1 ? "Ogre" : kind == 2 ? "Warlock" : kind == 3 ? "Necromancer" : name == "Orc raider" ? "Orc" : "Goblin";
            Object.Instantiate(Resources.Load<GameObject>(kind == -1 ? "Hero/Warden" : "Gothic/" + model), visual, false);
            root.AddComponent<ArtMotion>().headProportion = kind == 0 ? .63f : kind == 1 ? .72f : 1;
            if (kind == -1)
            {
                var rim = new GameObject("Warden lantern").AddComponent<Light>();
                rim.transform.SetParent(root.transform, false);
                rim.transform.localPosition = new Vector3(0, 2.4f, -.8f);
                rim.color = new Color(.83f, .78f, .65f); rim.range = 5; rim.intensity = .9f;
            }
            return root;
        }
    }
}
