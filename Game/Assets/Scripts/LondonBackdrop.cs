using System;
using System.IO;
using UnityEngine;

namespace Ashvault
{
    // A fixed photographic view with real ground physics and authored depth silhouettes.
    public sealed class LondonBackdrop : MonoBehaviour
    {
        [Serializable] public class Mask { public string name; public Vector2 foot; public Vector2[] points; }
        [Serializable] public class Layout
        {
            public int version;
            public float height, distance, targetZ, fieldOfView, exposure, keyIntensity;
            public float zoom=1, characterScale=1, followSeconds=.45f, fillIntensity=.35f;
            public Vector2[] road;
            public Mask[] masks;
        }
        public string ContentDirectory { get; private set; }
        public int Revision { get; private set; }
        public Layout Current { get; private set; }
        Camera view;
        GameObject geometry;
        Material backdrop, depth, contact;
        Texture2D picture;
        Light key, fill;
        Matrix4x4 calibratedProjection;
        Vector2 cropCenter=new Vector2(.5f,.5f), cropVelocity;
        DateTime lastLayout, lastImage;
        string rejectedStamp;
        float nextPoll;
        const float Aspect = 1672f / 941;

        public void Initialize(Camera camera)
        {
            view = camera;
            ContentDirectory = Path.Combine(Application.streamingAssetsPath, "London");
            // Development builds beside this checkout use the same saved files as the Editor.
            if (Debug.isDebugBuild && !Application.isEditor)
                for (var dir = new DirectoryInfo(Application.dataPath); dir != null; dir = dir.Parent)
                {
                    string candidate = Path.Combine(dir.FullName, "Game/Assets/StreamingAssets/London");
                    if (File.Exists(Path.Combine(candidate, "layout.json"))) { ContentDirectory = candidate; break; }
                }
            backdrop = new Material(Resources.Load<Shader>("London/Backdrop"));
            depth = new Material(Resources.Load<Shader>("London/Occlusion"));
            contact = new Material(Resources.Load<Shader>("London/Contact"));
            var old = GameObject.Find(Resources.Load<GameObject>("London/Area").name + "(Clone)");
            foreach (var renderer in old.GetComponentsInChildren<Renderer>()) renderer.enabled = false;
            foreach (var collider in old.GetComponentsInChildren<Collider>()) collider.enabled = false;
            foreach (var light in old.GetComponentsInChildren<Light>()) light.enabled = false;
            key = new GameObject("London sunset").AddComponent<Light>();
            key.transform.SetParent(transform); key.type = LightType.Directional;
            key.transform.rotation = Quaternion.Euler(38, -55, 0);
            key.color = new Color(1, .76f, .53f);
            fill=new GameObject("London character fill").AddComponent<Light>();
            fill.transform.SetParent(transform);fill.type=LightType.Directional;
            fill.transform.rotation=Quaternion.Euler(25,155,0);fill.color=new Color(.8f,.88f,1);
            RenderSettings.sun = key; RenderSettings.fog = false;
            RenderSettings.ambientSkyColor = new Color(.37f, .39f, .43f);
            RenderSettings.ambientEquatorColor = new Color(.24f, .23f, .23f);
            RenderSettings.reflectionIntensity = .35f;
            Poll();
            if (Current == null || !picture) throw new InvalidOperationException("London content could not load.");
            Debug.Log("LONDON_CONTENT: " + ContentDirectory);
        }

