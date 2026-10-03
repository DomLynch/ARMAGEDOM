using UnityEngine;

namespace Ashvault
{
    // Visual equipment only. Combat, stats and inventory remain owned by gameplay.
    public sealed class VagrantGear : MonoBehaviour
    {
        Renderer vest, backpack;
        void Awake()
        {
            foreach (var piece in GetComponentsInChildren<Renderer>(true))
            {
                if (piece.name == "Protection vest") vest = piece;
                if (piece.name == "Backpack") backpack = piece;
            }
            SetProtection(false);
            SetBackpack(false);
        }
        public void SetProtection(bool equipped) { if (vest) vest.enabled = equipped; }
        public void SetBackpack(bool equipped) { if (backpack) backpack.enabled = equipped; }
    }
}
