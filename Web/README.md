# ARMAGEDOM Three.js client

Active independent browser game; official https://playarmagedom.com/.
Canonical Web source is the reviewed three-20261004-008 baseline (5dc5610c).
Six actions, Frankendom pilot player/Goblin, directional guarding and stamina,
selected006 fighter size with unchanged map/camera, portrait and landscape HUD.
Unpublished Hollow/maintenance candidates live in their owned lanes.

`npm ci`, `npm test`, `npm run test:packaging`, `npm run build`; `npm run dev`
for local development. Serve dist as an immutable static directory with trailing
slash and reviewed runtime allowlist. `?touch=1` is desktop layout review only.

WASD/mouse/Q/E/Space/F and six touch actions: Slash, Stab, Heavy, Special, Dodge,
Guard/timed Parry. Independent pointers allow moving while attacking; menu,
rotation and focus changes cancel held input. Audio starts on a player gesture.
World/actor coordinates and ownership are in CONTRACT.md.

Load only selected area/current actors and small local audio, never all ranks.
Original portable authoring assets remain private/in source; publication prunes
unused files. Current tests/build closure and HTTPS bytes are evidence of their
own scope. Physical iPhone/Android cold/warm loading, audio, sustained pacing,
simultaneous touch and full-fight feel require real-device evidence.

No active engine project/native client/engine test or fallback. Retired emergency
reference is outside all active checkouts and webroots; see canonical retirement
brief. Git history and asset provenance remain historical records only.
