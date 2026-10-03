using UnityEngine;

namespace Ashvault
{
    public sealed class CombatEffect : MonoBehaviour
    {
        float expires;
        Vector3 velocity;
        float damage;
        bool projectile;
        static Material lineMaterial;

        public static GameObject Sector(Vector3 center, Vector3 facing, float radius, float angle, Color color, float lifetime)
        {
            var go = new GameObject("Attack telegraph");
            go.transform.position = center + Vector3.up * .08f;
            var line = go.AddComponent<LineRenderer>();
            if (!lineMaterial) lineMaterial = Resources.Load<Material>("AshvaultLine");
            line.sharedMaterial = lineMaterial;
            line.useWorldSpace = false;
            line.startColor = line.endColor = color;
            line.startWidth = line.endWidth = .065f;
            const int steps = 36;
            bool ring = angle >= 359;
            line.positionCount = ring ? steps + 1 : steps + 3;
            if (!ring) line.SetPosition(0, Vector3.zero);
            for (int i = 0; i <= steps; i++)
                line.SetPosition(i + (ring ? 0 : 1), Quaternion.AngleAxis(-angle / 2 + angle * i / steps, Vector3.up) * facing.normalized * radius);
            if (!ring) line.SetPosition(steps + 2, Vector3.zero);
            go.AddComponent<CombatEffect>().expires = Time.time + lifetime;
            return go;
        }

        public static GameObject Ring(Vector3 center, float radius, Color color, float lifetime) =>
            Sector(center, Vector3.forward, radius, 360, color, lifetime);

        public static void Stroke(Vector3 center, Vector3 facing, bool thrust, bool heavy)
        {
            var go = new GameObject(thrust ? "Blade thrust" : "Blade sweep");
            go.transform.position = center + Vector3.up * 1.1f;
            var line = go.AddComponent<LineRenderer>();
            if (!lineMaterial) lineMaterial = Resources.Load<Material>("AshvaultLine");
            line.sharedMaterial = lineMaterial; line.useWorldSpace = false;
            line.startColor = line.endColor = heavy ? new Color(1, .65f, .3f, .8f) : new Color(.9f, .94f, 1, .65f);
            line.startWidth = line.endWidth = heavy ? .10f : .055f;
            line.positionCount = thrust ? 2 : 13;
            for (int i = 0; i < line.positionCount; i++)
                line.SetPosition(i, thrust ? facing * (i == 0 ? .65f : 1.8f) :
                    Quaternion.AngleAxis(-60 + 120f * i / 12, Vector3.up) * facing * (heavy ? 1.8f : 1.5f));
            go.AddComponent<CombatEffect>().expires = Time.time + .12f;
        }

        public static void Bolt(Vector3 origin, Vector3 direction, float amount)
        {
            var go = ArenaBuilder.Shape("Ember bolt", PrimitiveType.Sphere, origin + Vector3.up * .8f,
                Vector3.one * .3f, ArenaBuilder.Ember, null, false);
            var effect = go.AddComponent<CombatEffect>();
            effect.velocity = direction.normalized * 8;
            effect.damage = amount;
            effect.projectile = true;
            effect.expires = Time.time + 4;
        }

        void Update()
        {
            var run = RunManager.Instance;
            if (Time.time >= expires || run.Finished) { Destroy(gameObject); return; }
            if (!projectile) return;
            Vector3 next = transform.position + velocity * Time.deltaTime;
            if (Physics.Linecast(transform.position, next, 1 << 8)) { Destroy(gameObject); return; }
            Vector3 player = run.Player.transform.position + Vector3.up * .8f;
            Vector3 segment = next - transform.position;
            float t = Mathf.Clamp01(Vector3.Dot(player - transform.position, segment) / Mathf.Max(.0001f, segment.sqrMagnitude));
            if (Vector3.Distance(transform.position + segment * t, player) < .6f)
            {
                run.Player.ReceiveHit(new CombatHit(damage, transform.position));
                Destroy(gameObject);
            }
            else transform.position = next;
        }
    }
}
