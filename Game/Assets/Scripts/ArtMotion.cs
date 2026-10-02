using UnityEngine;

namespace Ashvault
{
    // Cosmetic playback only; gameplay owns collision, damage and telegraph timing.
    public sealed class ArtMotion : MonoBehaviour
    {
        Animation motion;
        Vector3 previous;
        float attackUntil, attackStarted, windup, recovery;
        string playing;
        public float headProportion = 1;
        Transform head;
        Vector3 headRest;
        void Start()
        {
            motion = GetComponentInChildren<Animation>();
            previous = transform.position;
            foreach (var child in GetComponentsInChildren<Transform>())
                if (child.name == "Head") { head = child; headRest = child.localScale; break; }
            Play("Idle");
        }
        void Play(string clip)
        {
            if (!motion || !motion[clip] || playing == clip) return;
            motion.CrossFade(clip, .10f);
            playing = clip;
        }
        public void Swing(float delay = .14f, float settle = .28f)
        {
            if (!motion || !motion["Attack"]) return;
            windup = Mathf.Max(.01f, delay); recovery = settle;
            attackStarted = Time.time;
            attackUntil = Time.time + windup + recovery;
            motion["Attack"].speed = 0;
            motion["Attack"].time = 0;
            playing = null;
            Play("Attack");
        }
        public void CancelSwing() => attackUntil = 0;

        void LateUpdate()
        {
            if (head) head.localScale = headRest * headProportion;
            if (!RunManager.Instance || RunManager.Instance.Finished) return;
            float speed = Vector3.ProjectOnPlane(transform.position - previous, Vector3.up).magnitude / Mathf.Max(Time.deltaTime, .001f);
            previous = transform.position;
            if (motion && Time.time < attackUntil)
            {
                float elapsed = Time.time - attackStarted;
                float phase = elapsed < windup ? .45f * elapsed / windup : .45f + .55f * (elapsed - windup) / recovery;
                motion["Attack"].time = phase * motion["Attack"].length;
                motion.Sample();
                return;
            }
            // Baked stance covers .95m in 40% of one cycle: 2.375m per cycle.
            if (motion && motion["Run"]) motion["Run"].speed = speed * motion["Run"].length /
                (2.375f * motion.transform.lossyScale.z);
            Play(speed > .15f ? "Run" : "Idle");
        }
    }
}
