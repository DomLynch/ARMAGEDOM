using System;
using System.Collections;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace Ashvault.Tests {
public partial class BridgeTests {
    [Serializable] public class AuditRoutes { public AuditArea[] areas; }
    [Serializable] public class AuditArea { public string area; public Vector2[] points; public AuditProbe[] checks; }
    [Serializable] public class AuditProbe { public string name; public Vector2[] points; public Vector2 blocked; }
    [UnityTest] public IEnumerator AuditWestminsterPavementsAndSolidBoundaries() => WalkSurvey("west");
    [UnityTest] public IEnumerator AuditSouthPavementsAndSolidBoundaries() => WalkSurvey("south");
    [UnityTest] public IEnumerator AuditEastPavementsAndSolidBoundaries() => WalkSurvey("east");

    IEnumerator WalkSurvey(string area) {
        SceneManager.LoadScene("Ashvault");yield return null;yield return null;
        var run=RunManager.Instance;run.enabled=false;var player=run.Player;var camera=Camera.main;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../art/london/areas/walkability-audit-20261003"));
        var survey=JsonUtility.FromJson<AuditRoutes>(File.ReadAllText(Path.Combine(folder,"routes.json"))).areas.Single(a=>a.area==area);
        var type=typeof(RunManager).Assembly.GetType("Ashvault.LondonTravel");var travel=camera.gameObject.AddComponent(type);
        var args=new object[]{Path.Combine(folder,"candidates"),null};Assert.IsTrue((bool)type.GetMethod("Initialize").Invoke(travel,args),args[1] as string);
        var change=type.GetMethod("Switch",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
        if(area!="west")Assert.IsTrue((bool)change.Invoke(travel,new object[]{area}));
        var keyboard=InputSystem.AddDevice<Keyboard>();var mouse=InputSystem.AddDevice<Mouse>();
        InputSystem.QueueStateEvent(mouse,new MouseState{position=new Vector2(1,1)});
        try {
            yield return WalkAuditPoints(travel,survey.points,keyboard,camera,player,area);
            foreach(var check in survey.checks) {
                yield return WalkAuditPoints(travel,check.points,keyboard,camera,player,area);
                var blocked=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{check.blocked});float until=Time.realtimeSinceStartup+2;
                while(Time.realtimeSinceStartup<until) {QueueToward(keyboard,camera,blocked-player.transform.position);yield return null;}
                Assert.Greater(Vector3.ProjectOnPlane(blocked-player.transform.position,Vector3.up).magnitude,.75f,area+" must block "+check.name);
                Assert.IsTrue(Physics.Linecast(player.transform.position+Vector3.up*.5f,blocked+Vector3.up*.5f,1<<8),area+" needs physical "+check.name+" boundary");
                yield return WalkAuditPoints(travel,new[]{check.points.Last()},keyboard,camera,player,area);
            }
            if(area!="west")Assert.IsTrue((bool)change.Invoke(travel,new object[]{"west"}));
            var home=area=="east"?new[]{new Vector2(.82f,.46f),new Vector2(.71f,.54f),new Vector2(.62f,.59f),new Vector2(.52f,.78f)}:new[]{new Vector2(.52f,.78f)};
            yield return WalkAuditPoints(travel,home,keyboard,camera,player,"west");
            Assert.AreSame(player,run.Player);Assert.AreEqual(100,player.Life.current);
        } finally {InputSystem.RemoveDevice(keyboard);InputSystem.RemoveDevice(mouse);UnityEngine.Object.Destroy(travel);}
        yield return null;
    }
    static IEnumerator WalkAuditPoints(Component travel,Vector2[] points,Keyboard keyboard,Camera camera,PlayerController player,string area) {
        var type=travel.GetType();
        foreach(var point in points) {
            var goal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{point});float end=Time.realtimeSinceStartup+12;
            while(Vector3.ProjectOnPlane(goal-player.transform.position,Vector3.up).magnitude>.15f) {
                Assert.Less(Time.realtimeSinceStartup,end,"Audit route blocked in "+area+" at "+point);
                Assert.AreEqual(area=="east",(bool)type.GetProperty("InEast").GetValue(travel));Assert.AreEqual(area=="south",(bool)type.GetProperty("InSouth").GetValue(travel));
                QueueToward(keyboard,camera,goal-player.transform.position);yield return null;
            }
        }
        InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;
    }
}}
