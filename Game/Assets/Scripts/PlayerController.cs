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
        float dodgeEnd, blockedTime;
        Vector3 destination;
        bool travelling;
        EnemyController target;
        Transform visual;
        InputAction leftClick, rightClick;

        void OnEnable()
        {
            if (leftClick == null)
            {
                leftClick = new InputAction("Move or slash", InputActionType.Button, "<Mouse>/leftButton");
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
            bool shift = keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed;
            bool overUI = UnityEngine.EventSystems.EventSystem.current &&
                UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
            bool left = (mouse.leftButton.isPressed || leftClick.WasPressedThisFrame()) && !overUI;
            int attack = keyboard.digit1Key.wasPressedThisFrame ? 2 :
                (mouse.rightButton.isPressed || rightClick.WasPressedThisFrame()) && !overUI ? 1 : shift && left ? 0 : -1;
            if (move.sqrMagnitude > .01f || attack >= 0) CancelTravel();
            else if (left && !shift && (leftClick.WasPressedThisFrame() || !target))
            {
                if (Physics.Raycast(ray, out var hit, 200, ~0, QueryTriggerInteraction.Ignore))
                {
                    var enemy = hit.collider.GetComponentInParent<EnemyController>();
                    if (enemy && !enemy.Life.Dead)
                    {
                        target = enemy; travelling = true; blockedTime = 0;
                    }
                    else if (hit.normal.y > .7f && Mathf.Abs(hit.point.y - transform.position.y) < .5f)
                    {
                        destination = hit.point; target = null; travelling = true;
                    }
                }
            }
            if (travelling)
            {
                if (target) destination = target.transform.position;
                Vector3 offset = Vector3.ProjectOnPlane(destination - transform.position, Vector3.up);
                bool clear = !Physics.Linecast(transform.position + Vector3.up, destination + Vector3.up, 1 << 8);
                if (target && !target.Life.Dead && offset.magnitude <= 2.2f && clear)
                {
                    aim = offset; attack = 0;
                }
                else if (offset.magnitude <= .15f) CancelTravel();
                else move = offset.normalized * Mathf.Min(1, offset.magnitude / Mathf.Max(speed * Time.deltaTime, .001f));
            }
            if (keyboard.spaceKey.wasPressedThisFrame) TryDodge(move);
            bool dodging = Time.time < dodgeEnd;
            Vector3 facing = dodging ? dodgeDirection : attack >= 0 ? aim : move;
            if (facing.sqrMagnitude > .001f)
            {
                var rotation = Quaternion.LookRotation(facing);
                // Attack sectors must face their target on the exact damage frame.
                transform.rotation = attack >= 0 ? rotation : Quaternion.RotateTowards(transform.rotation, rotation, 900 * Time.deltaTime);
            }
            Vector3 before = transform.position;
            body.Move(((dodging ? dodgeDirection * 16 : move * speed) + Vector3.down * 8) * Time.deltaTime);
            if (travelling && !dodging && move.sqrMagnitude > .01f)
            {
                float moved = Vector3.ProjectOnPlane(transform.position - before, Vector3.up).magnitude;
                blockedTime = moved < speed * Time.deltaTime * .1f ? blockedTime + Time.deltaTime : 0;
                if (blockedTime > .4f) CancelTravel();
            }
            if (visual)
            {
                visual.localPosition = new Vector3(0, dodging ? .1f : 0, 0);
                visual.localRotation = Quaternion.Euler(dodging ? 35 : 0, 0, 0);
            }
            if (!dodging && attack >= 0) TryAttack(attack);
        }

        void CancelTravel() { travelling = false; target = null; blockedTime = 0; }

        public bool TryDodge(Vector3 direction)
        {
            if (Life.Dead || RunManager.Instance.Finished || Time.time < dodgeReady) return false;
            CancelTravel();
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
            if (kind == 2) CombatEffect.Ring(transform.position, range, new Color(.25f, .8f, 1), .16f);
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
