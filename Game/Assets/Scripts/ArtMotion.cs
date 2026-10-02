using UnityEngine;

namespace Ashvault
{
    // Cosmetic playback only; gameplay owns collision, damage and telegraph timing.
    public sealed class ArtMotion : MonoBehaviour
    {
        Animation motion;
        Vector3 previous;
        float attackUntil;
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
        public void Swing(float delay = 0)
        {
            if (!motion || !motion["Attack"]) return;
            float duration = Mathf.Max(.27f, delay);
            motion["Attack"].speed = motion["Attack"].length / duration;
            motion["Attack"].time = 0;
            playing = null;
            Play("Attack");
            attackUntil = Time.time + duration;
        }
        void LateUpdate()
        {
            if (head) head.localScale = headRest * headProportion;
            if (!RunManager.Instance || RunManager.Instance.Finished) return;
            float speed = Vector3.ProjectOnPlane(transform.position - previous, Vector3.up).magnitude / Mathf.Max(Time.deltaTime, .001f);
            previous = transform.position;
            if (Time.time < attackUntil) return;
            if (motion && motion["Run"]) motion["Run"].speed = Mathf.Clamp(speed / 3, .7f, 2);
            Play(speed > .15f ? "Run" : "Idle");
        }
    }
}
