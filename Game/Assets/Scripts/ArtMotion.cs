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
        PlayerController player;
        float cycle, runWeight, strikeWeight, idleTime;
        const float Stride = 2.375f;
        Leg left, right;
        void Start()
        {
            motion = GetComponentInChildren<Animation>();
            player = GetComponent<PlayerController>();
            previous = transform.position;
            foreach (var child in GetComponentsInChildren<Transform>())
                if (child.name == "Head") { head = child; headRest = child.localScale; break; }
            Play("Idle");
            if (player && motion)
            {
                motion["Idle"].clip.SampleAnimation(motion.gameObject, 0);
                left = new Leg(motion, "L", transform); right = new Leg(motion, "R", transform);
            }
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
            if (player) return;
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
            float distance = Vector3.ProjectOnPlane(transform.position - previous, Vector3.up).magnitude;
            float speed = distance / Mathf.Max(Time.deltaTime, .001f);
            previous = transform.position;
            if (player && motion) { HeroMotion(distance, speed); return; }
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
                (Stride * motion.transform.lossyScale.z);
            Play(speed > .15f ? "Run" : "Idle");
        }

        void HeroMotion(float distance, float speed)
        {
            bool striking = Time.time < attackUntil;
            cycle = Mathf.Repeat(cycle + distance / (3.5f * motion.transform.lossyScale.z), 1);
            idleTime += Time.deltaTime;
            runWeight = Mathf.MoveTowards(runWeight, striking ? 0 : Mathf.Clamp01(speed / 1.3f), Time.deltaTime / .14f);
            strikeWeight = Mathf.MoveTowards(strikeWeight, striking ? 1 : 0, Time.deltaTime / .08f);
            float elapsed = Mathf.Max(0, Time.time - attackStarted);
            float strikePhase = elapsed < windup ? .45f * elapsed / Mathf.Max(.01f, windup) :
                .45f + .55f * (elapsed - windup) / Mathf.Max(.01f, recovery);
            Sample("Idle", idleTime, (1 - runWeight) * (1 - strikeWeight));
            Sample("Run", cycle * motion["Run"].length, runWeight * (1 - strikeWeight));
            Sample("Attack", Mathf.Clamp01(strikePhase) * motion["Attack"].length, strikeWeight);
            motion.Sample();
            bool contacts = !striking && !player.Dodging && speed > .3f && runWeight > .8f;
            left.Plant(contacts && cycle >= .03f && cycle < .20f, transform.forward, !player.Dodging);
            right.Plant(contacts && cycle >= .55f && cycle < .74f, transform.forward, !player.Dodging);
        }

        void Sample(string clip, float time, float weight)
        {
            var state = motion[clip];
            state.enabled = true; state.speed = 0; state.time = time; state.weight = weight;
        }

        // Cosmetic two-bone solve: the sole stays in world space while the body turns.
        sealed class Leg
        {
            readonly Transform hip, knee, foot;
            readonly System.Collections.Generic.List<Vector3> sole = new System.Collections.Generic.List<Vector3>();
            readonly float upper, lower;
            Vector3 anchor;
            Vector3 contactPoint;
            bool planted;
            public Leg(Animation animation, string side, Transform root)
            {
                foreach (var bone in animation.GetComponentsInChildren<Transform>())
                {
                    if (bone.name == "Thigh." + side) hip = bone;
                    if (bone.name == "Shin." + side) knee = bone;
                    if (bone.name == "Foot." + side) foot = bone;
                }
                upper = Vector3.Distance(hip.position, knee.position);
                lower = Vector3.Distance(knee.position, foot.position);
                // Cache the actual boot shape once; model proportions are not a fixed offset.
                foreach (var skin in animation.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    int index = System.Array.IndexOf(skin.bones, foot);
                    if (index < 0) continue;
                    var mesh = new Mesh(); skin.BakeMesh(mesh, false);
                    var weights = skin.sharedMesh.boneWeights; var vertices = mesh.vertices;
                    for (int i = 0; i < vertices.Length; i++)
                        if (weights[i].boneIndex0 == index && weights[i].weight0 > .6f)
                            sole.Add(foot.InverseTransformPoint(skin.transform.TransformPoint(vertices[i])));
                    Object.Destroy(mesh);
                }
            }
            public void Plant(bool contact, Vector3 forward, bool grounded)
            {
                if (!grounded || sole.Count == 0) { planted = false; return; }
                var matrix = foot.localToWorldMatrix;
                Vector3 lowest = sole[0]; float bottom = float.PositiveInfinity;
                foreach (var point in sole)
                {
                    float y = matrix.MultiplyPoint3x4(point).y;
                    if (y < bottom) { bottom = y; lowest = point; }
                }
                if (!Physics.Raycast(foot.position + Vector3.up * .5f, Vector3.down, out var ground, 1.5f, 1 << 8))
                { planted = false; return; }
                if (!contact) planted = false;
                if (contact && !planted)
                {
                    contactPoint = lowest;
                    Vector3 toe = matrix.MultiplyPoint3x4(contactPoint);
                    anchor = new Vector3(toe.x, ground.point.y + .012f, toe.z);
                    planted = true;
                }
                Vector3 ankle = planted ? anchor - foot.TransformVector(contactPoint) : foot.position;
                float clearance = bottom + ankle.y - foot.position.y - ground.point.y;
                ankle.y += Mathf.Max(0, .012f - clearance);
                Vector3 delta = ankle - hip.position;
                // Release on a teleport or an unreachable contact; never stretch the skin.
                if (delta.magnitude > upper + lower || Vector3.Distance(foot.position, ankle) > .45f)
                { planted = false; return; }
                float distance = Mathf.Max(.01f, delta.magnitude);
                Vector3 axis = delta / distance;
                Vector3 pole = Vector3.ProjectOnPlane(forward, axis).normalized;
                float along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
                Vector3 bend = hip.position + axis * along + pole * Mathf.Sqrt(Mathf.Max(0, upper * upper - along * along));
                Quaternion rotation = foot.rotation;
                hip.rotation = Quaternion.FromToRotation(knee.position - hip.position, bend - hip.position) * hip.rotation;
                knee.rotation = Quaternion.FromToRotation(foot.position - knee.position, ankle - knee.position) * knee.rotation;
                foot.rotation = rotation;
            }
        }
    }
}
