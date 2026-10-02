using UnityEngine;

namespace Ashvault
{
    public sealed class Health : MonoBehaviour
    {
        public float maximum = 100, current = 100;
        public float invulnerableUntil;
        public bool Dead => current <= 0;
        public bool player;
        float flashUntil;
        Renderer[] surfaces;
        MaterialPropertyBlock tint;

        void Start()
        {
            surfaces = GetComponentsInChildren<Renderer>();
            tint = new MaterialPropertyBlock();
        }

        public bool Hit(float damage)
        {
            if (Dead || Time.time < invulnerableUntil || RunManager.Instance.Finished) return false;
            current = Mathf.Max(0, current - damage);
            flashUntil = Time.time + .12f;
            if (Dead)
            {
                if (player) RunManager.Instance.End(false);
                else GetComponent<EnemyController>().Die();
            }
            return true;
        }

        public void Heal(float amount) => current = Mathf.Min(maximum, current + amount);

        void Update()
        {
            if (surfaces == null) return;
            foreach (var r in surfaces)
            {
                tint.Clear();
                if (Time.time < flashUntil) tint.SetColor("_Color", Color.white);
                r.SetPropertyBlock(tint);
            }
        }
    }
}
