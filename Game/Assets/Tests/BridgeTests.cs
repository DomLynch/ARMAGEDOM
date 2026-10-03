using System;
using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
namespace Ashvault.Tests {
public partial class BridgeTests {
        readonly System.Collections.Generic.List<InputDevice> desktopDevices = new System.Collections.Generic.List<InputDevice>();
        InputSettings.BackgroundBehavior background;
        InputSettings.EditorInputBehaviorInPlayMode editorInput;

        [SetUp]
        public void IsolateDesktopInput()
        {
            background = InputSystem.settings.backgroundBehavior;
            editorInput = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            foreach (var device in InputSystem.devices)
                if (device.enabled) desktopDevices.Add(device);
            foreach (var device in desktopDevices) InputSystem.DisableDevice(device);
        }

        [TearDown]
        public void RestoreDesktopInput()
        {
            foreach (var device in desktopDevices)
                if (device.added) InputSystem.EnableDevice(device);
            desktopDevices.Clear();
            InputSystem.settings.backgroundBehavior = background;
            InputSystem.settings.editorInputBehaviorInPlayMode = editorInput;
        }


[UnityTest] public IEnumerator BridgeConnectsEastAndReturnsWithoutReplacingPlayer() {
SceneManager.LoadScene("Ashvault"); yield return null; yield return null;
var type=typeof(RunManager).Assembly.GetType("Ashvault.LondonTravel"); Assert.IsNotNull(type,"Bridge travel runtime is missing.");
var run=RunManager.Instance;run.enabled=false;var player=run.Player;
var camera=Camera.main;var stage=camera.GetComponent<LondonBackdrop>();var rotation=camera.transform.rotation;
float hp=player.Life.current, cooldown=player.attackReady;
var travel=camera.gameObject.AddComponent(type);
var init=type.GetMethod("Initialize");var args=new object[]{Path.Combine(Application.streamingAssetsPath,"London/Travel"),null};Assert.IsTrue((bool)init.Invoke(travel,args),args[1] as string);
var keyboard=InputSystem.AddDevice<Keyboard>();var mouse=InputSystem.AddDevice<Mouse>();
InputSystem.QueueStateEvent(mouse,new MouseState{position=new Vector2(1,1)});
try {
var points=new[]{new Vector2(.62f,.59f),new Vector2(.71f,.54f),new Vector2(.82f,.46f),new Vector2(.97f,.34f)};
foreach(var point in points) {
var goal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{point});float deadline=Time.realtimeSinceStartup+18;
while(Vector3.ProjectOnPlane(goal-player.transform.position,Vector3.up).magnitude>.3f && !(bool)type.GetProperty("InEast").GetValue(travel)) {
Assert.Less(Time.realtimeSinceStartup,deadline,"Bridge collision snag at "+point);
var delta=goal-player.transform.position;var f=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;
var keys=new System.Collections.Generic.List<Key>();float x=Vector3.Dot(delta,camera.transform.right),y=Vector3.Dot(delta,f);
if(x>.1f)keys.Add(Key.D);else if(x<-.1f)keys.Add(Key.A);if(y>.1f)keys.Add(Key.W);else if(y<-.1f)keys.Add(Key.S);
InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys.ToArray()));yield return null;
}
}
Assert.IsTrue((bool)type.GetProperty("InEast").GetValue(travel),"Walking off Westminster bridge must reach east.");
InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return new WaitForSeconds(.2f);
var entry=player.transform.position;
var farther=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{new Vector2(.28f,.58f)});float eastDeadline=Time.realtimeSinceStartup+12;
while(Vector3.ProjectOnPlane(farther-player.transform.position,Vector3.up).magnitude>.3f) {
Assert.Less(Time.realtimeSinceStartup,eastDeadline,"East bridge exploration blocked.");var delta=farther-player.transform.position;
var f=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;var keys=new System.Collections.Generic.List<Key>();float x=Vector3.Dot(delta,camera.transform.right),y=Vector3.Dot(delta,f);
if(x>.08f)keys.Add(Key.D);else if(x<-.08f)keys.Add(Key.A);if(y>.08f)keys.Add(Key.W);else if(y<-.08f)keys.Add(Key.S);
InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys.ToArray()));yield return null;
Assert.IsTrue((bool)type.GetProperty("InEast").GetValue(travel));
}
Assert.Greater(Vector3.Distance(entry,player.transform.position),2,"East must be explorable beyond arrival.");
var returnGoal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{new Vector2(.025f,.74f)});float end=Time.realtimeSinceStartup+12;
while((bool)type.GetProperty("InEast").GetValue(travel)) {
Assert.Less(Time.realtimeSinceStartup,end,"East bridge return blocked.");var delta=returnGoal-player.transform.position;
var f=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;var keys=new System.Collections.Generic.List<Key>();float x=Vector3.Dot(delta,camera.transform.right),y=Vector3.Dot(delta,f);
if(x>.08f)keys.Add(Key.D);else if(x<-.08f)keys.Add(Key.A);if(y>.08f)keys.Add(Key.W);else if(y<-.08f)keys.Add(Key.S);
InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys.ToArray()));yield return null;
}
Assert.AreSame(player,run.Player);Assert.AreEqual(hp,player.Life.current);Assert.AreEqual(cooldown,player.attackReady);
Assert.Less(Quaternion.Angle(rotation,camera.transform.rotation),.001f);Assert.AreEqual(1.65f,stage.Current.zoom);Assert.AreEqual(1.265f,stage.Current.characterScale);
Assert.Greater(Vector3.Distance(entry,player.transform.position),1);
} finally {InputSystem.RemoveDevice(keyboard);InputSystem.RemoveDevice(mouse);UnityEngine.Object.Destroy(travel);}
yield return null;
}

