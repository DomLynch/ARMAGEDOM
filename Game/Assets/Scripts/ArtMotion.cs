using UnityEngine;

namespace Ashvault
{
    // Cosmetic playback only; gameplay owns collision, damage and telegraph timing.
    public sealed class ArtMotion : MonoBehaviour
    {
        Animation motion;
        Vector3 previous;
        float attackUntil, attackStarted, windup, recovery;
        public float headProportion = 1;
        Transform head, staffHand, staffShoulder, staffElbow;
        Vector3 headRest;
        PlayerController player;
        EnemyController enemy;
        float cycle, runWeight, strikeWeight, idleTime;
        Leg left, right;
        Transform swordShoulder, swordElbow, swordHand;
        Quaternion shoulderBase, elbowBase, handBase;
        Vector3 bladeAxis;
        int attackKind;
        float guardPose;
        bool poseApplied;
        void Start()
        {
            motion = GetComponentInChildren<Animation>();
            player = GetComponent<PlayerController>();
            enemy = GetComponent<EnemyController>();
            previous = transform.position;
            foreach (var child in GetComponentsInChildren<Transform>())
                if (child.name == "Head") { head = child; headRest = child.localScale; break; }
            if(enemy && enemy.kind==2)
                foreach(var bone in GetComponentsInChildren<Transform>())
                { if(bone.name=="Hand.R")staffHand=bone;if(bone.name=="UpperArm.R")staffShoulder=bone;if(bone.name=="Forearm.R")staffElbow=bone; }
            if (motion)
            {
                motion["Idle"].clip.SampleAnimation(motion.gameObject, 0);
                RefreshProportions();
                if (player)
                {
                    foreach (var bone in GetComponentsInChildren<Transform>())
                    { if (bone.name == "UpperArm.R") swordShoulder = bone; if (bone.name == "Forearm.R") swordElbow = bone; if (bone.name == "Hand.R") swordHand = bone; }
                    if (swordHand)
                        foreach (var skin in GetComponentsInChildren<SkinnedMeshRenderer>())
                            if (skin.name == "Machete")
                            {
                                var mesh = new Mesh(); skin.BakeMesh(mesh, false);
                                var matrix = Matrix4x4.TRS(skin.transform.position, skin.transform.rotation, Vector3.one);
                                Vector3 tip = swordHand.position; float farthest = 0;
                                foreach (var vertex in mesh.vertices)
                                { var point = matrix.MultiplyPoint3x4(vertex); float distance = (point - swordHand.position).sqrMagnitude;
                                    if (distance > farthest) { farthest = distance; tip = point; } }
                                bladeAxis = swordHand.InverseTransformDirection(tip - swordHand.position).normalized;
                                Destroy(mesh); break;
                            }
                }
            }
        }
        public void RefreshProportions()
        {
            if(motion) { left=new Leg(motion,"L",transform);right=new Leg(motion,"R",transform); }
        }
        public void Swing(float delay = .14f, float settle = .28f, int kind = 0)
        {
            if (!motion || !motion["Attack"]) return;
            windup = Mathf.Max(.01f, delay); recovery = settle; attackKind = kind;
            attackStarted = Time.time;
            attackUntil = Time.time + windup + recovery;
        }
        public void CancelSwing() => attackUntil = 0;

        void OnDisable() { RestoreCombatPose(); guardPose = 0; attackUntil = 0; }
        void RestoreCombatPose()
        {
            if (!poseApplied || !swordShoulder || !swordElbow || !swordHand) return;
            swordShoulder.localRotation = shoulderBase; swordElbow.localRotation = elbowBase; swordHand.localRotation = handBase;
            poseApplied = false;
        }
        void LateUpdate()
        {
            RestoreCombatPose();
            if (!RunManager.Instance || RunManager.Instance.Finished) return;
            Vector3 travel = Vector3.ProjectOnPlane(transform.position - previous, Vector3.up);
            float distance = travel.magnitude;
            float speed = distance / Mathf.Max(Time.deltaTime, .001f);
            previous = transform.position;
            if (motion) Animate(distance * (enemy && Vector3.Dot(travel, transform.forward) < 0 ? -1 : 1), speed);
            if (head) head.localScale = headRest * headProportion;
        }

