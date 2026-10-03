using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.InputSystem;

namespace Ashvault
{
    // Opt-in three-area pilot; the original image and default launch remain rollback.
    public sealed class LondonTravel : MonoBehaviour
    {
        string area="west";
        public bool InEast => area=="east";
        public bool InSouth => area=="south";
        LondonBackdrop stage;
        RunManager run;
        string directory;
        bool ready, runWasEnabled;
        readonly List<GameObject> parked=new List<GameObject>();
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"-london-travel")<0)return;
            SceneManager.sceneLoaded+=OnSceneLoaded;
            OnSceneLoaded(default(Scene),LoadSceneMode.Single);
        }
        static void OnSceneLoaded(Scene scene,LoadSceneMode mode)
        {
            new GameObject("London bridge loader").AddComponent<LondonTravel>().StartCoroutine(Load());
        }
        static IEnumerator Load()
        {
            while(!Camera.main || !RunManager.Instance?.Player || Camera.main.GetComponent<LondonBackdrop>()?.Current==null)yield return null;
            var camera=Camera.main;var loader=GameObject.Find("London bridge loader");
            var travel=camera.gameObject.AddComponent<LondonTravel>();
            if(!travel.Initialize(Path.Combine(camera.GetComponent<LondonBackdrop>().ContentDirectory,"Travel"),out string error))
            {Debug.LogWarning("LONDON_TRAVEL_REJECTED: "+error);Destroy(travel);}
            if(loader)Destroy(loader);
        }
        public bool Initialize(string content,out string error)
        {
            stage=Camera.main.GetComponent<LondonBackdrop>();run=RunManager.Instance;directory=content;
            runWasEnabled=run.enabled;
            if(!stage.TryLoadArea(Path.Combine(directory,"west"),true,out error))return false;
            stage.TravelActive=true;ready=true;
            Debug.Log("LONDON_TRAVEL_READY: Westminster bridge/east and bottom road/south.");return true;
        }
        public Vector3 Ground(Vector2 point)=>stage.CalibratedGround(point);
        void Update()
        {
            // The encounter manager is paused away, but its existing restart action remains available.
            if(ready && area!="west" && Keyboard.current!=null && Keyboard.current.rKey.wasPressedThisFrame)run.Restart();
        }
        void LateUpdate()
        {
            if(!ready || !run.Player || run.Player.Life.Dead || Camera.main.GetComponent<HeroView>().Inspecting)return;
            var p=stage.CalibratedPoint(run.Player.transform.position);
            if(area=="west" && p.x>.955f && p.y>.28f && p.y<.40f)Switch("east");
            else if(area=="west" && p.y>.97f && p.x>.49f && p.x<.75f)Switch("south");
            else if(InEast && p.x<.04f && p.y>.68f && p.y<.81f)Switch("west");
            else if(InSouth && p.y<.235f && p.x>.49f && p.x<.58f)Switch("west");
        }
        bool Switch(string destination)
        {
            bool away=destination!="west";
            var player=run.Player;var body=player.GetComponent<CharacterController>();var previous=player.transform.position;
            if(away)
            {
                runWasEnabled=run.enabled;run.enabled=false;
                foreach(var enemy in run.Enemies)if(enemy && enemy.gameObject.activeSelf){parked.Add(enemy.gameObject);enemy.gameObject.SetActive(false);}
            }
            else foreach(var enemy in parked)if(enemy)enemy.SetActive(true);
            body.enabled=false;player.transform.position=Ground(destination=="east"?new Vector2(.10f,.72f):destination=="south"?new Vector2(.55f,.29f):InSouth?new Vector2(.60f,.92f):new Vector2(.90f,.40f))+Vector3.up*.04f;body.enabled=true;
            if(!stage.TryLoadArea(Path.Combine(directory,destination),!away,out string error))
            {
                body.enabled=false;player.transform.position=previous;body.enabled=true;
                foreach(var enemy in parked)if(enemy)enemy.SetActive(away);
                if(away){parked.Clear();run.enabled=runWasEnabled;}
                Debug.LogWarning("LONDON_TRAVEL_REJECTED: "+error);return false;
            }
            area=destination;player.GetComponent<ArtMotion>()?.RefreshProportions();
            if(!away){parked.Clear();run.enabled=runWasEnabled;}
            Debug.Log("LONDON_TRAVEL: "+destination);return true;
        }
        void OnDestroy()
        {
            // Scene restarts tear down existing geometry; rebuilding it here leaks objects.
            foreach(var enemy in parked)if(enemy)enemy.SetActive(true);
            if(ready && run)run.enabled=runWasEnabled;
            if(stage)stage.TravelActive=false;
        }
    }
}