[UnityTest] public IEnumerator BottomRoadConnectsSouthAndReturnsWithStateIntact() {
SceneManager.LoadScene("Ashvault");yield return null;yield return null;
var type=typeof(RunManager).Assembly.GetType("Ashvault.LondonTravel");
Assert.IsNotNull(type.GetProperty("InSouth"),"South connection is missing.");
var run=RunManager.Instance;run.enabled=false;var player=run.Player;float health=player.Life.current, cooldown=player.attackReady;
var camera=Camera.main;var stage=camera.GetComponent<LondonBackdrop>();var angle=camera.transform.rotation;
var travel=camera.gameObject.AddComponent(type);var args=new object[]{Path.Combine(Application.streamingAssetsPath,"London/Travel"),null};Assert.IsTrue((bool)type.GetMethod("Initialize").Invoke(travel,args),args[1] as string);
var keyboard=InputSystem.AddDevice<Keyboard>();var mouse=InputSystem.AddDevice<Mouse>();InputSystem.QueueStateEvent(mouse,new MouseState{position=new Vector2(1,1)});
try {
foreach(var point in new[]{new Vector2(.57f,.93f),new Vector2(.60f,.99f)}) {
var goal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{point});float end=Time.realtimeSinceStartup+12;
while(Vector3.ProjectOnPlane(goal-player.transform.position,Vector3.up).magnitude>.2f && !(bool)type.GetProperty("InSouth").GetValue(travel)) {
Assert.Less(Time.realtimeSinceStartup,end,"South exit blocked.");QueueToward(keyboard,camera,goal-player.transform.position);yield return null;
}}
Assert.IsTrue((bool)type.GetProperty("InSouth").GetValue(travel));
foreach(var point in new[]{new Vector2(.58f,.34f),new Vector2(.51f,.325f),new Vector2(.41f,.245f),new Vector2(.51f,.325f),new Vector2(.58f,.34f),new Vector2(.51f,.325f),new Vector2(.41f,.245f),new Vector2(.33f,.245f),new Vector2(.27f,.23f),new Vector2(.275f,.17f),new Vector2(.30f,.105f),new Vector2(.34f,.055f),new Vector2(.30f,.105f),new Vector2(.275f,.17f),new Vector2(.27f,.23f),new Vector2(.27f,.23f),new Vector2(.265f,.285f),new Vector2(.28f,.34f),new Vector2(.29f,.37f),new Vector2(.28f,.435f),new Vector2(.38f,.565f),new Vector2(.28f,.435f),new Vector2(.29f,.37f),new Vector2(.28f,.34f),new Vector2(.265f,.285f),new Vector2(.27f,.23f),new Vector2(.33f,.245f),new Vector2(.49f,.26f),new Vector2(.58f,.36f),new Vector2(.59f,.47f),new Vector2(.565f,.55f),new Vector2(.51f,.595f),new Vector2(.38f,.565f),new Vector2(.28f,.465f),new Vector2(.38f,.565f),new Vector2(.51f,.595f),new Vector2(.52f,.64f),new Vector2(.565f,.55f),new Vector2(.59f,.47f),new Vector2(.55f,.36f),new Vector2(.53f,.22f)}) {
var goal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{point});float end=Time.realtimeSinceStartup+12;
while(Vector3.ProjectOnPlane(goal-player.transform.position,Vector3.up).magnitude>.2f && (bool)type.GetProperty("InSouth").GetValue(travel)) {
Assert.Less(Time.realtimeSinceStartup,end,"South movement blocked at "+point);QueueToward(keyboard,camera,goal-player.transform.position);yield return null;
}
if(point==new Vector2(.59f,.47f)) {
var blocked=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{new Vector2(.47f,.50f)});
float attempt=Time.realtimeSinceStartup+2;
while(Time.realtimeSinceStartup<attempt) {QueueToward(keyboard,camera,blocked-player.transform.position);yield return null;}
Assert.Greater(Vector3.ProjectOnPlane(blocked-player.transform.position,Vector3.up).magnitude,.75f,"Checkpoint must stop walking through supplies.");
Assert.IsTrue(Physics.Linecast(player.transform.position+Vector3.up*.5f,blocked+Vector3.up*.5f,1<<8),"Checkpoint needs physical collision.");
}
}
Assert.IsFalse((bool)type.GetProperty("InSouth").GetValue(travel),"North exit must return to Westminster.");Assert.IsFalse((bool)type.GetProperty("InEast").GetValue(travel));
Assert.AreSame(player,run.Player);Assert.AreEqual(health,player.Life.current);Assert.AreEqual(cooldown,player.attackReady);Assert.Less(Quaternion.Angle(angle,camera.transform.rotation),.001f);Assert.AreEqual(1.65f,stage.Current.zoom);Assert.AreEqual(1.265f,stage.Current.characterScale);
} finally {InputSystem.RemoveDevice(keyboard);InputSystem.RemoveDevice(mouse);UnityEngine.Object.Destroy(travel);}
yield return null;
}
[UnityTest] public IEnumerator BarrelGapWalksBothDirectionsAndKeepsCheckpointBlocked() {
SceneManager.LoadScene("Ashvault");yield return null;yield return null;
var run=RunManager.Instance;run.enabled=false;var player=run.Player;var camera=Camera.main;
var type=typeof(RunManager).Assembly.GetType("Ashvault.LondonTravel");var travel=camera.gameObject.AddComponent(type);
var args=new object[]{Path.Combine(Application.streamingAssetsPath,"London/Travel"),null};Assert.IsTrue((bool)type.GetMethod("Initialize").Invoke(travel,args),args[1] as string);
Assert.IsTrue((bool)type.GetMethod("Switch",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(travel,new object[]{"south"}));
var keyboard=InputSystem.AddDevice<Keyboard>();var mouse=InputSystem.AddDevice<Mouse>();InputSystem.QueueStateEvent(mouse,new MouseState{position=new Vector2(1,1)});
try {
foreach(var point in new[]{new Vector2(.41f,.26f),new Vector2(.36f,.335f),new Vector2(.30f,.35f),new Vector2(.265f,.285f),new Vector2(.30f,.35f),new Vector2(.36f,.335f),new Vector2(.41f,.26f)}) {
var goal=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{point});float end=Time.realtimeSinceStartup+12;
while(Vector3.ProjectOnPlane(goal-player.transform.position,Vector3.up).magnitude>.2f) {
Assert.Less(Time.realtimeSinceStartup,end,"Barrel-side gap blocked at "+point);QueueToward(keyboard,camera,goal-player.transform.position);yield return null;
}
Assert.IsTrue((bool)type.GetProperty("InSouth").GetValue(travel));
}
var blocked=(Vector3)type.GetMethod("Ground").Invoke(travel,new object[]{new Vector2(.47f,.50f)});float attempt=Time.realtimeSinceStartup+2;
while(Time.realtimeSinceStartup<attempt) {QueueToward(keyboard,camera,blocked-player.transform.position);yield return null;}
Assert.Greater(Vector3.ProjectOnPlane(blocked-player.transform.position,Vector3.up).magnitude,.75f,"Wreck must remain blocked.");
Assert.IsTrue(Physics.Linecast(player.transform.position+Vector3.up*.5f,blocked+Vector3.up*.5f,1<<8),"Wreck needs physical collision.");
} finally {InputSystem.RemoveDevice(keyboard);InputSystem.RemoveDevice(mouse);UnityEngine.Object.Destroy(travel);}
yield return null;
}
[UnityTest] public IEnumerator UpperRoadRejectsUnsafeCameraRaysWithoutReplacingLayout() {
SceneManager.LoadScene("Ashvault");yield return null;yield return null;
var stage=Camera.main.GetComponent<LondonBackdrop>();var original=stage.Current;var position=Camera.main.transform.position;var rotation=Camera.main.transform.rotation;var projection=Camera.main.projectionMatrix;
var candidate=JsonUtility.FromJson<LondonBackdrop.Layout>(JsonUtility.ToJson(original));
candidate.height=18;candidate.distance=40;candidate.targetZ=10;candidate.fieldOfView=48;
candidate.road=new[]{new Vector2(0,0),new Vector2(1,0),new Vector2(1,1),new Vector2(0,1)};
Assert.IsFalse(stage.TryApply(JsonUtility.ToJson(candidate),out string error));Assert.AreSame(original,stage.Current);Assert.AreEqual(position,Camera.main.transform.position);Assert.Less(Quaternion.Angle(rotation,Camera.main.transform.rotation),.001f);Assert.AreEqual(projection,Camera.main.projectionMatrix);StringAssert.Contains("ground floor",error);
}
static void QueueToward(Keyboard keyboard,Camera camera,Vector3 delta) {
var f=Vector3.ProjectOnPlane(camera.transform.forward,Vector3.up).normalized;var keys=new System.Collections.Generic.List<Key>();float x=Vector3.Dot(delta,camera.transform.right),y=Vector3.Dot(delta,f);
if(x>.06f)keys.Add(Key.D);else if(x<-.06f)keys.Add(Key.A);if(y>.06f)keys.Add(Key.W);else if(y<-.06f)keys.Add(Key.S);
InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys.ToArray()));
}

