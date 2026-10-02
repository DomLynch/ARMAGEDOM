using System.IO;
using UnityEditor;
using UnityEngine;

namespace Ashvault.Editor
{
    public static class HeroImport
    {
        const string Root = "Assets/Resources/Hero/";
        [MenuItem("Ashvault/Import original Warden")]
        public static void Setup()
        {
            if (!File.Exists(Root + "Warden.fbx")) return;
            foreach (string path in Directory.GetFiles(Root, "*.png"))
            {
                var importer = (TextureImporter)AssetImporter.GetAtPath(path);
                importer.maxTextureSize = 4096;
                importer.mipmapEnabled = true;
                importer.filterMode = FilterMode.Trilinear;
                importer.anisoLevel = 8;
                importer.textureCompression = TextureImporterCompression.CompressedHQ;
                importer.sRGBTexture = path.Contains("Albedo");
                importer.textureType = path.Contains("Normal") ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.SaveAndReimport();
            }
            var material = AssetDatabase.LoadAssetAtPath<Material>(Root + "Warden.mat");
            if (!material) { material = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(material, Root + "Warden.mat"); }
            material.color = Color.white;
            material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "WardenAlbedo.png");
            material.SetTexture("_MetallicGlossMap", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "WardenMetallicSmoothness.png"));
            material.EnableKeyword("_METALLICGLOSSMAP");
            material.SetFloat("_GlossMapScale", 1);
            material.SetTexture("_BumpMap", AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "WardenNormal.png"));
            if (material.GetTexture("_BumpMap")) material.EnableKeyword("_NORMALMAP");
            EditorUtility.SetDirty(material);
            var steel=AssetDatabase.LoadAssetAtPath<Material>(Root+"WardenSteel.mat");
            if(!steel){steel=new Material(Shader.Find("Standard"));AssetDatabase.CreateAsset(steel,Root+"WardenSteel.mat");}
            const string whitePath=Root+"WeaponWhite.asset";
            var white=AssetDatabase.LoadAssetAtPath<Texture2D>(whitePath);
            if(!white){white=new Texture2D(1,1);white.SetPixel(0,0,Color.white);white.Apply();AssetDatabase.CreateAsset(white,whitePath);}
            steel.color=new Color(.48f,.52f,.57f);steel.mainTexture=white;
            steel.SetFloat("_Metallic",.92f);steel.SetFloat("_Glossiness",.72f);EditorUtility.SetDirty(steel);
            var model = (ModelImporter)AssetImporter.GetAtPath(Root + "Warden.fbx");
            model.animationType = ModelImporterAnimationType.Legacy;
            model.importAnimation = true;
            model.importNormals = ModelImporterNormals.Import;
            model.importTangents = ModelImporterTangents.CalculateMikk;
            model.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            model.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), "Warden"), material);
            model.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material), "WardenSteel"), steel);
            model.SaveAndReimport();
            var take = model.defaultClipAnimations[0];
            float start = take.firstFrame;
            model.clipAnimations = new[] {
                Clip("Idle",take.takeName,start,start+59,true),
                Clip("Run",take.takeName,start+60,start+84,true),
                Clip("Attack",take.takeName,start+85,start+103,false) };
            model.SaveAndReimport();
            CreateReflection();
            PlayerSettings.macRetinaSupport = true;
            AssetDatabase.SaveAssets();
            Debug.Log("ASHVAULT_HERO_IMPORT_PASS");
        }
        static ModelImporterClipAnimation Clip(string name,string take,float first,float last,bool loop) =>
            new ModelImporterClipAnimation { name=name,takeName=take,firstFrame=first,lastFrame=last,loopTime=loop,wrapMode=loop?WrapMode.Loop:WrapMode.Once };

        static void CreateReflection()
        {
            const int size=64;
            var cube=AssetDatabase.LoadAssetAtPath<Cubemap>(Root+"VaultReflection.asset");
            if (!cube) { cube=new Cubemap(size,TextureFormat.RGBAHalf,true); AssetDatabase.CreateAsset(cube,Root+"VaultReflection.asset"); }
            for(int face=0;face<6;face++)
            {
                var pixels=new Color[size*size];
                for(int y=0;y<size;y++) for(int x=0;x<size;x++)
                {
                    float u=(x+.5f)/32-1,v=(y+.5f)/32-1;
                    Vector3 d=face==0?new(1,-v,-u):face==1?new(-1,-v,u):face==2?new(u,1,v):face==3?new(u,-1,-v):face==4?new(u,-v,1):new(-u,-v,-1);
                    d.Normalize();
                    var c=Color.Lerp(new(.035f,.03f,.025f),new(.35f,.43f,.57f),Mathf.Clamp01(d.y*.5f+.5f));
                    c+=new Color(2.4f,2.1f,1.6f)*Mathf.Pow(Mathf.Max(0,Vector3.Dot(d,new Vector3(-.5f,.6f,.3f).normalized)),24);
                    c+=new Color(.45f,.65f,1f)*Mathf.Pow(Mathf.Max(0,Vector3.Dot(d,new Vector3(.6f,.3f,-.7f).normalized)),36);
                    pixels[y*size+x]=c;
                }
                cube.SetPixels(pixels,(CubemapFace)face);
            }
            cube.Apply(true); EditorUtility.SetDirty(cube);
        }
    }
}
