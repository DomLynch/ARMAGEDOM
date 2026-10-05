# Finisher presentation contract — ready for component review, 2026-10-05

See [HANDOFF.md](HANDOFF.md) for source hashes, exact captures and integration order.
createFinisherPresentation({root,model,clips,scene,groundY,isBlocked,isPlayer,
prepareHead,maxVertices}) -> support/start/pose/update/stats/dispose.

Prepared support IDs: pistol-directional (Death with internal native Hit prefix,
2.7333334386348724s,cost0,parts[]); decapitation (Death_SplitCrown1s,cost1,
partshead,maximum6s). Ordinary native Death2.400000095s retained by selector/fallback.
Selected outcome recipeId/damageType/impactDirection matches Combat50675b0.
Unknown regions stay unknown. Pistol never cuts/impales/detaches a part.

Use prepareHead:false for independently deliverable gun reaction, zero geometry
prep. Otherwise prepare NPC head at birth after current face/private materials and
native motion initialization. No whole50-face requirement or existing face API edit.
Private head snapshot owns geometry/materials and borrows maps; dispose presentation
before face handle/actor source teardown. Missing/unready anatomy falls ordinary.
No existing runtime/source asset edit in this lane; WebUI alone integrates.
