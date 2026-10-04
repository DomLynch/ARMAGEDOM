# Lean client contract

The browser client uses Three.js directly, with Vite for builds. Keep the single
runtime dependency and existing module seams until an actual feature needs more.
Unity `Game/` is retained rollback/reference, not part of the web runtime.

| Boundary | Owner modules | Rule |
| --- | --- | --- |
| Composition and frame loop | `main.js` | Creates systems, schedules fixed simulation ticks and renders. No combat rules here. |
| Simulation | `combat.js`, `donor/knife.js`, `hollow-encounter.js` | Plain game state and explicit inputs/events. No DOM, renderer or network calls. |
| World and collision | `world.js`, `world-geometry.js`, `travel.js` | World owns coordinates, loading and collision; travel is an optional orchestration seam. |
| Character presentation | `actors.js`, `actor-resources.js`, `motion.js`, `donor-motion.js` | Visuals consume simulation. Source resources belong to the library; clones own materials and skeletons. |
| Browser adapters | `input.js`, `hud.js` | Convert gestures to intents and game state to display. Do not duplicate gameplay costs or rules. |
| Effects and sound | `effects.js`, `donor-audio.js` | Consume events. Each async load owns its cancellation and resources. |

Keep repeated enemy/weapon differences in validated profiles, not copies of the
game loop. Add a module when responsibility or ownership actually separates;
avoid a generic ECS, service container, event bus or engine wrapper for this slice.
The existing dependency graph should stay acyclic. Keep backend work outside the
offline combat loop; this prototype is not multiplayer authority.

`combat.js` currently holds both legacy and knife-pilot rules. Preserve the tested
legacy path until explicitly retired. Before adding another independent combat
family, extract the demonstrated common rules and profile-specific behavior;
do not grow more scattered pilot branches or import an entire donor engine.

Use `npm run metrics` for physical LOC/bytes, with generated contact samples,
tests, tooling and CSS listed separately. Dense one-line code is not lean code:
prefer readable functions and review source bytes, dependencies and responsibility
alongside LOC. Format a module when it receives substantial work; avoid mass
formatting while another lane owns it.

Build with `npm run build`: the existing asset-closure check prunes unselected
copies only from generated `dist/`. Keep original art and pinned provenance.
Do not ship all of `public/`, dependencies, tests or historical Unity builds.

Verification: `npm run check`, `npm run test:packaging`, `npm run build`.
Code/build evidence does not replace a complete browser fight, physical-phone
simultaneous touch, focus/resume or sustained frame-pacing measurements.
