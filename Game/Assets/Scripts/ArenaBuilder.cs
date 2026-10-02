using System.Collections.Generic;
using UnityEngine;

namespace Ashvault
{
    public static class ArenaBuilder
    {
        public static Material Gold, Teal, Ember, Heal;
        static Material stone, dark, metal, bone;

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
            stone = Surface(new Color(.24f, .28f, .32f));
            dark = Surface(new Color(.10f, .13f, .17f));
            metal = Surface(new Color(.49f, .54f, .60f));
            bone = Surface(new Color(.72f, .69f, .59f));
            RenderSettings.ambientLight = new Color(.43f, .49f, .58f);
            RenderSettings.fog = true;
            RenderSettings.fogColor = new Color(.06f, .08f, .11f);
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = .009f;
            var sun = new GameObject("Cold skylight").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(.68f, .80f, 1);
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(48, -35, 0);
            var world = new GameObject("Ruined vault").transform;
            for (int room = 0; room < 4; room++)
            {
                float z = room * 24;
                Shape("Chamber foundation", PrimitiveType.Cube, new Vector3(0, -.94f, z), new Vector3(21, 1.4f, 21), dark, world);
                for (int x = -4; x <= 4; x++)
                    for (int y = -4; y <= 4; y++)
                        Shape("Stone slab", PrimitiveType.Cube, new Vector3(x * 2.2f, -.12f, z + y * 2.2f), new Vector3(2.15f, .24f, 2.15f), stone, world);
                Shape("West wall", PrimitiveType.Cube, new Vector3(-10.3f, 1, z), new Vector3(.6f, 2, 21), dark, world);
                Shape("East wall", PrimitiveType.Cube, new Vector3(10.3f, 1, z), new Vector3(.6f, 2, 21), dark, world);
                for (int side = -1; side <= 1; side += 2)
                {
                    for (int end = -1; end <= 1; end += 2)
                    {
                        Shape("Portal wall", PrimitiveType.Cube, new Vector3(side * 6.7f, .75f, z + end * 10.3f), new Vector3(7.1f, 1.5f, .6f), dark, world);
                        Vector3 post = new Vector3(side * 7.5f, 1.1f, z + end * 6.6f);
                        Shape("Broken pillar", PrimitiveType.Cylinder, post, new Vector3(1, 1.1f, 1), stone, world);
                        Shape("Pillar cap", PrimitiveType.Cube, post + Vector3.up * 1.1f, new Vector3(1.2f, .25f, 1.2f), dark, world);
                    }
                    Vector3 brazier = new Vector3(side * 3.6f, .4f, z + 8.7f);
                    Shape("Brazier", PrimitiveType.Cylinder, brazier, new Vector3(.65f, .4f, .65f), metal, world);
                    Shape("Ember", PrimitiveType.Sphere, brazier + Vector3.up * .55f, Vector3.one * .45f, Ember, world, false);
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
                    Shape("Gate bar", PrimitiveType.Cube, new Vector3(i, 1.1f, 0), new Vector3(.14f, 2.2f, .22f), Gold, gate.transform, false);
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
            Material cloth = kind == -1 ? Teal : kind == 1 ? metal : kind == 2 ? Ember : dark;
            var hips = new GameObject("Hips").transform;
            hips.SetParent(visual, false);
            Shape("Torso", PrimitiveType.Capsule, new Vector3(0, 1.1f, 0), new Vector3(.65f, .43f, .42f), cloth, hips, false);
            Shape("Head", PrimitiveType.Sphere, new Vector3(0, 1.78f, 0), new Vector3(.43f, .48f, .43f), kind == -1 ? metal : bone, hips, false);
            Shape("Visor", PrimitiveType.Cube, new Vector3(0, 1.8f, .21f), new Vector3(.3f, .09f, .08f), kind == -1 ? Gold : Ember, hips, false);
            for (int side = -1; side <= 1; side += 2)
            {
                Shape(side == -1 ? "Left leg" : "Right leg", PrimitiveType.Capsule, new Vector3(side * .19f, .43f, 0), new Vector3(.24f, .28f, .25f), dark, hips, false);
                Shape(side == -1 ? "Left arm" : "Right arm", PrimitiveType.Capsule, new Vector3(side * .43f, 1.16f, .05f), new Vector3(.22f, .30f, .23f), cloth, hips, false);
                Shape("Pauldron", PrimitiveType.Sphere, new Vector3(side * .40f, 1.45f, 0), new Vector3(.37f, .26f, .35f), metal, hips, false);
            }
            Shape("Weapon grip", PrimitiveType.Cube, new Vector3(.46f, .98f, .44f), new Vector3(.10f, .10f, .56f), Gold, hips, false);
            Shape(kind == 2 ? "Staff" : "Blade", PrimitiveType.Cube, new Vector3(.46f, 1, .94f), new Vector3(kind == 1 ? .36f : .14f, .10f, .80f), kind == 2 ? Ember : metal, hips, false);
            if (kind == -1) Shape("Shield", PrimitiveType.Cube, new Vector3(-.49f, 1.08f, .18f), new Vector3(.12f, .65f, .50f), Gold, hips, false);
            if (kind == 1) visual.localScale = new Vector3(1.35f, 1.15f, 1.35f);
            if (kind == 3)
            {
                visual.localScale = Vector3.one * 1.75f;
                for (int i = -1; i <= 1; i++)
                    Shape("Broken crown", PrimitiveType.Cube, new Vector3(i * .16f, 2.05f, 0), new Vector3(.10f, .36f, .15f), Gold, hips, false);
            }
            return root;
        }
    }
}
