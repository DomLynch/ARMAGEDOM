using UnityEngine;

namespace Ashvault
{
    // Stable player intents. Weapon and equipped ability supply their behaviour.
    public enum CombatAction { Primary = 0, Heavy = 1, Special = 2, Secondary = 3, Dodge = 4, Guard = 5 }

    public sealed class AttackDefinition
    {
        public readonly float windup, recovery, range, arc, multiplier, stagger, cooldown;
        public readonly bool singleTarget;
        public AttackDefinition(float windup, float recovery, float range, float arc, float multiplier,
            float stagger, float cooldown = 0, bool singleTarget = false)
        {
            this.windup = windup; this.recovery = recovery; this.range = range; this.arc = arc;
            this.multiplier = multiplier; this.stagger = stagger; this.cooldown = cooldown; this.singleTarget = singleTarget;
        }
    }

    public sealed class CombatKit
    {
        public readonly AttackDefinition primary, secondary, heavy;
        public CombatKit(AttackDefinition primary, AttackDefinition secondary, AttackDefinition heavy)
        { this.primary = primary; this.secondary = secondary; this.heavy = heavy; }
        public AttackDefinition Attack(CombatAction action) => action == CombatAction.Primary ? primary :
            action == CombatAction.Secondary ? secondary : action == CombatAction.Heavy ? heavy : null;
        public static readonly CombatKit Sword = new CombatKit(
            new AttackDefinition(.14f, .28f, 2.6f, 100, 1, .10f),
            new AttackDefinition(.12f, .24f, 3.1f, 24, 1.2f, .12f, singleTarget: true),
            new AttackDefinition(.36f, .42f, 3.2f, 130, 2.1f, .3f, 1.6f));
        public static readonly AttackDefinition Shockwave = new AttackDefinition(.20f, .38f, 4.2f, 360, 2.2f, .3f, 7);
    }

    public sealed class DefenceDefinition
    {
        public readonly float capacity, chip, drain, recovery, parryWindow, breakSeconds, arc;
        public DefenceDefinition(float capacity, float chip, float drain, float recovery, float parryWindow, float breakSeconds, float arc)
        { this.capacity = capacity; this.chip = chip; this.drain = drain; this.recovery = recovery;
            this.parryWindow = parryWindow; this.breakSeconds = breakSeconds; this.arc = arc; }
        public static readonly DefenceDefinition Sword = new DefenceDefinition(100, .25f, 3, 35, .16f, .9f, 140);
    }

    [System.Flags] public enum DefenceEligibility { None = 0, Block = 1, Parry = 2 }
    public readonly struct CombatHit
    {
        public readonly float amount;
        public readonly Vector3 origin;
        public readonly EnemyController attacker;
        public readonly DefenceEligibility defence;
        public CombatHit(float amount, Vector3 origin, EnemyController attacker = null, DefenceEligibility defence = DefenceEligibility.None)
        { this.amount = amount; this.origin = origin; this.attacker = attacker; this.defence = defence; }
    }
}
