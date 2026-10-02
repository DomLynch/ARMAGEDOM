using System.IO;
using UnityEditor;
using UnityEngine;

namespace Ashvault.Editor
{
    public static class GothicImport
    {
        [MenuItem("Ashvault/Import gothic art")]
        public static void Setup()
        {
            const string folder = "Assets/Resources/Gothic/";
            Directory.CreateDirectory(folder + "Materials");
            foreach (string path in Directory.GetFiles(folder + "Textures"))
            {
                if (AssetImporter.GetAtPath(path) is not TextureImporter importer) continue;
                importer.maxTextureSize = 1024;
                importer.textureType = path.Contains("Normal") ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.SaveAndReimport();
            }
            string[] names = { "Steel", "Edge", "Iron", "Leather", "Cloth", "Crimson", "Bone", "Skin", "OgreSkin", "Black", "Stone", "Ember", "Occult" };
            Color[] colors = { new(.37f,.40f,.42f), new(.55f,.50f,.39f), new(.15f,.17f,.16f), new(.22f,.13f,.08f), new(.18f,.21f,.18f), new(.30f,.065f,.045f), new(.67f,.59f,.43f), new(.38f,.40f,.25f), new(.49f,.38f,.28f), new(.055f,.06f,.05f), new(.55f,.54f,.48f), new(.8f,.27f,.03f), new(.22f,.50f,.39f) };
            for (int i = 0; i < names.Length; i++)
            {
                string path = folder + "Materials/" + names[i] + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (!material) { material = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(material, path); }
                material.color = colors[i];
                material.SetFloat("_Metallic", i < 3 ? .75f : 0);
                material.SetFloat("_Glossiness", i < 3 ? .40f : .12f);
                material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(folder + "Textures/Weathered.png");
                if (names[i] == "Stone") ApplyStone(material, "Wall");
                if (i >= 11) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", colors[i] * .7f); }
                EditorUtility.SetDirty(material);
            }
            foreach (string model in Directory.GetFiles(folder, "*.fbx"))
            {
                var importer = (ModelImporter)AssetImporter.GetAtPath(model);
                string actor = Path.GetFileNameWithoutExtension(model);
                bool character = actor != "Ruins";
                importer.importAnimation = character;
                importer.animationType = character ? ModelImporterAnimationType.Legacy : ModelImporterAnimationType.None;
                importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
                foreach (string name in names)
                    importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), name), AssetDatabase.LoadAssetAtPath<Material>(folder + "Materials/" + name + ".mat"));
                foreach (string texture in Directory.GetFiles(folder + "Textures", actor + "_*.png"))
                {
                    string name = Path.GetFileNameWithoutExtension(texture);
                    string path = folder + "Materials/" + name + ".mat";
                    var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                    if (!material) { material = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(material, path); }
                    material.color = actor == "Goblin" ? new Color(.43f,.45f,.32f) : actor == "Orc" ? new Color(.42f,.39f,.30f) : actor == "Ogre" ? new Color(.48f,.38f,.29f) : actor == "Warlock" ? new Color(.30f,.14f,.105f) : actor == "Necromancer" ? new Color(.55f,.49f,.38f) : new Color(.44f,.46f,.47f);
                    if (name.Contains("Cape")) material.color = new Color(.24f,.07f,.045f);
                    if (name.Contains("head_bald")) material.color = new Color(.53f,.43f,.34f);
                    material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(texture);
                    material.SetFloat("_Metallic", name.Contains("plate") || name.Contains("sword") || name.Contains("shield") ? .65f : 0);
                    material.SetFloat("_Glossiness", actor == "Knight" ? .32f : .12f);
                    EditorUtility.SetDirty(material);
                    importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), name), material);
                }
                importer.SaveAndReimport();
                if (character)
                {
                    var take = importer.defaultClipAnimations[0];
                    float start = take.firstFrame;
                    int run = actor == "Goblin" ? 12 : 4;
                    int attack = actor == "Goblin" || actor == "Orc" || actor == "Ogre" ? 20 : actor == "Necromancer" ? 16 : 12;
                    importer.clipAnimations = new[] { Clip("Idle", take.takeName, start, start + 3, true), Clip("Run", take.takeName, start + run, start + run + 7, true), Clip("Attack", take.takeName, start + attack, start + attack + 3, false) };
                    importer.SaveAndReimport();
                }
            }
            foreach (string name in new[] { "Floor", "Wall" })
            {
                string path = folder + "Materials/" + name + ".mat";
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (!mat) { mat = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(mat, path); }
                mat.color = name == "Floor" ? new Color(.68f,.67f,.60f) : new Color(.49f,.49f,.44f);
                ApplyStone(mat, name);
                EditorUtility.SetDirty(mat);
            }
            AssetDatabase.SaveAssets();
            Debug.Log("ASHVAULT_GOTHIC_IMPORT_PASS: gothic FBX models and explicit Standard materials.");
        }

        static ModelImporterClipAnimation Clip(string name, string take, float first, float last, bool loop) =>
            new ModelImporterClipAnimation { name = name, takeName = take, firstFrame = first, lastFrame = last, loopTime = loop, wrapMode = loop ? WrapMode.Loop : WrapMode.Once };

        static void ApplyStone(Material material, string prefix)
        {
            const string path = "Assets/Resources/Gothic/Textures/";
            material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(path + prefix + "Color.jpg");
            material.SetTexture("_BumpMap", AssetDatabase.LoadAssetAtPath<Texture2D>(path + prefix + "Normal.jpg"));
            material.EnableKeyword("_NORMALMAP");
            material.SetFloat("_BumpScale", .8f);
            material.SetFloat("_Glossiness", .16f);
        }
    }
}
