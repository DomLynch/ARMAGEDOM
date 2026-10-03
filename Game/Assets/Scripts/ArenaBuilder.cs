using UnityEngine;

namespace Ashvault
{
    public static class ArenaBuilder
    {
        public static Material Gold, Teal, Ember, Heal;

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

        public static void Build()
        {
            Gold = Surface(new Color(.85f, .59f, .23f));
            Teal = Surface(new Color(.17f, .60f, .64f));
            Ember = Surface(new Color(.88f, .27f, .12f));
            Heal = Surface(new Color(.4f, .82f, .47f));
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
            RenderSettings.defaultReflectionMode = UnityEngine.Rendering.DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = Resources.Load<Cubemap>("Hero/VaultReflection");
            RenderSettings.reflectionIntensity = .85f;
            QualitySettings.shadowDistance = 70;
            QualitySettings.pixelLightCount = 4;
            QualitySettings.antiAliasing = 4;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.32f, .32f, .34f);
            RenderSettings.ambientEquatorColor = new Color(.22f, .21f, .20f);
            RenderSettings.ambientGroundColor = new Color(.07f, .065f, .055f);
            RenderSettings.fog = true;
            RenderSettings.fogColor = new Color(.16f, .14f, .12f);
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = .009f;
            var world = Object.Instantiate(Resources.Load<GameObject>("London/Area"));
            foreach (var light in world.GetComponentsInChildren<Light>())
                if (light.type == LightType.Directional) { RenderSettings.sun = light; break; }
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
            string path = kind == -1 ? "Vagrant/Player" : kind == 1 || kind == 3 ? "Enemies/Orc" : kind == 2 ? "Enemies/Warlock" : "Enemies/Revenant";
            var asset = Resources.Load<GameObject>(path);
            if (!asset && kind == -1) asset = Resources.Load<GameObject>("Hero/Warden");
            var model = Object.Instantiate(asset, visual, false);
            if (kind == 1 || kind == 3) model.transform.localScale *= kind == 3 ? 1.3f : 1.16f;
            root.AddComponent<ArtMotion>();
            if (kind == -1)
            {
                var rim = new GameObject("Warden lantern").AddComponent<Light>();
                rim.transform.SetParent(root.transform, false);
                rim.transform.localPosition = new Vector3(0, 2.4f, -.8f);
                rim.color = new Color(.83f, .78f, .65f); rim.range = 5; rim.intensity = .9f;
            }
            if(Camera.main) Camera.main.GetComponent<LondonBackdrop>()?.ScaleActor(root.transform);
            return root;
        }
    }
}
