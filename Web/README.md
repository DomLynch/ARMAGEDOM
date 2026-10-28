# ARMAGEDOM Three.js client

Active independent browser game; official https://playarmagedom.com/.
The client uses directional guarding, stamina, and portrait/landscape controls.
Current source, candidate and verified served identities are recorded separately
in PROJECT_STATE.md and deployment receipts. Unpublished candidates remain in
their owned lanes; a source revision alone is not evidence of publication.

`npm ci`, `npm test`, `npm run test:packaging`, `npm run build`; `npm run dev`
for local development. Serve dist as an immutable static directory with trailing
slash and reviewed runtime allowlist. `?touch=1` is desktop layout review only.

WASD/mouse/Q/E/Space/F and five melee touch actions: Slash, Stab, Heavy, Dodge,
Guard/timed Parry. E retains keyboard Special; the approved touch layout omits it.
Desktop keys and mouse buttons are data: src/data/inputKeys.json (left click attack, right click or F guard, R stab/reload,
Q heavy, Space dodge, G pick up, Esc menu). Digits 1-6 and the mouse wheel pick a carried weapon, and
C equips the next carried weapon (tile order, skipping the Reaper companion), X the previous one.
R retries only on the ending card.
Pistol equipment switches the contextual controls. Independent pointers allow moving while attacking; menu,
rotation and focus changes cancel held input. Audio starts on a player gesture.
World/actor coordinates and ownership are in CONTRACT.md.

World layouts load for the starting or destination area. The selected actor
manifest loads its model foundations; the current starting roster uses all five.
Original portable authoring assets remain private/in source; publication prunes
unused files. Current tests/build closure and HTTPS bytes are evidence of their
own scope. Physical iPhone/Android cold/warm loading, audio, sustained pacing,
simultaneous touch and full-fight feel require real-device evidence.

No active engine project/native client/engine test or fallback. Retired emergency
reference is outside all active checkouts and webroots; see canonical retirement
brief. Git history and asset provenance remain historical records only.
