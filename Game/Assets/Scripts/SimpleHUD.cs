using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;

namespace Ashvault
{
    public sealed class SimpleHUD : MonoBehaviour
    {
        TextMeshProUGUI status, healthLabel, stats, controls, notice, ending;
        UnityEngine.UI.Image hp, bossHP;
        GameObject bossPanel, endPanel;
        readonly Color gold = new Color(.88f, .73f, .44f);
        readonly Color panel = new Color(.025f, .04f, .06f, .94f);

        RectTransform Rect(string name, Transform parent, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.anchorMin = rect.anchorMax = rect.pivot = anchor;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            return rect;
        }

        UnityEngine.UI.Image Panel(RectTransform rect, Color color)
        {
            var image = rect.gameObject.AddComponent<UnityEngine.UI.Image>();
            image.color = color;
            image.raycastTarget = false;
            return image;
        }

        TextMeshProUGUI Label(string text, Transform parent, Vector2 position, Vector2 size, int fontSize = 16)
        {
            var label = Rect("Label", parent, new Vector2(0, 1), position, size).gameObject.AddComponent<TextMeshProUGUI>();
            label.font = Resources.Load<TMP_FontAsset>("Fonts & Materials/LiberationSans SDF");
            label.fontSize = fontSize;
            label.color = new Color(.88f, .9f, .91f);
            label.text = text;
            label.raycastTarget = false;
            return label;
        }

        UnityEngine.UI.Image Bar(Transform parent, Vector2 position, float width, Color color)
        {
            var back = Rect("Health track", parent, new Vector2(0, 1), position, new Vector2(width, 12));
            Panel(back, new Color(.15f, .17f, .2f));
            return Panel(Rect("Health fill", back, new Vector2(0, 1), Vector2.zero, new Vector2(width, 12)), color);
        }

        void Start()
        {
            var canvas = new GameObject("HUD", typeof(Canvas), typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 800);
            scaler.matchWidthOrHeight = .5f;
            new GameObject("Input events", typeof(EventSystem), typeof(InputSystemUIInputModule));
            var header = Rect("Chamber", canvas.transform, new Vector2(0, 1), new Vector2(24, -22), new Vector2(335, 118));
            Panel(header, panel);
            Label("ASHVAULT", header, new Vector2(16, -9), new Vector2(310, 40), 30).color = gold;
            status = Label("", header, new Vector2(17, -52), new Vector2(310, 62), 15);
            var player = Rect("Warden", canvas.transform, Vector2.zero, new Vector2(24, 24), new Vector2(354, 128));
            Panel(player, panel);
            healthLabel = Label("", player, new Vector2(16, -12), new Vector2(324, 30), 16);
            stats = Label("", player, new Vector2(16, -64), new Vector2(324, 54), 16);
            hp = Bar(player, new Vector2(16, -43), 320, new Color(.70f, .22f, .23f));
            var help = Rect("Controls", canvas.transform, new Vector2(1, 0), new Vector2(-24, 24), new Vector2(442, 128));
            Panel(help, panel);
            controls = Label("", help, new Vector2(16, -12), new Vector2(414, 108), 15);
            var message = Rect("Notice", canvas.transform, new Vector2(.5f, 1), new Vector2(0, -157), new Vector2(820, 48));
            notice = Label("", message, Vector2.zero, new Vector2(820, 48), 18);
            notice.alignment = TextAlignmentOptions.Center;
            var boss = Rect("Boss", canvas.transform, new Vector2(.5f, 1), new Vector2(70, -26), new Vector2(430, 70));
            bossPanel = boss.gameObject;
            Label("ORC WARLORD", boss, Vector2.zero, new Vector2(430, 28), 19).alignment = TextAlignmentOptions.Center;
            bossHP = Bar(boss, new Vector2(0, -35), 430, new Color(.7f, .28f, .14f));
            var end = Rect("Run outcome", canvas.transform, new Vector2(.5f, .5f), Vector2.zero, new Vector2(780, 300));
            endPanel = end.gameObject;
            Panel(end, panel);
            ending = Label("", end, new Vector2(25, -44), new Vector2(730, 130), 32);
            ending.alignment = TextAlignmentOptions.Center;
            ending.color = gold;
            var restart = Rect("Restart", end, new Vector2(.5f, 0), new Vector2(0, 35), new Vector2(250, 48));
            var background = Panel(restart, new Color(.16f, .32f, .35f));
            background.raycastTarget = true;
            var button = restart.gameObject.AddComponent<UnityEngine.UI.Button>();
            button.targetGraphic = background;
            button.onClick.AddListener(() => RunManager.Instance.Restart());
            Label("Run again  [R]", restart, new Vector2(0, -10), new Vector2(250, 35), 20).alignment = TextAlignmentOptions.Center;
            endPanel.SetActive(false);
        }

        void Update()
        {
            var run = RunManager.Instance;
            var player = run.Player;
            status.text = "THE OUTER WATCH  ·  3 WAVES\nHostiles: " + run.Enemies.Count + "    Wave: " + run.Wave;
            healthLabel.text = "WARDEN   " + Mathf.CeilToInt(player.Life.current) + " / " + player.Life.maximum + " HP";
            stats.text = "Damage " + Mathf.RoundToInt(player.damage) + " · Sword " + player.weaponLevel + " · Armour " + player.armourLevel + "\nGold: sword · Cyan: armour · Green: tonic";
            hp.rectTransform.sizeDelta = new Vector2(320 * player.Life.current / player.Life.maximum, 12);
            controls.text = "LMB move / attack enemy · WASD move\nShift+LMB slash · RMB heavy " + Ready(player.heavyReady) + "\nSPACE dodge " + Ready(player.dodgeReady) + " · 1 shockwave " + Ready(player.specialReady) + " · R restart\nV inspect hero · Scroll zoom. Walk over loot.";
            notice.text = Time.time < run.MessageUntil ? run.Message : "";
            bossPanel.SetActive(run.Boss && !run.Boss.Life.Dead);
            if (run.Boss) bossHP.rectTransform.sizeDelta = new Vector2(430 * run.Boss.Life.current / run.Boss.Life.maximum, 12);
            endPanel.SetActive(run.Finished);
            if (run.Finished) ending.text = run.Won ? "THE VAULT IS SILENT\n<size=20>The warlord has fallen.</size>" : "THE ASH CLAIMS YOU\n<size=20>Dodge the red outlines. Strike after the attack.</size>";
        }

        string Ready(float time) => time <= Time.time ? "[ready]" : "[" + (time - Time.time).ToString("0.0") + "s]";
    }
}
