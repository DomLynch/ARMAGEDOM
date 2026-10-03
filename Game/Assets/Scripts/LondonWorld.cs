using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Ashvault
{
    // Opt-in, bounded image-world pilot. Legacy London remains the default.
    public sealed class LondonWorld : MonoBehaviour
    {
        [Serializable] public class Area
        {
            public string id,image;
            public float offsetY;
            public LondonBackdrop.Layout layout;
            public Vector4 top,bottom;
            public Vector2[] spawns;
        }
        [Serializable] public class Content
        {
            public int version;
            public float zoom,characterScale,followSeconds,seamWidth,canvasHeight;
            public Area[] areas;
            public Vector2[] road;
            public Roof[] roofs;
        }
        [Serializable] public class Roof { public string id,image; public float topY,height,exposure; public Vector2 foot; }
        public static LondonWorld Instance { get; private set; }
        public Content Current { get; private set; }
        Camera view;
        LondonBackdrop legacy;
        GameObject oldGeometry,geometry;
        Vector3 oldPosition,origin,axisX,axisY,pictureOrigin,pictureX,pictureY;
        Quaternion oldRotation;
        float oldSize,oldFar,size;
        Vector2 center,velocity;
        readonly List<Texture2D> textures=new List<Texture2D>();
        readonly List<Material> materials=new List<Material>();
        readonly Dictionary<CharacterController,Vector3> originalActors=new Dictionary<CharacterController,Vector3>();
        Material contact;
        bool automatic;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-london-world")>=0)
                new GameObject("London world loader").AddComponent<LondonWorld>().automatic=true;
        }
        IEnumerator Start()
        {
            if(!automatic)yield break;
            while(!Camera.main || !RunManager.Instance || !RunManager.Instance.Player || Camera.main.GetComponent<LondonBackdrop>()?.Current==null)
                yield return null;
            var stage=Camera.main.GetComponent<LondonBackdrop>();
            if(!Initialize(Path.Combine(stage.ContentDirectory,"World"),out string error))
                Debug.LogWarning("LONDON_WORLD_REJECTED: "+error);
        }
        static bool Finite(float value) => !float.IsNaN(value)&&!float.IsInfinity(value);
        static float Cross(Vector2 a,Vector2 b) => a.x*b.y-a.y*b.x;
        static bool ValidRoad(Vector2[] points,float height)
        {
            if(points==null || points.Length<3 || points.Length>64)return false;
            float area=0;
            for(int i=0;i<points.Length;i++)
            {
                var a=points[i];var b=points[(i+1)%points.Length];
                if(!Finite(a.x)||!Finite(a.y)||a.x<0||a.x>1||a.y<0||a.y>height||(a-b).sqrMagnitude<.000001f)return false;
                area+=Cross(a,b);
                for(int j=i+2;j<points.Length;j++)
                {
                    if(i==0&&j==points.Length-1)continue;
                    var c=points[j];var d=points[(j+1)%points.Length];
                    if(Cross(b-a,c-a)*Cross(b-a,d-a)<0&&Cross(d-c,a-c)*Cross(d-c,b-c)<0)return false;
                }
            }
            return Mathf.Abs(area)>.001f;
        }
        public bool Initialize(string directory,out string error)
        {
            error=null;
            if(Current!=null){error="World already initialized.";return false;}
            try
            {
                var next=JsonUtility.FromJson<Content>(File.ReadAllText(Path.Combine(directory,"world.json")));
                if(next==null||next.version!=1||next.areas==null||next.areas.Length!=3||next.canvasHeight!=3||
                    next.zoom!=1.65f||next.characterScale!=1.265f||next.followSeconds!=.45f||
                    !Finite(next.seamWidth)||next.seamWidth<0||next.seamWidth>.05f||!ValidRoad(next.road,next.canvasHeight))
                    throw new InvalidDataException("Invalid bounded world content.");
                string root=Path.GetFullPath(directory)+Path.DirectorySeparatorChar;
                for(int i=0;i<next.areas.Length;i++)
                {
                    var area=next.areas[i];
                    if(area==null||area.offsetY!=i||area.layout==null||area.layout.masks==null||!ValidRoad(area.layout.road,1))
                        throw new InvalidDataException("Invalid area geometry.");
                    foreach(var edge in new[]{area.top,area.bottom})
                        if(!Finite(edge.x)||!Finite(edge.y)||!Finite(edge.z)||!Finite(edge.w)||edge.x<=0||edge.y>=1||edge.z<=0||edge.w>=1||edge.y-edge.x<.03f||edge.w-edge.z<.03f)
                            throw new InvalidDataException("Invalid edge registration.");
                    string image=Path.GetFullPath(Path.Combine(root,area.image));
                    if(!image.StartsWith(root,StringComparison.Ordinal))throw new InvalidDataException("Image must be inside the content bundle.");
                    var texture=new Texture2D(2,2,TextureFormat.RGB24,false);textures.Add(texture);
                    if(!texture.LoadImage(File.ReadAllBytes(image))||texture.width!=1672||texture.height!=941)
                        throw new InvalidDataException("Area image must be1672x941.");
                    texture.wrapMode=TextureWrapMode.Clamp;
                }
                if(next.roofs!=null)foreach(var roof in next.roofs)
                {
                    if(roof==null||!Finite(roof.topY)||!Finite(roof.height)||roof.height<=0||roof.topY<0||roof.topY+roof.height>next.canvasHeight||!Finite(roof.exposure)||roof.exposure<=0)
                        throw new InvalidDataException("Invalid foreground placement.");
                    string image=Path.GetFullPath(Path.Combine(root,roof.image));
                    if(!image.StartsWith(root,StringComparison.Ordinal))throw new InvalidDataException("Foreground must be inside the content bundle.");
                    var texture=new Texture2D(2,2,TextureFormat.RGBA32,false);textures.Add(texture);
                    if(!texture.LoadImage(File.ReadAllBytes(image))||texture.width>4096||texture.height>4096)
                        throw new InvalidDataException("Invalid foreground image.");
                    texture.wrapMode=TextureWrapMode.Clamp;
                }
                view=Camera.main;legacy=view.GetComponent<LondonBackdrop>();
                oldGeometry=GameObject.Find("London image stage");
                if(!legacy||legacy.Current==null||!oldGeometry)throw new InvalidOperationException("Legacy stage is required for rollback.");
                view.ResetProjectionMatrix();oldPosition=view.transform.position;oldRotation=view.transform.rotation;
                oldSize=view.orthographicSize;oldFar=view.farClipPlane;
                var actors=FindObjectsByType<CharacterController>(FindObjectsSortMode.None);
                var pixels=new Vector2[actors.Length];
                for(int i=0;i<actors.Length;i++)
                {
                    var p=view.WorldToViewportPoint(actors[i].transform.position);pixels[i]=new Vector2(p.x,1-p.y);
                    if(!Inside(pixels[i],next.road))throw new InvalidDataException("An existing actor is outside the world road.");
                    originalActors[actors[i]]=actors[i].transform.position;
                }
                var player=RunManager.Instance.Player.transform.position;float height=2*next.characterScale;
                float projected=view.WorldToViewportPoint(player+Vector3.up*height).y-view.WorldToViewportPoint(player).y;
                size=height*view.transform.up.y/(2*projected);
                view.orthographic=true;view.orthographicSize=size;view.farClipPlane=500;
                origin=GroundRay(new Vector2(0,0));axisX=GroundRay(new Vector2(1,0))-origin;axisY=GroundRay(new Vector2(0,1))-origin;
                pictureOrigin=view.ViewportToWorldPoint(new Vector3(0,1,100));
                pictureX=view.ViewportToWorldPoint(new Vector3(1,1,100))-pictureOrigin;
                pictureY=view.ViewportToWorldPoint(new Vector3(0,0,100))-pictureOrigin;
                geometry=new GameObject("London continuous world");geometry.SetActive(false);
                var floor=new GameObject("World ground");floor.layer=8;floor.transform.SetParent(geometry.transform);
                floor.transform.position=Ground(new Vector2(.5f,1.5f))+Vector3.down*.25f;
                floor.AddComponent<BoxCollider>().size=new Vector3(500,.5f,500);
                for(int i=0;i<next.road.Length;i++)
                {
                    var a=Ground(next.road[i]);var b=Ground(next.road[(i+1)%next.road.Length]);
                    var wall=new GameObject("World boundary "+i);wall.layer=8;wall.transform.SetParent(geometry.transform);
                    wall.transform.position=(a+b)*.5f+Vector3.up*2;wall.transform.rotation=Quaternion.LookRotation(b-a);
                    wall.AddComponent<BoxCollider>().size=new Vector3(.12f,4,Vector3.Distance(a,b)+.12f);
                }
                var depth=new Material(Resources.Load<Shader>("London/Occlusion"));materials.Add(depth);
                contact=new Material(Resources.Load<Shader>("London/Contact"));materials.Add(contact);
                for(int i=0;i<next.areas.Length;i++)
                {
                    var area=next.areas[i];var material=new Material(Resources.Load<Shader>("London/WorldBackdrop"));materials.Add(material);
                    material.mainTexture=textures[i];material.SetFloat("_Exposure",area.layout.exposure);
                    material.SetFloat("_SeamWidth",next.seamWidth);
                    material.SetFloat("_HasPrev",i>0?1:0);material.SetFloat("_HasNext",i+1<next.areas.Length?1:0);
                    if(i>0){material.SetTexture("_PrevTex",textures[i-1]);material.SetVector("_PrevEdge",next.areas[i-1].bottom);}
                    if(i+1<next.areas.Length){material.SetTexture("_NextTex",textures[i+1]);material.SetVector("_NextEdge",next.areas[i+1].top);}
                    var vertices=new List<Vector3>();var uv=new List<Vector2>();var canvas=new List<Vector2>();var triangles=new List<int>();
                    foreach(float y in new[]{0f,.09f,.18f,.5f,.82f,.91f,1f})
                        foreach(float x in new[]{0f,Mathf.Lerp(area.top.x,area.bottom.x,y),Mathf.Lerp(area.top.y,area.bottom.y,y),1f})
                        {
                            var p=new Vector2(WarpX(x,y,area),y+area.offsetY);vertices.Add(Picture(p));uv.Add(new Vector2(x,1-y));canvas.Add(p);
                        }
                    for(int row=0;row<6;row++)for(int col=0;col<3;col++)
                    {int a=row*4+col;triangles.AddRange(new[]{a,a+1,a+4,a+1,a+5,a+4});}
                    MeshObject(area.id+" image",vertices.ToArray(),uv.ToArray(),canvas.ToArray(),triangles.ToArray(),material);
                    foreach(var mask in area.layout.masks)
                    {
                        var points=new Vector3[mask.points.Length];var mu=new Vector2[points.Length];var mt=new int[(points.Length-2)*3];
                        var foot=Ground(new Vector2(WarpX(mask.foot.x,mask.foot.y,area),mask.foot.y+area.offsetY));
                        float distance=view.WorldToViewportPoint(foot).z;
                        for(int k=0;k<points.Length;k++)
                        {var p=mask.points[k];mu[k]=new Vector2(p.x,1-p.y);points[k]=Picture(new Vector2(WarpX(p.x,p.y,area),p.y+area.offsetY))+view.transform.forward*(distance-100);}
                        for(int k=0;k<points.Length-2;k++){mt[k*3]=0;mt[k*3+1]=k+1;mt[k*3+2]=k+2;}
                        MeshObject(area.id+" "+mask.name,points,mu,null,mt,depth);
                    }
                }
                if(next.roofs!=null)for(int i=0;i<next.roofs.Length;i++)
                {
                    var roof=next.roofs[i];var material=new Material(Resources.Load<Shader>("London/Foreground"));materials.Add(material);
                    material.mainTexture=textures[next.areas.Length+i];material.SetFloat("_Exposure",roof.exposure);
                    float distance=view.WorldToViewportPoint(Ground(roof.foot)).z;
                    var roofPixels=new[]{new Vector2(0,roof.topY),new Vector2(1,roof.topY),new Vector2(0,roof.topY+roof.height),new Vector2(1,roof.topY+roof.height)};
                    var points=new Vector3[4];for(int k=0;k<4;k++)points[k]=Picture(roofPixels[k])+view.transform.forward*(distance-100);
                    MeshObject(roof.id+" foreground",points,new[]{new Vector2(0,1),new Vector2(1,1),new Vector2(0,0),new Vector2(1,0)},null,new[]{0,1,2,1,3,2},material);
                }
                for(int i=0;i<actors.Length;i++)
                {float y=actors[i].transform.position.y;actors[i].enabled=false;actors[i].transform.position=Ground(pixels[i])+Vector3.up*y;actors[i].enabled=true;actors[i].GetComponent<ArtMotion>()?.RefreshProportions();}
                oldGeometry.SetActive(false);legacy.enabled=false;Current=next;Instance=this;geometry.SetActive(true);
                center=Pixel(RunManager.Instance.Player.transform.position)+Vector2.down*.1f;Follow(true);Physics.SyncTransforms();
                Debug.Log("LONDON_WORLD_READY: westminster/connector/south; projection size "+size);return true;
            }
            catch(Exception e){error=e.Message;Release();if(view){view.orthographic=false;view.transform.SetPositionAndRotation(oldPosition,oldRotation);view.orthographicSize=oldSize;view.farClipPlane=oldFar;view.ResetProjectionMatrix();}return false;}
        }
        Vector3 GroundRay(Vector2 point){new Plane(Vector3.up,Vector3.zero).Raycast(view.ViewportPointToRay(new Vector3(point.x,1-point.y,0)),out float d);return view.ViewportPointToRay(new Vector3(point.x,1-point.y,0)).GetPoint(d);}
        public Vector3 Ground(Vector2 point) => origin+axisX*point.x+axisY*point.y;
        public Vector3 Picture(Vector2 point) => pictureOrigin+pictureX*point.x+pictureY*point.y;
        public Vector2 Pixel(Vector3 point) => new Vector2(Vector3.Dot(point-origin,axisX)/axisX.sqrMagnitude,Vector3.Dot(point-origin,axisY)/axisY.sqrMagnitude);
        static float Edge(float x,Vector4 edge) => x<edge.x?x*edge.z/edge.x:x>edge.y?edge.w+(x-edge.y)*(1-edge.w)/(1-edge.y):edge.z+(x-edge.x)*(edge.w-edge.z)/(edge.y-edge.x);
        public static float WarpX(float x,float y,Area area) => x+(Edge(x,area.top)-x)*Mathf.Clamp01(1-y/.18f)+(Edge(x,area.bottom)-x)*Mathf.Clamp01(1-(1-y)/.18f);
        static bool Inside(Vector2 p,Vector2[] points){bool inside=false;for(int i=0,j=points.Length-1;i<points.Length;j=i++)if((points[i].y>p.y)!=(points[j].y>p.y)&&p.x<(points[j].x-points[i].x)*(p.y-points[i].y)/(points[j].y-points[i].y)+points[i].x)inside=!inside;return inside;}
        void MeshObject(string name,Vector3[] points,Vector2[] uv,Vector2[] canvas,int[] triangles,Material material)
        {
            var mesh=new Mesh{vertices=points,uv=uv,triangles=triangles};if(canvas!=null)mesh.uv2=canvas;mesh.RecalculateBounds();
            var go=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(geometry.transform);
            go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=material;
            go.GetComponent<Renderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
        }
        void Follow(bool immediate=false)
        {
            var p=Pixel(RunManager.Instance.Player.transform.position);float edge=.5f/Current.zoom;
            var target=new Vector2(Mathf.Clamp(p.x,edge,1-edge),Mathf.Clamp(p.y-.1f,edge,Current.canvasHeight-edge));
            center=immediate?target:Vector2.SmoothDamp(center,target,ref velocity,Current.followSeconds,Mathf.Infinity,Time.unscaledDeltaTime);
            view.transform.SetPositionAndRotation(oldPosition+axisX*(center.x-.5f)+axisY*(center.y-.5f),oldRotation);
            view.orthographic=true;view.orthographicSize=size/Current.zoom;view.ResetProjectionMatrix();
        }
        void LateUpdate()
        {
            if(Current==null)return;
            bool inspecting=view.GetComponent<HeroView>().Inspecting;geometry.SetActive(!inspecting);oldGeometry.SetActive(false);
            if(inspecting)return;Follow();
            float aspect=1672f/941,screen=(float)Screen.width/Mathf.Max(1,Screen.height);
            view.rect=screen>aspect?new Rect((1-aspect/screen)*.5f,0,aspect/screen,1):new Rect(0,(1-screen/aspect)*.5f,1,screen/aspect);
            foreach(var actor in FindObjectsByType<CharacterController>(FindObjectsSortMode.None))
                if(!actor.transform.Find("Contact shadow"))
                {var shadow=GameObject.CreatePrimitive(PrimitiveType.Quad);shadow.name="Contact shadow";Destroy(shadow.GetComponent<Collider>());shadow.transform.SetParent(actor.transform,false);shadow.transform.localPosition=Vector3.up*.025f;shadow.transform.localRotation=Quaternion.Euler(90,0,0);shadow.transform.localScale=new Vector3(1.7f,1.25f,1);shadow.GetComponent<Renderer>().sharedMaterial=contact;}
        }
        void Release()
        {
            if(geometry){geometry.SetActive(false);foreach(var filter in geometry.GetComponentsInChildren<MeshFilter>(true))Destroy(filter.sharedMesh);Destroy(geometry);}
            foreach(var material in materials)if(material)Destroy(material);materials.Clear();foreach(var texture in textures)if(texture)Destroy(texture);textures.Clear();
        }
        void OnDestroy()
        {
            if(Current!=null&&view&&legacy)
            {view.transform.SetPositionAndRotation(oldPosition,oldRotation);view.orthographic=false;view.orthographicSize=oldSize;view.farClipPlane=oldFar;view.ResetProjectionMatrix();legacy.enabled=true;if(oldGeometry)oldGeometry.SetActive(true);
                foreach(var pair in originalActors)if(pair.Key){bool enabled=pair.Key.enabled;pair.Key.enabled=false;pair.Key.transform.position=pair.Value;pair.Key.enabled=enabled;pair.Key.GetComponent<ArtMotion>()?.RefreshProportions();}Physics.SyncTransforms();}
            Release();if(Instance==this)Instance=null;
        }
    }
}
