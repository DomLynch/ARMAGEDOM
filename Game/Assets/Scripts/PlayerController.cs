using UnityEngine;
using UnityEngine.InputSystem;

namespace Ashvault
{
    [RequireComponent(typeof(CharacterController), typeof(Health))]
    public sealed class PlayerController : MonoBehaviour
    {
        public float damage = 20, speed = 6;
        public int weaponLevel, armourLevel;
        public float attackReady, heavyReady, specialReady, dodgeReady;
        public Health Life { get; private set; }
        CharacterController body;
        Camera view;
        Vector3 dodgeDirection;
        float dodgeEnd;
        Transform visual;

        void Awake()
        {
            body = GetComponent<CharacterController>();
            Life = GetComponent<Health>();
            Life.player = true;
        }

        void Start()
        {
            view = Camera.main;
            visual = transform.Find("Visual");
        }

        void Update()
        {
            if (RunManager.Instance.Finished) return;
            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            if (keyboard == null || mouse == null) return;
            var input = new Vector2((keyboard.dKey.isPressed ? 1 : 0) - (keyboard.aKey.isPressed ? 1 : 0),
                (keyboard.wKey.isPressed ? 1 : 0) - (keyboard.sKey.isPressed ? 1 : 0));
            Vector3 forward = Vector3.ProjectOnPlane(view.transform.forward, Vector3.up).normalized;
            Vector3 move = Vector3.ClampMagnitude(view.transform.right * input.x + forward * input.y, 1);
            var ray = view.ScreenPointToRay(mouse.position.ReadValue());
            if (new Plane(Vector3.up, transform.position).Raycast(ray, out float distance))
            {
                Vector3 aim = ray.GetPoint(distance) - transform.position;
                aim.y = 0;
                if (aim.sqrMagnitude > .05f) transform.rotation = Quaternion.LookRotation(aim);
            }
            if (keyboard.spaceKey.wasPressedThisFrame) TryDodge(move);
            bool dodging = Time.time < dodgeEnd;
            body.Move(((dodging ? dodgeDirection * 16 : move * speed) + Vector3.down * 8) * Time.deltaTime);
            if (visual)
            {
                visual.localPosition = new Vector3(0, dodging ? .1f : Mathf.Sin(Time.time * 15) * move.magnitude * .045f, 0);
                visual.localRotation = Quaternion.Euler(dodging ? 35 : 0, 0, 0);
            }
            if (dodging) return;
            if (keyboard.digit1Key.wasPressedThisFrame) TryAttack(2);
            else if (mouse.rightButton.isPressed) TryAttack(1);
            else if (mouse.leftButton.isPressed) TryAttack(0);
        }

        public bool TryDodge(Vector3 direction)
        {
            if (Life.Dead || RunManager.Instance.Finished || Time.time < dodgeReady) return false;
            dodgeDirection = direction.sqrMagnitude > .01f ? direction.normalized : transform.forward;
            dodgeEnd = Time.time + .22f;
            Life.invulnerableUntil = Time.time + .25f;
            dodgeReady = Time.time + 1.05f;
            CombatEffect.Ring(transform.position, .7f, new Color(.25f, .85f, 1), .25f);
            return true;
        }

        // A single sector query is shared by all three attacks; one hit per enemy.
        public bool TryAttack(int kind)
        {
            if (Life.Dead || RunManager.Instance.Finished || Time.time < attackReady || Time.time < dodgeEnd) return false;
            if (kind == 1 && Time.time < heavyReady || kind == 2 && Time.time < specialReady) return false;
            float range = kind == 2 ? 4.2f : kind == 1 ? 3.2f : 2.6f;
            float angle = kind == 2 ? 360 : kind == 1 ? 130 : 100;
            float amount = damage * (kind == 2 ? 2.2f : kind == 1 ? 2.1f : 1);
            GetComponent<ArtMotion>()?.Swing();
            attackReady = Time.time + (kind == 0 ? .32f : .55f);
            if (kind == 1) heavyReady = Time.time + 1.6f;
            if (kind == 2) specialReady = Time.time + 7;
            CombatEffect.Sector(transform.position, transform.forward, range, angle,
                kind == 2 ? new Color(.25f, .8f, 1) : new Color(1, .8f, .35f), .16f);
            foreach (var enemy in RunManager.Instance.Enemies.ToArray())
            {
                if (!enemy || enemy.Life.Dead) continue;
                Vector3 offset = enemy.transform.position - transform.position;
                offset.y = 0;
                if (offset.magnitude > range || Vector3.Angle(transform.forward, offset) > angle / 2) continue;
                if (Physics.Linecast(transform.position + Vector3.up, enemy.transform.position + Vector3.up, 1 << 8)) continue;
                if (enemy.Life.Hit(amount)) enemy.Stagger(offset.normalized, kind == 0 ? .10f : .3f);
            }
            return true;
        }
    }
}
