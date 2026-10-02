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
            line.positionCount = steps + 3;
            line.SetPosition(0, Vector3.zero);
            for (int i = 0; i <= steps; i++)
                line.SetPosition(i + 1, Quaternion.AngleAxis(-angle / 2 + angle * i / steps, Vector3.up) * facing.normalized * radius);
            line.SetPosition(steps + 2, Vector3.zero);
            go.AddComponent<CombatEffect>().expires = Time.time + lifetime;
            return go;
        }

        public static GameObject Ring(Vector3 center, float radius, Color color, float lifetime) =>
            Sector(center, Vector3.forward, radius, 360, color, lifetime);

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
                run.Player.Life.Hit(damage);
                Destroy(gameObject);
            }
            else transform.position = next;
        }
    }
}
