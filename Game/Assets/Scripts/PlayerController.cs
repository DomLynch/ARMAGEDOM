using UnityEngine;
using UnityEngine.InputSystem;

namespace Ashvault
{
    [RequireComponent(typeof(CharacterController), typeof(Health))]
    public sealed class PlayerController : MonoBehaviour
    {
        public float damage = 20, speed = 4.2f;
        public int weaponLevel, armourLevel;
        public float attackReady, heavyReady, specialReady, dodgeReady;
        public Health Life { get; private set; }
        CharacterController body;
        Camera view;
        Vector3 dodgeDirection;
        float dodgeEnd, swingUntil;
        int swingVersion;
        Transform visual;
        InputAction leftClick, rightClick;

        void OnEnable()
        {
            if (leftClick == null)
            {
                leftClick = new InputAction("Slash", InputActionType.Button, "<Mouse>/leftButton");
                rightClick = new InputAction("Heavy strike", InputActionType.Button, "<Mouse>/rightButton");
            }
            leftClick.Enable(); rightClick.Enable();
        }
        void OnDisable() { leftClick?.Disable(); rightClick?.Disable(); }
        void OnDestroy() { leftClick?.Dispose(); rightClick?.Dispose(); }


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
            if (keyboard == null || mouse == null || Time.timeScale == 0) return;
            var input = new Vector2((keyboard.dKey.isPressed ? 1 : 0) - (keyboard.aKey.isPressed ? 1 : 0),
                (keyboard.wKey.isPressed ? 1 : 0) - (keyboard.sKey.isPressed ? 1 : 0));
            Vector3 forward = Vector3.ProjectOnPlane(view.transform.forward, Vector3.up).normalized;
            Vector3 move = Vector3.ClampMagnitude(view.transform.right * input.x + forward * input.y, 1);
            var ray = view.ScreenPointToRay(mouse.position.ReadValue());
            Vector3 aim = transform.forward;
            if (new Plane(Vector3.up, transform.position).Raycast(ray, out float distance))
                aim = Vector3.ProjectOnPlane(ray.GetPoint(distance) - transform.position, Vector3.up);
            bool overUI = UnityEngine.EventSystems.EventSystem.current &&
                UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
            bool left = (mouse.leftButton.isPressed || leftClick.WasPressedThisFrame()) && !overUI;
            int attack = keyboard.digit1Key.wasPressedThisFrame ? 2 :
                keyboard.qKey.wasPressedThisFrame || (mouse.rightButton.isPressed || rightClick.WasPressedThisFrame()) && !overUI ? 1 : left ? 0 : -1;
            if (keyboard.spaceKey.wasPressedThisFrame) TryDodge(move);
            bool dodging = Time.time < dodgeEnd;
            bool swinging = Time.time < swingUntil;
            Vector3 facing = dodging ? dodgeDirection : swinging ? transform.forward : attack >= 0 ? aim : move;
            if (facing.sqrMagnitude > .001f)
            {
                var rotation = Quaternion.LookRotation(facing);
                // Attack sectors must face their target on the exact damage frame.
                transform.rotation = attack >= 0 ? rotation : Quaternion.RotateTowards(transform.rotation, rotation, 900 * Time.deltaTime);
            }
            body.Move(((dodging ? dodgeDirection * 16 : move * speed * (swinging ? 0 : 1)) + Vector3.down * 8) * Time.deltaTime);
            if (visual)
            {
                visual.localPosition = new Vector3(0, dodging ? .1f : 0, 0);
                visual.localRotation = Quaternion.Euler(dodging ? 35 : 0, 0, 0);
            }
            if (!dodging && attack >= 0) TryAttack(attack);
        }

        public bool TryDodge(Vector3 direction)
        {
            if (Life.Dead || RunManager.Instance.Finished || Time.time < dodgeReady) return false;
            swingVersion++; swingUntil = 0;
            GetComponent<ArtMotion>()?.CancelSwing();
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
            float windup = kind == 0 ? .14f : kind == 1 ? .26f : .20f;
            float recovery = kind == 0 ? .28f : .38f;
            GetComponent<ArtMotion>()?.Swing(windup, recovery);
            swingUntil = attackReady = Time.time + windup + recovery;
            if (kind == 1) heavyReady = Time.time + 1.6f;
            if (kind == 2) specialReady = Time.time + 7;
            StartCoroutine(Strike(++swingVersion, windup, kind, range, angle, amount, transform.forward));
            return true;
        }

        System.Collections.IEnumerator Strike(int version, float windup, int kind, float range, float angle, float amount, Vector3 direction)
        {
            yield return new WaitForSeconds(windup);
            if (version != swingVersion || Life.Dead || RunManager.Instance.Finished) yield break;
            if (kind == 2) CombatEffect.Ring(transform.position, range, new Color(.25f, .8f, 1), .16f);
            foreach (var enemy in RunManager.Instance.Enemies.ToArray())
            {
                if (!enemy || enemy.Life.Dead) continue;
                Vector3 offset = enemy.transform.position - transform.position;
                offset.y = 0;
                if (offset.magnitude > range || Vector3.Angle(direction, offset) > angle / 2) continue;
                if (Physics.Linecast(transform.position + Vector3.up, enemy.transform.position + Vector3.up, 1 << 8)) continue;
                if (enemy.Life.Hit(amount)) enemy.Stagger(offset.normalized, kind == 0 ? .10f : .3f);
            }
        }
    }
}