        void Animate(float distance, float speed)
        {
            bool striking = Time.time < attackUntil;
            bool walking = enemy && (enemy.kind == 1 || enemy.IsBoss);
            float stride = walking ? 1.31f : 3.5f;
            cycle = Mathf.Repeat(cycle + distance / (stride * motion.transform.lossyScale.z), 1);
            idleTime += Time.deltaTime;
            runWeight = Mathf.MoveTowards(runWeight, striking ? 0 : Mathf.Clamp01(speed / 1.3f), Time.deltaTime / .14f);
            strikeWeight = Mathf.MoveTowards(strikeWeight, striking ? 1 : 0, Time.deltaTime / .08f);
            float elapsed = Mathf.Max(0, Time.time - attackStarted);
            float strikePhase = elapsed < windup ? .45f * elapsed / Mathf.Max(.01f, windup) :
                .45f + .55f * (elapsed - windup) / Mathf.Max(.01f, recovery);
            Sample("Run", cycle * motion["Run"].length, runWeight * (1 - strikeWeight));
            // Thrust uses the freshly sampled base, rather than replaying the slash upper body.
            float slashWeight = player && attackKind == 3 ? 0 : strikeWeight;
            Sample("Idle", idleTime, (1 - runWeight) * (1 - slashWeight));
            Sample("Attack", Mathf.Clamp01(strikePhase) * motion["Attack"].length, slashWeight);
            motion.Sample();
            if(staffHand && staffShoulder && staffElbow)
            {
                // Raise the enlarged staff grip without stretching the arm or tilting the staff.
                float lift=Mathf.Max(0,transform.Find("Visual").localScale.x-1)*.6f*(1-strikeWeight);
                Vector3 target=staffHand.position+Vector3.up*lift, delta=target-staffShoulder.position;
                float upper=Vector3.Distance(staffShoulder.position,staffElbow.position), lower=Vector3.Distance(staffElbow.position,staffHand.position);
                float armDistance=delta.magnitude;
                if(armDistance>.01f && armDistance<upper+lower && armDistance>Mathf.Abs(upper-lower))
                {
                    Vector3 axis=delta/armDistance, pole=Vector3.ProjectOnPlane(staffElbow.position-staffShoulder.position,axis).normalized;
                    float along=(upper*upper-lower*lower+armDistance*armDistance)/(2*armDistance);
                    Vector3 bend=staffShoulder.position+axis*along+pole*Mathf.Sqrt(Mathf.Max(0,upper*upper-along*along));
                    Quaternion rotation=staffHand.rotation;
                    staffShoulder.rotation=Quaternion.FromToRotation(staffElbow.position-staffShoulder.position,bend-staffShoulder.position)*staffShoulder.rotation;
                    staffElbow.rotation=Quaternion.FromToRotation(staffHand.position-staffElbow.position,target-staffElbow.position)*staffElbow.rotation;
                    staffHand.rotation=rotation;
                }
            }
            if (player) PoseSword(elapsed, striking);
            bool grounded = !player || !player.Dodging;
            bool contacts = !striking && grounded && speed > .3f && runWeight > .8f;
            left.Plant(contacts && (walking ? cycle >= .05f && cycle < .45f : cycle >= .03f && cycle < .20f), transform.forward, grounded);
            right.Plant(contacts && (walking ? cycle >= .55f && cycle < .95f : cycle >= .55f && cycle < .74f), transform.forward, grounded);
        }

