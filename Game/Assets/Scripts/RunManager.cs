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
        public int Chamber { get; private set; }
        public int Wave { get; private set; }
        public float Started { get; private set; }
        public string Message { get; private set; }
        public float MessageUntil { get; private set; }
        public EnemyController Boss { get; private set; }
        public readonly string[] Names = { "THE OUTER WATCH", "EMBER GALLERY", "HALL OF ASH", "THE CROWNLESS" };
        float nextWave;
        int kills;
        bool chamberCleared;
        Transform cameraTransform;
        Vector3 cameraVelocity;
        readonly Vector3 cameraOffset = new Vector3(12, 22, -17);
        readonly List<GameObject> gates = new List<GameObject>();

        void Awake() => Instance = this;

        void Start()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 1;
            ArenaBuilder.Build(gates);
            Player = ArenaBuilder.Actor("Warden", new Vector3(0, 0, -6), -1).AddComponent<PlayerController>();
            var cameraObject = new GameObject("Isometric camera", typeof(Camera), typeof(AudioListener));
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.GetComponent<Camera>();
            cameraObject.AddComponent<HeroView>();
            camera.orthographic = true;
            camera.orthographicSize = 6.8f;
            camera.nearClipPlane = .1f;
            camera.farClipPlane = 160;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.025f, .035f, .05f);
            cameraTransform = cameraObject.transform;
            cameraTransform.rotation = Quaternion.LookRotation(-cameraOffset);
            cameraTransform.position = Player.transform.position + cameraOffset;
            Started = Time.time;
            nextWave = Time.time + 2;
            Notify("Move to enter the ruins. Clear each chamber and advance north.");
            gameObject.AddComponent<SimpleHUD>();
            Debug.Log("ASHVAULT_READY: four chambers, player and camera created.");
        }

        void Update()
        {
            if (Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame) Restart();
            if (Finished) return;
            if (Chamber == 0 && Wave == 0 && Player.attackReady == 0 && Player.dodgeReady == 0 &&
                Vector3.Distance(Player.transform.position, new Vector3(0, 0, -6)) < 1) return;
            if (chamberCleared)
            {
                if (Chamber < 3 && Player.transform.position.z > Chamber * 24 + 14)
                {
                    Chamber++;
                    Wave = 0;
                    chamberCleared = false;
                    nextWave = Time.time + 1;
                    Notify(Names[Chamber]);
                }
                return;
            }
            if (Enemies.Count != 0 || Time.time < nextWave) return;
            int waves = Chamber == 3 ? 1 : Chamber == 0 ? 2 : 3;
            if (Wave >= waves)
            {
                chamberCleared = true;
                if (Chamber < gates.Count) gates[Chamber].SetActive(false);
                Player.Life.Heal(25);
                Notify("CHAMBER CLEARED  ·  +25 HP  ·  Continue north");
                return;
            }
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
            int count = Chamber == 3 ? 1 : 4 + Chamber * 2 + Wave;
            for (int i = 0; i < count; i++)
            {
                int kind = Chamber == 3 ? 3 : Chamber == 0 && Wave == 1 ? 0 : (i + Wave) % 3;
                float x = count == 1 ? 0 : (i % 5 - 2) * 2.7f;
                Vector3 position = new Vector3(x, 0, Chamber * 24 + 3 + (i / 5) * 3);
                var go = ArenaBuilder.Actor(kind == 3 ? "The Crownless" : kind == 1 ? "Ogre" : kind == 2 ? "Warlock" : i % 2 == 0 ? "Goblin" : "Orc raider", position, kind);
                var enemy = go.AddComponent<EnemyController>();
                enemy.kind = kind;
                float hp = (kind == 3 ? 1600 : kind == 1 ? 190 : kind == 2 ? 80 : 90) * (kind == 3 ? 1 : 1 + Chamber * .25f);
                enemy.Life.maximum = enemy.Life.current = hp;
                Enemies.Add(enemy);
                if (kind == 3) Boss = enemy;
            }
            Notify(Chamber == 3 ? "THE CROWNLESS  ·  Watch the ground. Strike during recovery." : Names[Chamber] + "  ·  Wave " + Wave);
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
                loot.tier = Mathf.Min(2, Chamber);
            }
            if (Enemies.Count == 0) nextWave = Time.time + 3;
        }

        public void Notify(string text) { Message = text; MessageUntil = Time.time + 4; }
        public void End(bool won) { Finished = true; Won = won; }
        public void Restart() => SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}
