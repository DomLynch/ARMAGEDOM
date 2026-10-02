using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.InputSystem;

namespace Ashvault
{
    public sealed class RunManager : MonoBehaviour
    {
        public static RunManager Instance { get; private set; }
        public PlayerController Player { get; private set; }
        public readonly List<EnemyController> Enemies = new List<EnemyController>();
        public bool Finished { get; private set; }
        public bool Won { get; private set; }
        public int Wave { get; private set; }
        public float Started { get; private set; }
        public string Message { get; private set; }
        public float MessageUntil { get; private set; }
        public EnemyController Boss { get; private set; }
        float nextWave;
        int kills;
        Transform cameraTransform;
        Vector3 cameraVelocity;
        readonly Vector3 cameraOffset = new Vector3(12, 22, -17);

        void Awake() => Instance = this;

        void Start()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 1;
            ArenaBuilder.Build();
            Player = ArenaBuilder.Actor("Warden", new Vector3(0, 0, -6), -1).AddComponent<PlayerController>();
            var cameraObject = new GameObject("Isometric camera", typeof(Camera), typeof(AudioListener));
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.GetComponent<Camera>();
            cameraObject.AddComponent<HeroView>();
            camera.orthographic = true;
            camera.orthographicSize = 5.7f;
            camera.nearClipPlane = .1f;
            camera.farClipPlane = 160;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.025f, .035f, .05f);
            cameraTransform = cameraObject.transform;
            cameraTransform.rotation = Quaternion.LookRotation(-cameraOffset);
            cameraTransform.position = Player.transform.position + cameraOffset;
            Started = Time.time;
            nextWave = Time.time + 2;
            Notify("Move to enter combat. Revenants, orcs and warlocks guard the Outer Watch.");
            gameObject.AddComponent<SimpleHUD>();
            Debug.Log("ASHVAULT_READY: one arena, player and camera created.");
        }

        void Update()
        {
            if (Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame) Restart();
            if (Finished) return;
            if (Wave == 0 && Player.attackReady == 0 && Player.dodgeReady == 0 &&
                Vector3.Distance(Player.transform.position, new Vector3(0, 0, -6)) < 1) return;
            if (Enemies.Count != 0 || Time.time < nextWave) return;
            if (Wave >= 3) { End(true); return; }
            SpawnWave();
        }

        void LateUpdate()
        {
            if (Player && cameraTransform) cameraTransform.position = Vector3.SmoothDamp(cameraTransform.position,
                Player.transform.position + cameraOffset, ref cameraVelocity, .16f);
        }

        void SpawnWave()
        {
            Wave++;
            int count = Wave == 3 ? 1 : 4 + Wave;
            for (int i = 0; i < count; i++)
            {
                int kind = Wave == 3 ? 3 : i % 3;
                float x = count == 1 ? 0 : (i % 5 - 2) * 2.7f;
                Vector3 position = new Vector3(x, 0, 2 + (i / 5) * 3);
                var go = ArenaBuilder.Actor(kind == 3 ? "Orc Warlord" : kind == 1 ? "Orc Executioner" : kind == 2 ? "Plague Warlock" : "Ash Revenant", position, kind);
                var enemy = go.AddComponent<EnemyController>();
                enemy.kind = kind;
                float hp = kind == 3 ? 400 : kind == 1 ? 95 : kind == 2 ? 50 : 55;
                enemy.Life.maximum = enemy.Life.current = hp;
                Enemies.Add(enemy);
                if (kind == 3) Boss = enemy;
            }
            Notify(Wave == 3 ? "ORC WARLORD  ·  Dodge, then strike." : "THE OUTER WATCH  ·  Wave " + Wave + " / 3");
        }

        public void EnemyDied(EnemyController enemy)
        {
            Enemies.Remove(enemy);
            kills++;
            if (enemy.IsBoss) { End(true); return; }
            // Deterministic cadence keeps a short prototype run from being spoiled by drop RNG.
            if (kills % 2 == 0)
            {
                int kind = (kills / 2 - 1) % 3;
                var go = ArenaBuilder.Shape("Upgrade", PrimitiveType.Cube, enemy.transform.position + Vector3.up * .55f,
                    Vector3.one * .42f, kind == 0 ? ArenaBuilder.Gold : kind == 1 ? ArenaBuilder.Teal : ArenaBuilder.Heal, null, false);
                var loot = go.AddComponent<LootPickup>();
                loot.kind = kind;
                loot.tier = Mathf.Min(2, Wave - 1);
            }
            if (Enemies.Count == 0) { Player.Life.Heal(25); nextWave = Time.time + 4; Notify("WAVE CLEARED  ·  +25 HP"); }
        }

        public void Notify(string text) { Message = text; MessageUntil = Time.time + 4; }
        public void End(bool won) { Finished = true; Won = won; }
        public void Restart() => SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}
