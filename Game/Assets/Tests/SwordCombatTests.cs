using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace Ashvault.Tests {
public partial class RunTests {
    Keyboard swordKeyboard; Mouse swordMouse;
    void SwordInput() {
        run.enabled=false; run.Player.enabled=true; run.Player.transform.rotation=Quaternion.identity;
        swordKeyboard=InputSystem.AddDevice<Keyboard>(); swordMouse=InputSystem.AddDevice<Mouse>();
        InputSystem.QueueStateEvent(swordMouse,new MouseState{position=Camera.main.WorldToScreenPoint(run.Player.transform.position+Vector3.forward*4)});
    }
    [TearDown] public void RemoveSwordInput() {
        if(swordKeyboard!=null && swordKeyboard.added)InputSystem.RemoveDevice(swordKeyboard);
        if(swordMouse!=null && swordMouse.added)InputSystem.RemoveDevice(swordMouse);
        swordKeyboard=null;swordMouse=null;
    }
    EnemyController SwordTarget(Vector3 offset) {
        var enemy=ArenaBuilder.Actor("Sword review target",run.Player.transform.position+offset,0).AddComponent<EnemyController>();
        enemy.enabled=false;run.Enemies.Add(enemy);return enemy;
    }
    void StartSwordEnemyStrike(EnemyController enemy) {
        enemy.enabled=true;
        var direction=Vector3.ProjectOnPlane(run.Player.transform.position-enemy.transform.position,Vector3.up).normalized;
        enemy.transform.rotation=Quaternion.LookRotation(direction);
        typeof(EnemyController).GetMethod("BeginAttack",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).Invoke(enemy,new object[]{direction});
    }
    [UnityTest] public IEnumerator SwordSecondaryReachesForwardWithoutCleavingSide() {
        SwordInput();var reach=SwordTarget(Vector3.forward*2.9f);var side=SwordTarget(Vector3.forward*2+Vector3.right*.9f);
        yield return null;
        InputSystem.QueueStateEvent(swordMouse,new MouseState{position=Camera.main.WorldToScreenPoint(reach.transform.position)}.WithButton(MouseButton.Right));
        yield return null;InputSystem.QueueStateEvent(swordMouse,new MouseState{position=Camera.main.WorldToScreenPoint(reach.transform.position)});
        yield return new WaitForSeconds(.35f);
        Assert.AreEqual(76,reach.Life.current,"RMB must perform the reaching24damage stab, not heavy.");
        Assert.AreEqual(100,side.Life.current,"A narrow stab must not cleave a target to the side.");
        Assert.AreEqual(0,run.Player.heavyReady,"Normal stab must not consume heavy cooldown.");
    }
    [UnityTest] public IEnumerator SwordGuardReducesFrontalHitButExposesRearAndBolts() {
        SwordInput();var front=SwordTarget(Vector3.forward*1.3f);var rear=SwordTarget(Vector3.back*1.3f);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.3f);
        StartSwordEnemyStrike(front);yield return new WaitForSeconds(.45f);front.enabled=false;
        float hp=run.Player.Life.current;
        Assert.Greater(hp,91,"Held F must reduce the eligible frontal strike.");Assert.Less(hp,100,"Ordinary block still allows bounded chip damage.");
        StartSwordEnemyStrike(rear);yield return new WaitForSeconds(.45f);rear.enabled=false;
        Assert.That(hp-run.Player.Life.current,Is.EqualTo(9).Within(.01f),"Rear strike bypasses frontal guard.");
        hp=run.Player.Life.current;CombatEffect.Bolt(run.Player.transform.position+Vector3.forward*2,Vector3.back,12);
        yield return new WaitForSeconds(.35f);
        Assert.That(hp-run.Player.Life.current,Is.EqualTo(12).Within(.01f),"Sword guard must not block an ineligible projectile.");
    }
    [UnityTest] public IEnumerator SwordFreshTimedGuardParriesAndStopsImmediateFollowup() {
        SwordInput();var enemy=SwordTarget(Vector3.forward*1.3f);yield return null;
        StartSwordEnemyStrike(enemy);yield return new WaitForSeconds(.30f);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.15f);enemy.enabled=false;
        Assert.AreEqual(100,run.Player.Life.current,"A fresh F just before contact must parry the eligible melee strike.");
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState());enemy.enabled=true;
        yield return new WaitForSeconds(.6f);enemy.enabled=false;
        Assert.AreEqual(100,run.Player.Life.current,"A parried attacker must have punishable recovery, not immediately strike again.");
    }
    [UnityTest] public IEnumerator SwordHoldingGuardDoesNotRefreshParryWindow() {
        SwordInput();var enemy=SwordTarget(Vector3.forward*1.3f);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.3f);
        StartSwordEnemyStrike(enemy);yield return new WaitForSeconds(.45f);enemy.enabled=false;
        Assert.Less(run.Player.Life.current,100,"Holding F cannot refresh perfect parry every frame.");
        Assert.Greater(run.Player.Life.current,91,"An expired parry becomes an ordinary block.");
    }
    [UnityTest] public IEnumerator SwordRepeatedBlocksBreakGuardAndReleaseRestoresIt() {
        SwordInput();var enemy=SwordTarget(Vector3.forward*1.3f);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.3f);
        for(int i=0;i<3;i++){StartSwordEnemyStrike(enemy);yield return new WaitForSeconds(.45f);enemy.enabled=false;}
        float hp=run.Player.Life.current;
        StartSwordEnemyStrike(enemy);yield return new WaitForSeconds(.45f);enemy.enabled=false;
        Assert.That(hp-run.Player.Life.current,Is.EqualTo(9).Within(.01f),"Insufficient guard capacity must expose the player.");
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState());yield return new WaitForSeconds(3);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.3f);hp=run.Player.Life.current;
        StartSwordEnemyStrike(enemy);yield return new WaitForSeconds(.45f);enemy.enabled=false;
        Assert.Greater(run.Player.Life.current,hp-9,"Releasing guard permits capacity recovery.");
    }
    [UnityTest] public IEnumerator SwordThrustAndGuardMoveWeaponArmWithoutStretchOrAccumulation() {
        SwordInput();yield return null;
        var bones=run.Player.GetComponentsInChildren<Transform>();
        var upper=System.Array.Find(bones,b=>b.name=="UpperArm.R");
        var elbow=System.Array.Find(bones,b=>b.name=="Forearm.R");
        var hand=System.Array.Find(bones,b=>b.name=="Hand.R");
        Vector3 idle=hand.position;float upperLength=Vector3.Distance(upper.position,elbow.position),lowerLength=Vector3.Distance(elbow.position,hand.position);
        Assert.IsTrue(run.Player.TryAttack(3));yield return new WaitForSeconds(.13f);
        Vector3 thrust=hand.position-run.Player.transform.position;
        Assert.Greater(Vector3.Dot(hand.position-idle,run.Player.transform.forward),.25f,"Stab must visibly extend forward, not replay the slash pose.");
        Assert.That(Vector3.Distance(upper.position,elbow.position),Is.EqualTo(upperLength).Within(.001f));
        Assert.That(Vector3.Distance(elbow.position,hand.position),Is.EqualTo(lowerLength).Within(.001f));
        yield return new WaitForSeconds(.5f);
        Assert.Less(Vector3.Distance(hand.position,idle),.12f,"Thrust must settle back to sampled idle.");
        Assert.IsTrue(run.Player.TryAttack(0));yield return new WaitForSeconds(.15f);
        Assert.Greater(Vector3.Distance(hand.position-run.Player.transform.position,thrust),.15f,"Slash and thrust must have visibly different arm poses at contact.");
        yield return new WaitForSeconds(.5f);
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState(Key.F));yield return new WaitForSeconds(.2f);
        Assert.Greater(hand.position.y-idle.y,.30f,"Guard must visibly raise the hilt.");
        Vector3 held=hand.position;yield return new WaitForSeconds(.6f);
        Assert.Less(Vector3.Distance(hand.position,held),.10f,"Held guard offsets must not accumulate across frames.");
        InputSystem.QueueStateEvent(swordKeyboard,new KeyboardState());yield return new WaitForSeconds(.3f);
        Assert.Less(Vector3.Distance(hand.position,idle),.12f,"Guard release restores the original sampled pose.");
    }
}
}