[UnityTest] public IEnumerator RestartRemainsAvailableAwayFromWestminster() {
foreach(string area in new[]{"south","east"}) {
SceneManager.LoadScene("Ashvault");yield return null;yield return null;
var run=RunManager.Instance;run.enabled=false;var type=typeof(RunManager).Assembly.GetType("Ashvault.LondonTravel");var travel=Camera.main.gameObject.AddComponent(type);
var args=new object[]{Path.Combine(Application.streamingAssetsPath,"London/Travel"),null};Assert.IsTrue((bool)type.GetMethod("Initialize").Invoke(travel,args),args[1] as string);
Assert.IsTrue((bool)type.GetMethod("Switch",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(travel,new object[]{area}));
var keyboard=InputSystem.AddDevice<Keyboard>();var mouse=InputSystem.AddDevice<Mouse>();
try {InputSystem.QueueStateEvent(mouse,new MouseState{position=new Vector2(1,1)});InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.R));yield return null;yield return null;yield return new WaitForSeconds(.2f);Assert.AreNotSame(run,RunManager.Instance,"R must restart while exploring "+area);Assert.AreEqual(100,RunManager.Instance.Player.Life.current);}
finally {InputSystem.RemoveDevice(keyboard);InputSystem.RemoveDevice(mouse);if(travel)UnityEngine.Object.Destroy(travel);}
}}
}}
