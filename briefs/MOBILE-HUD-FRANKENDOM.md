# Mobile HUD pass — Frankendom reference

> Active platform: [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md),
> owner decision 2026-10-04. Unity/native instructions and public-retention rules
> in older records are historical; private recovery archives are not live rollback.

2026-10-03. Owner requests mobile buttons, burger menu and Frankendom look/feel
inspiration. Lead owns this bounded Three.js UI pass under TEAM-AND-REUSE.md. No combat,
weapon, stamina, account or inventory expansion. Keep the loading-time gate open.

## Observed evidence

Strategy viewed the owner screenshots ARMAGEDOM Westminster preview (portrait and
landscape) and Frankendom Origins14 in Downloads, and inspected frankendom.com
live in the desktop browser. The phone reference is the OWNER SCREENSHOT; desktop
live inspection is not a physical-phone test. Frankendom source style.css1180–1261
also demonstrates safe-area offsets and touch-action handling; do not blindly port
legacy CSS rules into the current client or assume that block alone defines the current phone HUD.

ARMAGEDOM portrait: large empty bands, stacked/overlapping orientation messages,
small world view, debug-style panels and square controls. Landscape: thick header
panels, six equal rectangles, separate large aim box, small low-contrast survivor.
Frankendom reference: transparent circular joystick and action cluster, thin bars,
upper-right circular menu, open centre for combat. Its Skill/menu overlap and test
banner are NOT patterns to copy. Reuse the layout hierarchy, not its medieval skin,
extra Kick action, stamina mechanics or full menu feature inventory.

## Concrete next candidate

- Landscape-first mobile combat surface sized to actual available browser viewport.
  Account for Safari expanding/collapsing chrome, notch and home indicator. No
  stretched London artwork or blind aspect-ratio crop that breaks world registration.
- In portrait show ONE clean rotate overlay, suppress underlying combat HUD/input,
  clear held inputs and safely suspend this local encounter. Rotation back restores
  controls. Do not claim orientation/fullscreen locks reliably hide Safari chrome.
- Left thumb: translucent circular movement joystick. Right thumb: comfortable
  curved cluster for Slash / Stab / Heavy / Special / Dodge / Guard, preserving
  current simultaneous movement/aim/action and timed guard semantics. Avoid adding
  a third-thumb requirement with the aim widget; choose a reachable aiming layout
  and demonstrate move+aim+attack, held guard+movement and dodge. Do not silently
  replace aim rules or add autoattack/targeting as part of cosmetic work.
- Short readable labels or icons plus short labels; strong pressed/held indication,
  cooldown arc/disabled state and finite guard feedback. Prototype combat hit zones
  at least44CSSpx at normal viewport scale, larger where comfortable; verify actual
  phone thumb reach/spacing. Apple44pt guidance is a reference, not a universal CSS pixel equivalence.
- Compact player HP top-left, small immediate objective/wave text, menu top-right.
  Move persistent title, build/version, instructions, damage/loot legend and other
  secondary text behind the menu. Keep meaningful in-fight feedback visible.
- Menu contains only existing useful actions: Resume, Controls/help, existing
  sound toggle if supported, explicit Retry. Avoid accidental retry and prevent
  menu touches from triggering attacks. Do not add new equipment/settings systems.
- Retain post-nuclear visual identity: restrained charcoal, warm off-white, amber
  accent and red health. Light transparent panels with contrast, no heavy art downloads
  or blur effects solely for HUD. Keep centre clear; assess survivor readability
  in a real fight, preserving owner world/actor calibration until a separate reasoned
  camera adjustment is needed. Do not force a duelling camera onto the London map.
- Preserve keyboard/mouse desktop play; touch controls should not dominate desktop
  unless touch input is in use. Keep responsive layout separate from combat rules.

## Evidence and scope

First produce a reviewable in-game landscape layout and clean portrait overlay,
then verify concurrent touches, button releases/cancel, menu open/close, rotate,
focus/resume and desktop input. Include iPhone15-sized browser-chrome/safe-area
captures, but label emulation separately from actual iPhone/Android play. Final
acceptance is Dom's phone fight, not another control-test-only completion claim.
Show before/after at the SAME viewport and preserve immutable006 rollback. Record
added payload and fresh loading timing; cosmetic work must not undo size reductions.
No new world, character redesign, engine rewrite or lengthy design-system project.

