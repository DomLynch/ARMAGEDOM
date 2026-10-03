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
        public bool Dodging => Time.time < dodgeEnd;
        public CombatKit Kit = CombatKit.Sword;
        public AttackDefinition Special = CombatKit.Shockwave;
        public DefenceDefinition Defence = DefenceDefinition.Sword;
        public bool Guarding { get; private set; }
        public float GuardCapacity => guardCharge;
        public bool GuardBroken => Time.time < guardBrokenUntil;
        float guardCharge = 100, parryUntil, guardBrokenUntil, guardRecoverAt;
        CharacterController body;
        Camera view;
        Vector3 dodgeDirection, travelVelocity;
        float dodgeEnd, swingUntil;
        int swingVersion;
        int bufferedAttack = -1;
        float bufferedUntil;
        Vector3 bufferedAim;
        Transform visual;
        InputAction leftClick, rightClick;

        void OnEnable()
        {
            if (leftClick == null)
            {
                leftClick = new InputAction("Slash", InputActionType.Button, "<Mouse>/leftButton");
                rightClick = new InputAction("Secondary attack", InputActionType.Button, "<Mouse>/rightButton");
            }
            leftClick.Enable(); rightClick.Enable();
        }
        void OnDisable() { leftClick?.Disable(); rightClick?.Disable(); travelVelocity = Vector3.zero; bufferedAttack = -1; Guarding = false; parryUntil = 0; }
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
            int attack = keyboard.eKey.wasPressedThisFrame || keyboard.digit1Key.wasPressedThisFrame ? 2 :
                keyboard.qKey.wasPressedThisFrame ? 1 :
                (mouse.rightButton.isPressed || rightClick.WasPressedThisFrame()) && !overUI ? 3 : left ? 0 : -1;
            if (keyboard.spaceKey.wasPressedThisFrame) TryDodge(move);
            bool dodging = Time.time < dodgeEnd;
            bool swinging = Time.time < swingUntil;
            bool heldGuard = keyboard.fKey.isPressed;
            guardCharge = Mathf.Clamp(guardCharge, 0, Defence.capacity);
            Guarding = heldGuard && !dodging && !swinging && !GuardBroken && Defence.capacity > 0 && guardCharge > 0;
            if (Guarding && keyboard.fKey.wasPressedThisFrame) parryUntil = Time.time + Defence.parryWindow;
            if (!Guarding) parryUntil = 0;
            if (!heldGuard && Time.time >= guardRecoverAt && !GuardBroken)
                guardCharge = Mathf.MoveTowards(guardCharge, Defence.capacity, Defence.recovery * Time.deltaTime);
            if (Time.time > bufferedUntil) bufferedAttack = -1;
            bool pressed = attack == 2 ? keyboard.eKey.wasPressedThisFrame || keyboard.digit1Key.wasPressedThisFrame :
                attack == 1 ? keyboard.qKey.wasPressedThisFrame :
                attack == 3 ? !overUI && rightClick.WasPressedThisFrame() :
                attack == 0 && !overUI && leftClick.WasPressedThisFrame();
            bool fresh = pressed && attack >= 0 && (attack != 1 || Time.time >= heavyReady) &&
                (attack != 2 || Time.time >= specialReady);
            // Remember one fresh tap at the end of recovery, never an entire cooldown.
            if (!dodging && fresh && attackReady > Time.time && attackReady - Time.time <= .12f)
            {
                bufferedAttack = attack; bufferedAim = aim; bufferedUntil = attackReady + .12f;
            }
            if (!dodging && bufferedAttack >= 0 && Time.time >= attackReady)
            {
                if (!fresh) { attack = bufferedAttack; aim = bufferedAim; }
                bufferedAttack = -1;
            }
            Vector3 facing = dodging ? dodgeDirection : swinging ? transform.forward : attack >= 0 || Guarding ? aim : move;
            if (facing.sqrMagnitude > .001f)
            {
                var rotation = Quaternion.LookRotation(facing);
                // Attack sectors must face their target on the exact damage frame.
                transform.rotation = attack >= 0 ? rotation : Quaternion.RotateTowards(transform.rotation, rotation, 720 * Time.deltaTime);
            }
            travelVelocity = swinging || dodging ? Vector3.zero : Vector3.MoveTowards(travelVelocity,
                move * speed * (Guarding ? .4f : 1), (move.sqrMagnitude > .01f ? 48 : 34) * Time.deltaTime);
            body.Move(((dodging ? dodgeDirection * 16 : travelVelocity) + Vector3.down * 8) * Time.deltaTime);
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
            bufferedAttack = -1; Guarding = false; parryUntil = 0;
            GetComponent<ArtMotion>()?.CancelSwing();
            dodgeDirection = direction.sqrMagnitude > .01f ? direction.normalized : transform.forward;
            dodgeEnd = Time.time + .22f;
            Life.invulnerableUntil = Time.time + .25f;
            dodgeReady = Time.time + 1.05f;
            CombatEffect.Ring(transform.position, .7f, new Color(.25f, .85f, 1), .25f);
            return true;
        }

        public bool TryAttack(int kind) => TryAttack((CombatAction)kind);
        public bool TryAttack(CombatAction action)
        {
            var definition = action == CombatAction.Special ? Special : Kit.Attack(action);
            if (definition == null || Life.Dead || RunManager.Instance.Finished || Time.time < attackReady || Dodging || GuardBroken) return false;
            if (action == CombatAction.Heavy && Time.time < heavyReady || action == CombatAction.Special && Time.time < specialReady) return false;
            bufferedAttack = -1; Guarding = false; parryUntil = 0; guardRecoverAt = Time.time + .45f;
            GetComponent<ArtMotion>()?.Swing(definition.windup, definition.recovery, (int)action);
            swingUntil = attackReady = Time.time + definition.windup + definition.recovery;
            if (action == CombatAction.Heavy) heavyReady = Time.time + definition.cooldown;
            if (action == CombatAction.Special) specialReady = Time.time + definition.cooldown;
            StartCoroutine(Strike(++swingVersion, definition, action, transform.forward));
            return true;
        }

        public bool ReceiveHit(CombatHit hit)
        {
            if (Life.Dead || Time.time < Life.invulnerableUntil || RunManager.Instance.Finished) return false;
            Vector3 offset = Vector3.ProjectOnPlane(hit.origin - transform.position, Vector3.up);
            if (Guarding && (hit.defence & DefenceEligibility.Block) != 0 && Vector3.Angle(transform.forward, offset) <= Defence.arc * .5f)
            {
                guardRecoverAt = Time.time + .45f;
                if (Time.time < parryUntil && (hit.defence & DefenceEligibility.Parry) != 0 && guardCharge >= hit.amount)
                {
                    guardCharge -= hit.amount; parryUntil = 0;
                    hit.attacker?.Parried();
                    RunManager.Instance.Notify("PARRY  ·  Counter while they recover.");
                    CombatEffect.Ring(transform.position, .65f, new Color(.9f, .95f, 1), .12f);
                    return false;
                }
                float cost = hit.amount * Defence.drain;
                if (guardCharge >= cost)
                {
                    guardCharge -= cost;
                    return Life.Hit(hit.amount * Defence.chip);
                }
                guardCharge = 0; Guarding = false; parryUntil = 0;
                guardBrokenUntil = Time.time + Defence.breakSeconds;
                RunManager.Instance.Notify("GUARD BROKEN  ·  Dodge or make space.");
            }
            return Life.Hit(hit.amount);
        }

        System.Collections.IEnumerator Strike(int version, AttackDefinition definition, CombatAction action, Vector3 direction)
        {
            yield return new WaitForSeconds(definition.windup);
            if (version != swingVersion || Life.Dead || RunManager.Instance.Finished) yield break;
            if (action == CombatAction.Special) CombatEffect.Ring(transform.position, definition.range, new Color(.25f, .8f, 1), .16f);
            else CombatEffect.Stroke(transform.position, direction, definition.singleTarget, action == CombatAction.Heavy);
            EnemyController closest = null; float nearest = float.PositiveInfinity;
            foreach (var enemy in RunManager.Instance.Enemies.ToArray())
            {
                if (!enemy || enemy.Life.Dead) continue;
                Vector3 offset = enemy.transform.position - transform.position; offset.y = 0;
                if (offset.magnitude > definition.range || Vector3.Angle(direction, offset) > definition.arc / 2) continue;
                if (Physics.Linecast(transform.position + Vector3.up, enemy.transform.position + Vector3.up, 1 << 8)) continue;
                if (definition.singleTarget) { if (offset.sqrMagnitude < nearest) { closest = enemy; nearest = offset.sqrMagnitude; } }
                else HitEnemy(enemy, definition, offset);
            }
            if (closest) HitEnemy(closest, definition, closest.transform.position - transform.position);
        }
        void HitEnemy(EnemyController enemy, AttackDefinition definition, Vector3 offset)
        {
            if (enemy.Life.Hit(damage * definition.multiplier)) enemy.Stagger(Vector3.ProjectOnPlane(offset, Vector3.up).normalized, definition.stagger);
        }
    }
}
