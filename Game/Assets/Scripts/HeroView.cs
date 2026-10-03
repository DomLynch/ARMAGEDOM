using UnityEngine;
using UnityEngine.InputSystem;

namespace Ashvault
{
    // Close-up uses the same live model and materials as combat; no separate beauty render.
    public sealed class HeroView : MonoBehaviour
    {
        public bool Inspecting { get; private set; }
        Camera view;
        RunManager run;
        PlayerController player;
        GameObject hud;
        Vector3 oldPosition;
        Quaternion oldRotation;
        float oldSize, oldTimeScale, yaw=25;
        bool playerEnabled, runEnabled, hudEnabled;
        readonly float[] frameTimes=new float[180];
        int frames;
        void Start() { view=GetComponent<Camera>(); run=RunManager.Instance; player=run.Player; hud=GameObject.Find("HUD"); }
        void Update()
        {
            if (frames<frameTimes.Length && Application.isFocused && Time.realtimeSinceStartup>3 && SystemInfo.graphicsDeviceType!=UnityEngine.Rendering.GraphicsDeviceType.Null)
            {
                frameTimes[frames++]=Time.unscaledDeltaTime;
                if(frames==frameTimes.Length)
                {
                    System.Array.Sort(frameTimes); float sum=0;foreach(float t in frameTimes)sum+=t;
                    Debug.Log($"ASHVAULT_RENDER: {Screen.width}x{Screen.height}; averageFPS={frames/sum:F1}; p95FrameMs={frameTimes[170]*1000:F1}");
                }
            }
            if (!player || Keyboard.current==null) return;
            if (Keyboard.current.vKey.wasPressedThisFrame) Toggle();
            if (!Inspecting)
            {
                if (!GetComponent<LondonBackdrop>() && Mouse.current!=null) view.orthographicSize=Mathf.Clamp(view.orthographicSize-Mouse.current.scroll.ReadValue().y*.002f,3f,8f);
                return;
            }
            float turn=(Keyboard.current.rightArrowKey.isPressed?1:0)-(Keyboard.current.leftArrowKey.isPressed?1:0);
            yaw+=turn*65*Time.unscaledDeltaTime;
            var target=player.transform.position+Vector3.up;
            view.transform.position=target+Quaternion.Euler(0,yaw,0)*new Vector3(0,.45f,4);
            view.transform.LookAt(target);
        }
        public void Toggle()
        {
            if (!Inspecting)
            {
                if (!hud) hud=GameObject.Find("HUD"); // HUD may be created after this component's Start.
                yaw=player.transform.eulerAngles.y+25;
                oldPosition=transform.position;oldRotation=transform.rotation;oldSize=view.orthographicSize;oldTimeScale=Time.timeScale;
                playerEnabled=player.enabled;runEnabled=run.enabled;hudEnabled=hud&&hud.activeSelf;
                player.enabled=false;run.enabled=false;if(hud)hud.SetActive(false);
                Time.timeScale=0;view.orthographicSize=1.18f;
                GetComponent<LondonBackdrop>()?.SetInspection(true);
            }
            else Restore();
            Inspecting=!Inspecting;
        }
        void Restore()
        {
            Time.timeScale=oldTimeScale;
            GetComponent<LondonBackdrop>()?.SetInspection(false);
            if(player)player.enabled=playerEnabled;if(run)run.enabled=runEnabled;if(hud)hud.SetActive(hudEnabled);
            transform.SetPositionAndRotation(oldPosition,oldRotation);if(view)view.orthographicSize=oldSize;
        }
        void OnDestroy() { if(Inspecting)Restore(); }
        void OnGUI()
        {
            if (!Inspecting) return;
            var style=new GUIStyle(GUI.skin.label) { alignment=TextAnchor.MiddleCenter,fontSize=18 };
            GUI.Label(new Rect(0,Screen.height-60,Screen.width,40),"SURVIVOR  ·  ← → rotate  ·  V return to game",style);
        }
    }
}