        void Update()
        {
            if (GetComponent<HeroView>().Inspecting || Time.unscaledTime < nextPoll) return;
            nextPoll = Time.unscaledTime + 1;
            Poll();
        }
        void Poll()
        {
            Texture2D pending=null; string stamp=null;
            try
            {
                string json=Path.Combine(ContentDirectory,"layout.json"), png=Path.Combine(ContentDirectory,"backdrop.png");
                var jsonTime=File.GetLastWriteTimeUtc(json); var pngTime=File.GetLastWriteTimeUtc(png);
                stamp=jsonTime.Ticks+":"+pngTime.Ticks;
                if(stamp==rejectedStamp || (jsonTime==lastLayout && pngTime==lastImage)) return;
                if(pngTime!=lastImage)
                {
                    byte[] bytes=File.ReadAllBytes(png);
                    pending=new Texture2D(2,2,TextureFormat.RGB24,false);
                    if(!pending.LoadImage(bytes) || Mathf.Abs((float)pending.width/pending.height-Aspect)>.02f)
                        throw new InvalidDataException("Backdrop must be a valid image with the original aspect ratio.");
                    pending.wrapMode=TextureWrapMode.Clamp;
                }
                if(jsonTime!=lastLayout && !TryApply(File.ReadAllText(json),out string error))
                    throw new InvalidDataException(error);
                if(pending)
                {
                    backdrop.mainTexture=pending; if(picture)Destroy(picture); picture=pending; pending=null;
                }
                lastLayout=jsonTime; lastImage=pngTime; rejectedStamp=null;
            }
            catch(Exception e) { rejectedStamp=stamp; Debug.LogWarning("LONDON_REJECTED: "+e.Message); }
            finally { if(pending)Destroy(pending); }
        }
        static bool Range(float value, float min, float max) => !float.IsNaN(value) && !float.IsInfinity(value) && value >= min && value <= max;
        static float Cross(Vector2 a, Vector2 b) => a.x*b.y-a.y*b.x;
        static bool Polygon(Vector2[] points, bool convex=false)
        {
            if (points == null || points.Length < 3 || points.Length > 64) return false;
            float area=0, sign=0;
            for(int i=0;i<points.Length;i++)
            {
                Vector2 a=points[i], b=points[(i+1)%points.Length], c=points[(i+2)%points.Length];
                if (!Range(a.x, 0, 1) || !Range(a.y, .2f, 1) || (b-a).sqrMagnitude<.000001f) return false;
                area+=Cross(a,b); float turn=Cross(b-a,c-b);
                if(convex && (Mathf.Abs(turn)<.000001f || (sign!=0 && turn*sign<0))) return false;
                sign=turn;
                for(int j=i+2;j<points.Length;j++)
                {
                    if(i==0 && j==points.Length-1) continue;
                    Vector2 d=points[j], e=points[(j+1)%points.Length];
                    bool overlap=Mathf.Max(Mathf.Min(a.x,b.x),Mathf.Min(d.x,e.x))<=Mathf.Min(Mathf.Max(a.x,b.x),Mathf.Max(d.x,e.x)) &&
                        Mathf.Max(Mathf.Min(a.y,b.y),Mathf.Min(d.y,e.y))<=Mathf.Min(Mathf.Max(a.y,b.y),Mathf.Max(d.y,e.y));
                    if(overlap && Cross(b-a,d-a)*Cross(b-a,e-a)<=0 && Cross(e-d,a-d)*Cross(e-d,b-d)<=0) return false;
                }
            }
            return Mathf.Abs(area)>.0001f;
        }
        public bool TryApply(string json, out string error)
        {
            error = "Invalid London layout; keeping the last working version.";
            Layout next;
            try { next = JsonUtility.FromJson<Layout>(json); } catch { return false; }
            if (next == null || next.version != 1 || !Range(next.height, 18, 32) || !Range(next.distance, 22, 40) ||
                !Range(next.targetZ, 0, 10) || !Range(next.fieldOfView, 30, 48) || !Range(next.exposure, .4f, 1.6f) ||
                !Range(next.zoom,1,2) || !Range(next.characterScale,1,1.5f) || !Range(next.followSeconds,.15f,1.5f) || !Range(next.fillIntensity,0,1) || !Range(next.keyIntensity, .1f, 2) || !Polygon(next.road) || next.masks == null || next.masks.Length > 16) return false;
            foreach (var mask in next.masks)
                if (mask == null || !Polygon(mask.points,true) || !Range(mask.foot.x, 0, 1) || !Range(mask.foot.y, .3f, 1)) return false;
            var oldProjection=view.projectionMatrix;view.ResetProjectionMatrix();
            var oldPosition = view.transform.position; var oldRotation = view.transform.rotation; float oldFov = view.fieldOfView;
            view.orthographic = false; view.fieldOfView = next.fieldOfView; view.aspect = Aspect;
            view.transform.position = new Vector3(0, next.height, -next.distance);
            view.transform.LookAt(new Vector3(0, 0, next.targetZ));
            // Keep both occupied positions and later wave entrances inside the road.
            bool safe=true;
            foreach (var actor in FindObjectsByType<CharacterController>(FindObjectsSortMode.None))
                safe &= OnRoad(actor.transform.position,next.road);
            for(int i=0;i<6;i++) safe &= OnRoad(RunManager.SpawnPosition(6,i),next.road);
            safe &= OnRoad(RunManager.SpawnPosition(1,0),next.road);
            if(!safe)
            {
                view.transform.SetPositionAndRotation(oldPosition,oldRotation); view.fieldOfView=oldFov;view.projectionMatrix=oldProjection;
                error="Road edit would exclude an actor or wave entrance; keeping the current layout."; return false;
            }
            var replacement = new GameObject("London image stage"); replacement.SetActive(false);
            var floor = new GameObject("Invisible street floor"); floor.transform.SetParent(replacement.transform); floor.layer = 8;
            var box = floor.AddComponent<BoxCollider>(); box.center = new Vector3(0, -.25f, 0); box.size = new Vector3(200, .5f, 200);
            for (int i=0; i<next.road.Length; i++)
            {
                Vector3 a=Ground(next.road[i]), b=Ground(next.road[(i+1)%next.road.Length]);
                var wall = new GameObject("Street boundary " + i); wall.layer=8; wall.transform.SetParent(replacement.transform);
                wall.transform.position=(a+b)*.5f+Vector3.up*2;
                wall.transform.rotation=Quaternion.LookRotation(b-a);
                wall.AddComponent<BoxCollider>().size=new Vector3(.12f,4,Vector3.Distance(a,b)+.12f);
            }
            Quad("Original London image", new[]{new Vector2(0,0),new Vector2(1,0),new Vector2(1,1),new Vector2(0,1)}, 100, backdrop, replacement.transform);
            foreach (var mask in next.masks)
                Quad(mask.name, mask.points, view.WorldToViewportPoint(Ground(mask.foot)).z, depth, replacement.transform);
            if (geometry) ReleaseGeometry();
            geometry=replacement; geometry.SetActive(true); Current=next; Revision++;
            backdrop.SetFloat("_Exposure", next.exposure); key.intensity=next.keyIntensity;fill.intensity=next.fillIntensity;
            calibratedProjection=view.projectionMatrix;
            foreach(var actor in FindObjectsByType<CharacterController>(FindObjectsSortMode.None)) ScaleActor(actor.transform);
            UpdateCrop(true);
            Physics.SyncTransforms(); error=null;
            Debug.Log("LONDON_APPLIED: revision " + Revision);
            return true;
        }
        public Vector3 Ground(Vector2 point)
        {
            var ray=view.ViewportPointToRay(new Vector3(point.x,1-point.y,0));
            new Plane(Vector3.up,Vector3.zero).Raycast(ray,out float distance);
            return ray.GetPoint(distance);
        }
        bool OnRoad(Vector3 position, Vector2[] road)
        {
            var p=view.WorldToViewportPoint(position);
            return p.z>0 && Inside(new Vector2(p.x,1-p.y),road);
        }
        static bool Inside(Vector2 p, Vector2[] points)
        {
            bool inside=false;
            for(int i=0,j=points.Length-1;i<points.Length;j=i++)
                if ((points[i].y>p.y)!=(points[j].y>p.y) && p.x < (points[j].x-points[i].x)*(p.y-points[i].y)/(points[j].y-points[i].y)+points[i].x) inside=!inside;
            return inside;
        }
        void Quad(string label, Vector2[] points, float distance, Material material, Transform parent)
        {
            var vertices=new Vector3[points.Length]; var uv=new Vector2[points.Length];
            var triangles=new int[(points.Length-2)*3];
            for(int i=0;i<points.Length;i++) { uv[i]=new Vector2(points[i].x,1-points[i].y); vertices[i]=view.ViewportToWorldPoint(new Vector3(uv[i].x,uv[i].y,distance)); }
            // Authored silhouettes are convex, so a fan is sufficient.
            for(int i=0;i<points.Length-2;i++) { triangles[i*3]=0;triangles[i*3+1]=i+1;triangles[i*3+2]=i+2; }
            var mesh=new Mesh { vertices=vertices,uv=uv,triangles=triangles }; mesh.RecalculateBounds();
            var go=new GameObject(label,typeof(MeshFilter),typeof(MeshRenderer)); go.transform.SetParent(parent);
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=material;
            go.GetComponent<MeshRenderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
        }
        public void SetInspection(bool inspecting)
        {
            if(geometry)geometry.SetActive(!inspecting); view.ResetProjectionMatrix();view.orthographic=inspecting;
        }
        public void ScaleActor(Transform actor)
        {
            var visual=actor.Find("Visual");
            if(visual && !Mathf.Approximately(visual.localScale.x,Current.characterScale))
            {
                visual.localScale=Vector3.one*Current.characterScale;
                // Preserve the capsule skin offset while scaling the cosmetic model.
                visual.localPosition=Vector3.up*actor.GetComponent<CharacterController>().skinWidth*(Current.characterScale-1);
                actor.GetComponent<ArtMotion>()?.RefreshProportions();
            }
        }
        void UpdateCrop(bool immediate=false)
        {
            if(Current==null || GetComponent<HeroView>().Inspecting) return;
            var player=RunManager.Instance.Player;
            Vector3 p=player.transform.position;
            Vector4 clip=calibratedProjection*view.worldToCameraMatrix*new Vector4(p.x,p.y,p.z,1);
            float edge=.5f/Current.zoom;
            var target=new Vector2(Mathf.Clamp(.5f+clip.x/clip.w*.5f,edge,1-edge),
                Mathf.Clamp(.6f+clip.y/clip.w*.5f,edge,1-edge));
            cropCenter=immediate?target:Vector2.SmoothDamp(cropCenter,target,ref cropVelocity,Current.followSeconds,Mathf.Infinity,Time.unscaledDeltaTime);
            cropCenter=new Vector2(Mathf.Clamp(cropCenter.x,edge,1-edge),Mathf.Clamp(cropCenter.y,edge,1-edge));
            var crop=Matrix4x4.identity;crop.m00=crop.m11=Current.zoom;
            crop.m03=-2*Current.zoom*(cropCenter.x-.5f);crop.m13=-2*Current.zoom*(cropCenter.y-.5f);
            view.projectionMatrix=crop*calibratedProjection;
        }
        void LateUpdate()
        {
            UpdateCrop();
            float screenAspect=(float)Screen.width/Mathf.Max(1,Screen.height);
            view.rect=screenAspect>Aspect ? new Rect((1-Aspect/screenAspect)*.5f,0,Aspect/screenAspect,1) : new Rect(0,(1-screenAspect/Aspect)*.5f,1,screenAspect/Aspect);
            foreach(var actor in FindObjectsByType<CharacterController>(FindObjectsSortMode.None))
                if (!actor.transform.Find("Contact shadow"))
                {
                    var shadow=GameObject.CreatePrimitive(PrimitiveType.Quad); shadow.name="Contact shadow";
                    Destroy(shadow.GetComponent<Collider>());shadow.transform.SetParent(actor.transform,false);
                    shadow.transform.localPosition=Vector3.up*.025f;shadow.transform.localRotation=Quaternion.Euler(90,0,0);shadow.transform.localScale=new Vector3(1.7f,1.25f,1);
                    shadow.GetComponent<Renderer>().sharedMaterial=contact;
                }
        }
        void ReleaseGeometry()
        {
            geometry.SetActive(false);
            foreach(var filter in geometry.GetComponentsInChildren<MeshFilter>(true)) Destroy(filter.sharedMesh);
            Destroy(geometry);
        }
        void OnDestroy()
        {
            if(geometry)ReleaseGeometry();if(picture)Destroy(picture);
            Destroy(backdrop);Destroy(depth);Destroy(contact);
        }
    }
}
