using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Ashvault.Editor
{
    public static class BuildPrototype
    {
        [MenuItem("Ashvault/Create playable scene")]
        public static void Setup()
        {
            Directory.CreateDirectory("Assets/Resources");
            EnsureMaterial("AshvaultSurface", "Standard");
            EnsureMaterial("AshvaultLine", "Sprites/Default");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Ashvault run").AddComponent<RunManager>();
            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/Ashvault.unity");
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Ashvault.unity", true) };
            PlayerSettings.companyName = "Local Prototypes";
            PlayerSettings.productName = "Ashvault";
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = false;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            AssetDatabase.SaveAssets();
            Debug.Log("ASHVAULT_SETUP_PASS: scene, input-system assembly and desktop settings ready.");
        }

        static void EnsureMaterial(string name, string shader)
        {
            string path = "Assets/Resources/" + name + ".mat";
            if (!AssetDatabase.LoadAssetAtPath<Material>(path))
                AssetDatabase.CreateAsset(new Material(Shader.Find(shader)), path);
        }

        [MenuItem("Ashvault/Build Mac demo")]
        public static void BuildMac()
        {
            Directory.CreateDirectory("../Builds");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { "Assets/Scenes/Ashvault.unity" },
                locationPathName = "../Builds/Ashvault.app",
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.Development
            });
            if (report.summary.result != BuildResult.Succeeded) throw new Exception("Mac build failed: " + report.summary.result);
            Debug.Log("ASHVAULT_BUILD_PASS: " + report.summary.totalSize + " bytes");
        }
    }
}
