using System;
using System.IO;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace Ashvault.EditorTools
{
    // Editor-only, repeatable before/after capture through the real player input path.
    public static class MotionReview
    {
        static Keyboard keyboard;
        static Mouse mouse;
        static readonly List<InputDevice> devices = new List<InputDevice>();
        static readonly List<string> samples = new List<string>();
        static Camera side;
        static RenderTexture target;
        static Texture2D image;
        static string folder;
        static int frame, lastFrame;
        static InputSettings.BackgroundBehavior background;
        static InputSettings.EditorInputBehaviorInPlayMode focus;
        public static string Status { get; private set; } = "idle";

        public static void Start(string label)
        {
            if (!EditorApplication.isPlaying || Status == "recording") throw new InvalidOperationException("Enter Play Mode first.");
            var run = RunManager.Instance;
            run.enabled = false;
            foreach (var enemy in run.Enemies.ToArray()) UnityEngine.Object.Destroy(enemy.gameObject);
            run.Enemies.Clear();
            run.Player.enabled = true;
            background = InputSystem.settings.backgroundBehavior;
            focus = InputSystem.settings.editorInputBehaviorInPlayMode;
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
            foreach (var device in InputSystem.devices) if (device.enabled) devices.Add(device);
            foreach (var device in devices) InputSystem.DisableDevice(device);
            keyboard = InputSystem.AddDevice<Keyboard>(); mouse = InputSystem.AddDevice<Mouse>();
            InputSystem.QueueStateEvent(mouse, new MouseState { position = Vector2.one });
            side = new GameObject("Review side camera").AddComponent<Camera>();
            side.CopyFrom(Camera.main); side.enabled = false; side.orthographicSize = 1.35f;
            target = new RenderTexture(640, 720, 24);
            image = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            folder = Path.GetFullPath("../artifacts/locomotion-" + label); Directory.CreateDirectory(folder);
            samples.Clear(); samples.Add("frame,time,rootX,rootY,rootZ,yaw,leftX,leftY,leftZ,rightX,rightY,rightZ");
            frame = 0; lastFrame = -1; Time.captureFramerate = 30; Time.timeScale = 1;
            Status = "recording"; EditorApplication.update += Tick;
        }

        static void Tick()
        {
            if (!EditorApplication.isPlaying) { Finish(); return; }
            if (Time.frameCount == lastFrame) return;
            lastFrame = Time.frameCount;
            try
            {
                var player = RunManager.Instance.Player;
                // Stand, straight travel, stop, restart, right turn, reverse, stop.
                Key[] keys = frame < 20 || frame >= 65 && frame < 80 || frame >= 170 ? Array.Empty<Key>() :
                    frame < 110 ? new[] { Key.W } : frame < 140 ? new[] { Key.D } : new[] { Key.A };
                InputSystem.QueueStateEvent(keyboard, new KeyboardState(keys));
                var bones = player.GetComponentsInChildren<Transform>();
                var left = Array.Find(bones, t => t.name == "Foot.L");
                var right = Array.Find(bones, t => t.name == "Foot.R");
                Vector3 p = player.transform.position, l = left.position, r = right.position;
                samples.Add(FormattableString.Invariant($"{frame},{Time.time},{p.x},{p.y},{p.z},{player.transform.eulerAngles.y},{l.x},{l.y},{l.z},{r.x},{r.y},{r.z}"));
                // Gameplay camera follows normally in RunManager.LateUpdate; run is disabled for an empty review room.
                Camera.main.transform.position = p + new Vector3(12, 22, -17);
                side.transform.position = p + new Vector3(4, 1.3f, .1f);
                side.transform.LookAt(p + Vector3.up * .95f);
                Capture(Camera.main, 0); Capture(side, 640);
                image.Apply(); File.WriteAllBytes(Path.Combine(folder, $"{frame:D4}.png"), image.EncodeToPNG());
                if (++frame >= 200) Finish();
            }
            catch (Exception e) { Status = e.ToString(); Finish(); Debug.LogException(e); }
        }

        static void Capture(Camera camera, int x)
        {
            var old = camera.targetTexture; var active = RenderTexture.active;
            camera.targetTexture = target; camera.Render(); RenderTexture.active = target;
            image.ReadPixels(new Rect(0, 0, 640, 720), x, 0, false);
            camera.targetTexture = old; RenderTexture.active = active;
        }

        static void Finish()
        {
            EditorApplication.update -= Tick;
            Time.captureFramerate = 0;
            if (keyboard != null) InputSystem.RemoveDevice(keyboard);
            if (mouse != null) InputSystem.RemoveDevice(mouse);
            foreach (var device in devices) if (device.added) InputSystem.EnableDevice(device);
            devices.Clear(); keyboard = null; mouse = null;
            InputSystem.settings.backgroundBehavior = background;
            InputSystem.settings.editorInputBehaviorInPlayMode = focus;
            if (side) UnityEngine.Object.DestroyImmediate(side.gameObject);
            if (target) { target.Release(); UnityEngine.Object.DestroyImmediate(target); }
            if (image) UnityEngine.Object.DestroyImmediate(image);
            File.WriteAllLines(Path.Combine(folder, "motion.csv"), samples);
            if (Status == "recording") Status = "completed: " + folder;
        }
    }
}
