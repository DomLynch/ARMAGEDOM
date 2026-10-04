# Human Vagrant — modular starting-character proposal

> Active platform: [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md),
> owner decision 2026-10-04. Unity/native instructions and public-retention rules
> in older records are historical; private recovery archives are not live rollback.

2026-10-03. Owner assigned this chat character/player design and approved using
Frankendom's learned workflow. Owner approved the pilot direction and implementation.

## Starting identity

Human civilian survivor in post-nuclear London, 2029–2030. War and gameplay share
that period; collapse spans weeks/months, with no15-year aftermath jump. Low starting power;
resourceful and under-equipped. Contemporary scavenged workwear, visibly worn
but with a clear silhouette at the current London camera. No fantasy rank palette.

- Faded slate hoodie, hood down, under a short washed-out olive work jacket.
- Torn jacket hem, one repaired elbow, dirt concentrated at cuffs and seams.
- Charcoal work trousers with one mismatched knee patch; scuffed brown boots.
- Plain belt, small fabric pouch, one cloth wrist wrap. No starting helmet or vest.
- Exposed human head with tired expression and untidy short hair; face details
  remain subject to the selected visual reference.
- Starter weapon: short utilitarian machete, dull steel, chipped edge and repaired
  handle. Keep wear localized; avoid uniform rust or ornamental detailing.

Machete is the preferred one-handed pilot candidate. Cleaver is a later compact
alternative; shovel and pickaxe suit later heavier equipment with separately
validated grips and motion. Weapon reach/damage changes require gameplay scope.

## Assembly contract

Preserve current proportions, skeleton/rest transforms, original clips and timing,
weapon-grip compatibility, gameplay root and colliders. Scale stays 1.265;
camera stays unchanged. Original knight/source assets remain immutable rollback.

Use replaceable torso clothing, leg clothing, footwear and hand pieces on the
same skeleton; rigid equipment uses appropriate attachments. Keep body masking
local to equipment coverage and define permitted overlaps/compatibility. Avoid
arbitrary layering combinations for the pilot. No cloth simulation required.

Original source inspection: warden-source.glb has one mesh instance/primitive.
warden-rigged.blend contains Warden armour (199,387 vertices), Ashblade
(1,092 vertices), WardenRig (19 bones) and world. No separate human-body mesh
is present. This inventory does not certify hidden topology; plan replacement
human geometry fitted to the existing skeleton rather than stripping armour
and assuming complete anatomy. Read-only inspection; sources were not saved.

## Pilot and acceptance

Build one survivor plus two torso states: jacket alone, jacket with scavenged
padded vest. Demonstrate replacing the torso kit without replacing the rig.
Add a removable small backpack and separately attached machete. Backpack is a
swap test/early loot option, not mandatory starting equipment.

Reimport final exports, then inspect idle, running, turns, slash/heavy, dodge and
transitions in the Three.js runtime against the actual London image. Check neck, shoulders,
armpits, wrists, waist, knees, boot contact and weapon clearance through motion.
Verify rig/clip preservation and body masks in both torso states. Validate the
blade silhouette/orientation against the existing grip; do not infer compatibility
from a still. Final editable sources and captures must match delivered assets.

Use CPU Blender and saved/licensed anatomy where suitable. Heavy suitable jobs
prefer bounded HF CPU; no expensive GPU. Any donor licence must be verified.
After two unsuccessful repairs of one defect, diagnose the first broken stage;
do not regenerate to fix weights, materials, transport or export issues.

Implementation authorized on2026-10-03. Pilot art review uses the final export in
the actual London camera. Face/fabric polish remain subject to owner review. Pickup,
inventory, equipment stats and new weapon animation sets remain separate gameplay work.
Live status and evidence: PROJECT_STATE.md and art/vagrant/README.md.