        void PoseSword(float elapsed, bool striking)
        {
            if (!swordShoulder || !swordElbow || !swordHand || bladeAxis.sqrMagnitude < .1f) return;
            float upper = Vector3.Distance(swordShoulder.position, swordElbow.position), lower = Vector3.Distance(swordElbow.position, swordHand.position);
            float reach = upper + lower;
            Vector3 target, direction; float weight;
            guardPose = Mathf.MoveTowards(guardPose, player.Guarding ? 1 : 0, Time.deltaTime / .10f);
            float side = Mathf.Sign(Vector3.Dot(swordShoulder.position - transform.position, transform.right));
            if (striking && attackKind == 3)
            {
                float extension = elapsed < windup ? Mathf.Lerp(.05f, .9f, Mathf.SmoothStep(0, 1, elapsed / windup)) :
                    Mathf.Lerp(.9f, .05f, Mathf.Clamp01((elapsed - windup) / recovery));
                target = swordShoulder.position + transform.forward * reach * extension + transform.right * side * .08f - Vector3.up * reach * .20f;
                direction = transform.forward; weight = strikeWeight;
            }
            else if (striking && attackKind == 1 && elapsed < windup)
            {
                target = swordShoulder.position + transform.forward * .25f + Vector3.up * .20f;
                direction = (Vector3.up + transform.forward * .25f).normalized;
                weight = Mathf.Sin(Mathf.Clamp01(elapsed / windup) * Mathf.PI);
            }
            else
            {
                target = swordShoulder.position + transform.forward * .28f - transform.right * side * .12f - Vector3.up * .20f;
                direction = (Vector3.up + transform.right * side * .3f).normalized; weight = guardPose;
            }
            if (weight <= 0) return;
            shoulderBase = swordShoulder.localRotation; elbowBase = swordElbow.localRotation; handBase = swordHand.localRotation;
            Quaternion shoulderRotation = swordShoulder.rotation, elbowRotation = swordElbow.rotation, handRotation = swordHand.rotation;
            Vector3 delta = target - swordShoulder.position;
            float distance = Mathf.Clamp(delta.magnitude, Mathf.Abs(upper - lower) + .01f, reach * .98f);
            Vector3 axis = delta.normalized;
            Vector3 pole = Vector3.ProjectOnPlane(transform.right * side - Vector3.up * .5f, axis).normalized;
            float along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
            Vector3 bend = swordShoulder.position + axis * along + pole * Mathf.Sqrt(Mathf.Max(0, upper * upper - along * along));
            Vector3 endpoint = swordShoulder.position + axis * distance;
            swordShoulder.rotation = Quaternion.Slerp(shoulderRotation,
                Quaternion.FromToRotation(swordElbow.position - swordShoulder.position, bend - swordShoulder.position) * shoulderRotation, weight);
            swordElbow.rotation = Quaternion.Slerp(elbowRotation,
                Quaternion.FromToRotation(swordHand.position - swordElbow.position, endpoint - swordElbow.position) * swordElbow.rotation, weight);
            swordHand.rotation = Quaternion.Slerp(handRotation, Quaternion.FromToRotation(handRotation * bladeAxis, direction) * handRotation, weight);
            poseApplied = true;
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
            readonly float upper, lower, maxCorrection;
            Vector3 anchor;
            Vector3 contactPoint;
            bool planted;
            Quaternion anchorRotation;
            public Leg(Animation animation, string side, Transform root)
            {
                foreach (var bone in animation.GetComponentsInChildren<Transform>())
                {
                    if (bone.name == "Thigh." + side) hip = bone;
                    if (bone.name == "Shin." + side) knee = bone;
                    if (bone.name == "Foot." + side) foot = bone;
                }
                maxCorrection=.45f*root.Find("Visual").lossyScale.x;
                upper = Vector3.Distance(hip.position, knee.position);
                lower = Vector3.Distance(knee.position, foot.position);
                // BakeMesh already includes skin scale; rotate/translate without applying it twice.
                foreach (var skin in animation.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    int index = System.Array.IndexOf(skin.bones, foot);
                    if (index < 0) continue;
                    var mesh = new Mesh(); skin.BakeMesh(mesh, false);
                    var weights = skin.sharedMesh.boneWeights; var vertices = mesh.vertices;
                    for (int i = 0; i < vertices.Length; i++)
                        if (weights[i].boneIndex0 == index && weights[i].weight0 > .6f)
                            sole.Add(foot.InverseTransformPoint(skin.transform.position + skin.transform.rotation * vertices[i]));
                    Object.Destroy(mesh);
                }
            }
            public void Plant(bool contact, Vector3 forward, bool grounded)
            {
                if (!grounded || sole.Count == 0) { planted = false; return; }
                Quaternion sampledRotation=foot.rotation;
                if(planted && contact) foot.rotation=anchorRotation;
                var matrix = foot.localToWorldMatrix;
                Vector3 lowest = sole[0]; float bottom = float.PositiveInfinity;
                foreach (var point in sole)
                {
                    float y = matrix.MultiplyPoint3x4(point).y;
                    if (y < bottom) { bottom = y; lowest = point; }
                }
                if (!Physics.Raycast(foot.position + Vector3.up * .5f, Vector3.down, out var ground, 1.5f, 1 << 8))
                { planted = false; foot.rotation=sampledRotation; return; }
                if (!contact) planted = false;
                if (contact && !planted)
                {
                    contactPoint = lowest;
                    anchorRotation=foot.rotation;
                    Vector3 toe = matrix.MultiplyPoint3x4(contactPoint);
                    anchor = new Vector3(toe.x, ground.point.y + .012f, toe.z);
                    planted = true;
                }
                Vector3 ankle = planted ? anchor - foot.TransformVector(contactPoint) : foot.position;
                float clearance = bottom + ankle.y - foot.position.y - ground.point.y;
                ankle.y += Mathf.Max(0, .012f - clearance);
                Vector3 delta = ankle - hip.position;
                // Release on a teleport or an unreachable contact; never stretch the skin.
                if (delta.magnitude > upper + lower || Vector3.Distance(foot.position, ankle) > maxCorrection)
                { planted = false; foot.rotation=sampledRotation; return; }
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
