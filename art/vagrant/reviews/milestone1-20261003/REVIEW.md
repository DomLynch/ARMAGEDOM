# Survivor review — milestone1, 2026-10-03

Decision: retain the current survivor for the bounded combat demo. Character art
acceptance remains pending Dom. Fix one demonstrated blocker next: weapon-hand
folds and projecting thumb. No new generation, replacement rig, outfit/enemy batch
or cloud spend. World owns Editor; Lead's combat review follows its release.

Reviewed current runtime FBXb7537dca...e6cb9 against final imported-model and native
captures from build_3e66f238bb5f. Hash still matches. This earlier character build
is evidence of that art review, not the latest World build/release. Saved London
review camera: scale1.265/FOV42; milestone demo uses current saved zoom1.65.
No new native or Editor capture was made in this review.

| Check | Existing evidence | Acceptance gap |
| --- | --- | --- |
| Movement | Actual imported run pose shows bent elbows/knee lift; original19bone/rest/actions and4Vagrant regressions passed. Zipper visibly buckles. | Continuous native movement, transitions and return-to-idle need Dom review. |
| Attack/grip | Imported attack raises machete; native-attacks records alive Wave1,3hostiles,12HP/shockwave cooldown. Close-up grip has severe skin folds/bulky pads/projecting thumb. | Convincing closed grip and readable attack contact not accepted. |
| Dodge | SPACE was sent during earlier native check; original controller preserved. | Input attempt alone does not establish dodge trajectory/foot contact. Capture a full dodge in Lead demo. |
| Gear | Existing sampled equipment test passes; staged equipped front and back views show separate vest/backpack, strongest difference from rear. | Dom needs a live before/after swap while moving. Staged toggles do not prove pickup/stat/save loop. |
| Readability | Existing London frame supports civilian olive jacket/dark legs and visible machete at saved scale; front vest contrast subtle. | Dom judges silhouette/telegraphs/contact in mixed fight. No camera enlargement to conceal issues. |

## One smallest next correction

Repair/sculpt only the weapon-hand surface around the existing handle in a separate
candidate. Preserve wrist bind,19bone rig, original animation assets, controller,
colliders, weapon transform, camera and scale. Existing rig has no finger bones:
a static authored grip can support this weapon family; finger articulation is not
proved or added. Preserve clean hand topology/UV continuity and inspect thumb/index
from front/back/both sides before export. Do not repeat broad palm smoothing: the
4mm/8iteration trial worsened folds and was rejected. Do not cover the defect with
new gloves or regenerate the whole character.

Before retaining any later repair: final-export grip close-up and idle/run/attack
views must visibly improve; existing rig/pose/gear/collision thresholds stay intact.
Then use Lead's assigned native demo for move/attack/dodge/gear change, original
saved camera and Dom acceptance. No new render/test/build batch started here.

## Pending front reference

The new front-only image is a design concept, not this game's current mesh. Its
open palms/five separated fingers are a better generation input than curled grips;
Tripo reconstruction and closed-grip quality remain unproved. It uses a sleeveless
shirt/knee shorts after the image tool rejected underwear-only generation. File is
1024x1536, not native4K. Dom's reference review is pending; no Tripo paid operation.

Sources: receipt.json pins every reviewed image; polish/review/acceptance.json
contains historical character gates; references/front-pilot-20261003/receipt.json
contains image-generation scope/resolution. Do not reuse the old27/28 suite as the
current whole-game result; later World receipts supersede that historical failure.
