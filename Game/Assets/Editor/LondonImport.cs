using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Ashvault.Editor
{
    public static class LondonImport
    {
        const string Art = "Assets/Art/London/";
        const string Layout = "Assets/Resources/London/Area.prefab";
        [Serializable] class Palette { public Surface[] materials; }
        [Serializable] class Surface { public string name, texture; public float[] color; public float metal, smooth; }

        [MenuItem("ARMAGEDOM/Import London kit")]
        public static void Setup()
        {
            Directory.CreateDirectory(Art + "Materials");
            Directory.CreateDirectory("Assets/Resources/London");
            AssetDatabase.Refresh();
            foreach (string path in Directory.GetFiles(Art + "Textures", "*.jpg"))
            {
                var importer = (TextureImporter)AssetImporter.GetAtPath(path);
                importer.maxTextureSize = 1024;
                importer.textureType = path.Contains("Normal") ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.wrapMode = TextureWrapMode.Repeat;
                importer.anisoLevel = 4;
                importer.SaveAndReimport();
            }
            var palette = JsonUtility.FromJson<Palette>(File.ReadAllText("../art/london/materials.json"));
            foreach (var surface in palette.materials)
            {
                string path = Art + "Materials/" + surface.name + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (!material) { material = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(material, path); }
                material.color = new Color(surface.color[0], surface.color[1], surface.color[2]);
                material.SetFloat("_Metallic", surface.metal);
                material.SetFloat("_Glossiness", surface.smooth);
                string prefix = Art + "Textures/" + surface.texture;
                if (surface.texture == "Stone") prefix = "Assets/Resources/Gothic/Textures/Wall";
                if (surface.texture == "Weathered")
                    material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Resources/Gothic/Textures/Weathered.png");
                else if (!string.IsNullOrEmpty(surface.texture))
                {
                    material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(prefix + "Color.jpg");
                    material.SetTexture("_BumpMap", AssetDatabase.LoadAssetAtPath<Texture2D>(prefix + "Normal.jpg"));
                    material.SetFloat("_BumpScale", .55f);
                    material.EnableKeyword("_NORMALMAP");
                }
                if (surface.name == "LampGlass")
                {
                    material.EnableKeyword("_EMISSION");
                    material.SetColor("_EmissionColor", new Color(2.2f, .95f, .2f));
                }
                EditorUtility.SetDirty(material);
            }
            foreach (string path in Directory.GetFiles(Art + "Models", "*.fbx"))
            {
                var importer = (ModelImporter)AssetImporter.GetAtPath(path);
                importer.importAnimation = false;
                importer.animationType = ModelImporterAnimationType.None;
                importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
                foreach (var surface in palette.materials)
                    importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), surface.name),
                        AssetDatabase.LoadAssetAtPath<Material>(Art + "Materials/" + surface.name + ".mat"));
                importer.SaveAndReimport();
            }
            AssetDatabase.SaveAssets();
            if (File.Exists(Layout)) { Debug.Log("LONDON_IMPORT_PASS: kit refreshed; saved layout preserved."); return; }
            var area = new GameObject("Westminster Checkpoint");
            try
            {
                Place(area, "Road", Vector3.zero);
                Collider(area, "Road collision", new Vector3(0, -.13f, 0), new Vector3(21, .26f, 21));
                foreach (int side in new[] { -1, 1 })
                {
                    Collider(area, "Boundary side", new Vector3(side * 10.3f, 1, 0), new Vector3(.6f, 2, 21));
                    Collider(area, "Boundary end", new Vector3(0, 1, side * 10.3f), new Vector3(21, 2, .6f));
                    for (int i = 0; i < 5; i++)
                        Place(area, "Railing", new Vector3(side * 10.2f, 0, -8 + i * 4), 90);
                    for (int i = 0; i < 3; i++)
                    {
                        float z = -7 + i * 7;
                        Place(area, "Lamp", new Vector3(side * 6.7f, 0, z));
                        Light(area, "Gas lantern", new Vector3(side * 6.7f, 2.9f, z), new Color(1, .52f, .2f), 1.6f, 5);
                        Place(area, "Rubble", new Vector3(side * 8, .07f, z + 2), i * 37);
                        Place(area, "Crate", new Vector3(side * 7.4f, .07f, z - 1), i * 24);
                    }
                    Place(area, "Sandbags", new Vector3(side * 6.2f, 0, 8), side * 10);
                    Place(area, "Barrier", new Vector3(side * 7, 0, -4), side * 12);
                    Place(area, "FireDrum", new Vector3(side * 7.5f, 0, 6.6f));
                    Light(area, "Drum firelight", new Vector3(side * 7.5f, 1.25f, 6.6f), new Color(1, .32f, .07f), 2.2f, 6);
                    Place(area, "Barrier", new Vector3(side * 3.7f, 0, 9.9f));
                    Place(area, "Sandbags", new Vector3(side * 2.4f, 0, -10));
                }
                Place(area, "BusWreck", new Vector3(-8.35f, .06f, 1));
                for (int i = 0; i < 4; i++)
                    Place(area, "Facade", new Vector3(-9 + i * 5.7f, 0, 11.7f));
                Place(area, "ClockTower", new Vector3(9, -1, 24));
                var sun = Light(area, "London evening sun", Vector3.zero, new Color(1, .78f, .55f), 1.2f, 0);
                sun.type = LightType.Directional; sun.transform.rotation = Quaternion.Euler(38, -45, 0);
                sun.shadows = LightShadows.Soft; sun.shadowBias = .025f; sun.shadowNormalBias = .25f;
                var fill = Light(area, "Overcast sky", Vector3.zero, new Color(.62f, .69f, .78f), .35f, 0);
                fill.type = LightType.Directional; fill.transform.rotation = Quaternion.Euler(40, 140, 0);
                PrefabUtility.SaveAsPrefabAsset(area, Layout);
            }
            finally { UnityEngine.Object.DestroyImmediate(area); }
            AssetDatabase.SaveAssets();
            Debug.Log("LONDON_IMPORT_PASS: reusable kit, saved layout, colliders and lights.");
        }

        static void Place(GameObject root, string model, Vector3 position, float yaw = 0)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(Art + "Models/" + model + ".fbx");
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            instance.name = model; instance.transform.SetParent(root.transform, false);
            if (model != "Road" && model != "ClockTower" && model != "Rubble")
            {
                // Collision travels with each prop when its prefab instance is moved.
                var mesh = instance.GetComponentInChildren<MeshFilter>();
                var collider = mesh.gameObject.AddComponent<BoxCollider>();
                collider.center = mesh.sharedMesh.bounds.center;
                collider.size = mesh.sharedMesh.bounds.size;
                mesh.gameObject.layer = 8;
            }
            instance.transform.localPosition = position;
            instance.transform.localRotation = Quaternion.Euler(0, yaw, 0) * asset.transform.localRotation;
        }
        static void Collider(GameObject root, string name, Vector3 position, Vector3 size)
        {
            var go = new GameObject(name); go.layer = 8;
            go.transform.SetParent(root.transform, false); go.transform.localPosition = position;
            go.AddComponent<BoxCollider>().size = size;
        }
        static Light Light(GameObject root, string name, Vector3 position, Color color, float intensity, float range)
        {
            var light = new GameObject(name).AddComponent<Light>();
            light.transform.SetParent(root.transform, false); light.transform.localPosition = position;
            light.type = LightType.Point; light.color = color; light.intensity = intensity; light.range = range;
            return light;
        }
    }
}
