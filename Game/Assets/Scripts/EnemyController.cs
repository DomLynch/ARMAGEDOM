using UnityEngine;

namespace Ashvault
{
    [RequireComponent(typeof(CharacterController), typeof(Health))]
    public sealed class EnemyController : MonoBehaviour
    {
        public int kind;
        public Health Life { get; private set; }
        public bool IsBoss => kind == 3;
        CharacterController body;
        float ready, strikeAt, recoverUntil, staggerUntil;
        Vector3 lockedDirection, lockedPoint;
        bool attacking, alerted;
        int bossPattern;
        float Radius => kind == 3 ? (bossPattern == 1 ? 4 : 3.5f) : kind == 1 ? 2.8f : 1.8f;
        float Arc => kind == 3 && bossPattern == 1 ? 360 : kind == 1 ? 110 : 90;

        void Awake()
        {
            Life = GetComponent<Health>();
            body = GetComponent<CharacterController>();
        }

        void Update()
        {
            var run = RunManager.Instance;
            if (run.Finished || Life.Dead) return;
            var player = run.Player;
            Vector3 offset = player.transform.position - transform.position;
            offset.y = 0;
            float distance = offset.magnitude;
            if (!alerted && distance > 12) return;
            alerted = true;
            if (attacking)
            {
                if (Time.time >= strikeAt) ResolveAttack();
                return;
            }
            if (Time.time < recoverUntil || Time.time < staggerUntil) return;
            bool ranged = kind == 2 || IsBoss && bossPattern == 2;
            float reach = ranged ? 8 : Radius - .25f;
            bool blocked = Physics.Linecast(transform.position + Vector3.up, player.transform.position + Vector3.up, 1 << 8);
            if (distance > reach || blocked)
            {
                Move(offset.normalized, kind == 1 ? 1.65f : IsBoss ? 2.1f : 2.8f);
                return;
            }
            if (kind == 2 && distance < 4 && Time.time < ready) Move(-offset.normalized, 2, true);
            else if (distance > .01f) transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(offset), 360 * Time.deltaTime);
            if (Time.time >= ready && Vector3.Dot(transform.forward, offset.normalized) > .96f) BeginAttack(offset.normalized);
        }

        void Move(Vector3 direction, float speed, bool backwards = false)
        {
            // Local obstacle steering is enough for the deliberately open chamber layout.
            if (Physics.SphereCast(transform.position + Vector3.up * .6f, .35f, direction, out _, 1.2f, 1 << 8))
            {
                Vector3 side = Vector3.Cross(Vector3.up, direction);
                if (Physics.SphereCast(transform.position + Vector3.up * .6f, .35f, side, out _, 1.2f, 1 << 8)) side = -side;
                direction = side;
            }
            Vector3 facing = backwards ? -direction : direction;
            transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(facing), 360 * Time.deltaTime);
            float alignment = Mathf.Max(0, Vector3.Dot(transform.forward, facing));
            body.Move((transform.forward * (backwards ? -speed : speed) * alignment + Vector3.down * 8) * Time.deltaTime);
        }

        void BeginAttack(Vector3 direction)
        {
            attacking = true;
            lockedDirection = direction;
            lockedPoint = transform.position;
            float delay = kind == 0 ? .4f : kind == 2 ? .65f : 1.05f;
            strikeAt = Time.time + delay;
            GetComponent<ArtMotion>()?.Swing(delay);
        }

        void ResolveAttack()
        {
            attacking = false;
            bool ranged = kind == 2 || IsBoss && bossPattern == 2;
            float amount = IsBoss ? 25 : kind == 1 ? 23 : kind == 2 ? 12 : 9;
            if (ranged)
            {
                CombatEffect.Bolt(lockedPoint, lockedDirection, amount);
                if (IsBoss)
                {
                    CombatEffect.Bolt(lockedPoint, Quaternion.Euler(0, 18, 0) * lockedDirection, amount);
                    CombatEffect.Bolt(lockedPoint, Quaternion.Euler(0, -18, 0) * lockedDirection, amount);
                }
            }
            else
            {
                var player = RunManager.Instance.Player;
                Vector3 delta = player.transform.position - lockedPoint;
                delta.y = 0;
                if (delta.magnitude < Radius + .25f && Vector3.Angle(lockedDirection, delta) <= Arc / 2 &&
                    !Physics.Linecast(lockedPoint + Vector3.up, player.transform.position + Vector3.up, 1 << 8)) player.ReceiveHit(new CombatHit(amount, lockedPoint, this,
                        IsBoss ? DefenceEligibility.None : DefenceEligibility.Block | (kind == 0 ? DefenceEligibility.Parry : DefenceEligibility.None)));
            }
            recoverUntil = Mathf.Max(recoverUntil, Time.time + (kind == 1 || IsBoss ? .95f : .45f));
            ready = Mathf.Max(ready, Time.time + (kind == 0 ? 1.2f : 1.9f));
            if (IsBoss) bossPattern = (bossPattern + 1) % 3;
        }

        public void Parried()
        {
            if (Life.Dead || IsBoss) return;
            attacking = false;
            recoverUntil = ready = Time.time + .9f;
            staggerUntil = recoverUntil;
            GetComponent<ArtMotion>()?.CancelSwing();
        }

        public void Stagger(Vector3 direction, float duration)
        {
            if (Life.Dead) return;
            if (!IsBoss)
            {
                staggerUntil = Time.time + duration;
                body.Move(direction * .18f);
            }
        }

        public void Die()
        {
            RunManager.Instance.EnemyDied(this);
            Destroy(gameObject);
        }
    }
}
