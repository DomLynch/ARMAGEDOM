using UnityEngine;

namespace Ashvault
{
    public sealed class LootPickup : MonoBehaviour
    {
        // Three sword tiers, three armour tiers, three tonic strengths: nine upgrades.
        public int kind, tier;
        Vector3 origin;
        void Start() => origin = transform.position;
        void Update()
        {
            if (RunManager.Instance.Finished) return;
            transform.position = origin + Vector3.up * Mathf.Sin(Time.time * 3) * .12f;
            transform.Rotate(0, 65 * Time.deltaTime, 0);
            if (Vector3.Distance(transform.position, RunManager.Instance.Player.transform.position + Vector3.up * .5f) < 1.3f)
                Collect(RunManager.Instance.Player);
        }

        public void Collect(PlayerController player)
        {
            string message;
            if (kind == 0)
            {
                float percent = .1f + tier * .025f;
                player.damage *= 1 + percent;
                player.weaponLevel++;
                message = "SWORD  +" + Mathf.RoundToInt(percent * 100) + "% damage";
            }
            else if (kind == 1)
            {
                int hp = 15 + tier * 5;
                player.Life.maximum += hp;
                player.Life.Heal(hp);
                player.armourLevel++;
                message = "ARMOUR  +" + hp + " max HP";
            }
            else
            {
                int hp = 30 + tier * 10;
                player.Life.Heal(hp);
                message = "TONIC  +" + hp + " HP";
            }
            RunManager.Instance.Notify(message);
            Destroy(gameObject);
        }
    }
}