References checked: https://developer.apple.com/design/human-interface-guidelines/game-controls
https://developer.apple.com/design/tips/
https://web.dev/blog/viewport-units


## Owner-requested touch-control benchmark — 2026-10-03

Research supplements the existing candidate, not a new implementation project.
Official sources checked include current support/docs and explicitly dated older
patterns; these are not hands-on tests of every game's current mobile build.

- PUBG Mobile: custom button placement and saved/shared layouts. Borrow reachable
  grouping and configurable developer layout values; a player HUD editor is later.
  https://pubgmobile.helpshift.com/hc/en/3-pubg-mobile/faq/280-i-want-to-change-the-location-of-the-control-key/
- Fortnite: current mobile development docs support restyling/repositioning/hiding
  controls and tappable HUD widgets. Borrow clear action icons and selective HUD
  visibility; do not import building-mode complexity or Unreal-specific APIs.
  https://dev.epicgames.com/documentation/fortnite/mobile-development-in-fortnite?lang=en-US
- Call of Duty Mobile: official control guide separates simple/advanced controls
  and HUD customisation. Useful precedent for distinguishing aiming/firing input
  choices from cosmetics; not authority to add auto-fire to ARMAGEDOM.
  https://blog.activision.com/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls
- Albion: official historical mobile update documents joystick movement and
  drag-to-aim spells. This is a closer genre reference than copying FPS camera
  controls; it is not verification of the exact 2026 client behaviour.
  https://forum.albiononline.com/index.php/Thread/128104-Queen-Patch-11-Mobile-Update/
- Once Human's April 2025 mobile launch FAQ explicitly supports custom layouts and
  hiding nonessential UI. Borrow reduced combat clutter from this survival example.
  https://www.oncehuman.game/news/update/20250423/40780_1229512.html
- Apple's WWDC26 touch guidance: comfortable physical size, grouped edge anchors,
  safe areas, clear central character, thumb-reachable frequent actions and top
  menus; rethink awkward multi-button combinations. Apply design principles in
  Three.js mobile web; native-only Touch Controller/Metal APIs are not dependencies.
  https://developer.apple.com/videos/play/wwdc2026/358/

Recommendation: one two-thumb default first. Left movement; right six-action arc
with Slash most prominent, Stab adjacent, Dodge/Guard easiest defensive reaches,
Heavy/Special nearby. Existing hold-guard/timed-parry semantics stay intact.
Avoid a literal keyboard grid or a layout that requires a claw grip. Keyboard and
mouse remain desktop inputs to the same actions, with appropriate desktop hints.

Compare three input approaches cheaply: (A) existing independent aim plus buttons,
(B) action-local drag aiming, (C) assisted targeting. A is simplest but fails if
move+aim+attack needs a third finger. B is the preferred bounded experiment if A
fails, with visible direction and explicit cancellation; attack trigger timing
must be specified and checked against buffering/guard, not silently changed.
C changes combat targeting and remains a separate owner decision. Do not add an
entire targeting framework, auto-fire, gyro, radial combat menu, or HUD editor.

Judge one candidate by actual two-thumb play: move while attacking in another
direction, move while guarding, parry then dodge, distinguish slash/stab reliably,
release outside button, rotate/background without stuck input, and menu without
attack leakage. Check iPhone Safari and Android Chrome browser chrome, not just
native-app/fullscreen assumptions. Physical-phone acceptance stays open.

## New owner direction: playable portrait trial — 2026-10-03

Dom directly asked Lead: "we can have it multi responsive? can u try that? we can
look at it tomorrow as im off to sleep". This supersedes the mandatory portrait
rotate/suspend overlay for the next responsive candidate. Lead is preparing a
separate preview supporting portrait AND landscape, retaining current landscape
and immutable001 rollback. Keep six actions reachable and artwork/collision
registered; evaluate portrait framing/occlusion and orientation changes with
held-input safety. This is an authorised trial, not accepted portrait play.
Owner review is deferred until tomorrow; no overnight approval/feedback request.
