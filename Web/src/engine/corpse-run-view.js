import * as T from "three";
import { GAME_DATA } from "./game-data.js";

// The body bag on screen (state: engine/corpse-run.js `g.corpseBag`; styling: data/corpseRun.json `view`). A dark sack with a pale strap
// and a thin faint orange column over it, visible only in the area where the player fell. Built when the first bag drops; shared
// geometry and materials, nothing allocated per frame.
const basic = (colour, extra = {}) => new T.MeshBasicMaterial({ color: `#${colour}`, toneMapped: false, ...extra });

export function createCorpseRunView(scene, toRender) {
  const style = GAME_DATA.corpseRun.view,
    root = new T.Group(),
    sackGeometry = new T.BoxGeometry(style.bagLength, style.bagHeight, style.bagWidth),
    strapGeometry = new T.BoxGeometry(style.bagLength, style.bagHeight * (1 + style.trimShare), style.bagWidth * style.trimShare),
    beaconGeometry = new T.CylinderGeometry(style.beaconRadius, style.beaconRadius, style.beaconHeight, style.segments),
    beaconMaterial = basic(style.beaconColour, { transparent: true, opacity: style.beaconOpacity, depthWrite: false }),
    sackMaterial = basic(style.bagColour),
    strapMaterial = basic(style.trimColour),
    // The pickup ring on the ground, exactly the size you must stand in (retrieve.radius), thin like the cash-stash ring.
    radius = GAME_DATA.corpseRun.retrieve.radius,
    ringGeometry = new T.RingGeometry(radius, radius + style.ringWidth, style.ringSegments).rotateX(-Math.acos(0)),
    ringMaterial = basic(style.beaconColour, { transparent: true, opacity: style.ringOpacity, depthWrite: false, side: T.DoubleSide }),
    ring = new T.Mesh(ringGeometry, ringMaterial),
    sack = new T.Mesh(sackGeometry, sackMaterial),
    strap = new T.Mesh(strapGeometry, strapMaterial),
    beacon = new T.Mesh(beaconGeometry, beaconMaterial);
  beacon.position.y = style.beaconHeight / (1 + 1);
  root.name = "corpse-bag";
  ring.position.y = -style.bagHeight / (1 + 1); // the ring lies on the ground under the sack
  root.add(sack, strap, beacon, ring);
  root.visible = false;
  scene.add(root);
  let disposed = false;
  return {
    root,
    // Called every frame with the game: shows the bag when it lies in the area the player is in.
    update(g) {
      const bag = g.corpseBag;
      root.visible = !!bag && g.world?.areaId === bag.areaId;
      if (!root.visible) return;
      root.position.copy(toRender(bag.at, style.groundLift + style.bagHeight / (1 + 1)));
      const beat = Math.cos((g.time * Math.PI) / style.pulseSeconds);
      beaconMaterial.opacity = style.beaconOpacity * (1 - beat * beat * style.beaconOpacity);
      ringMaterial.opacity = style.ringOpacity * (1 - beat * beat * style.beaconOpacity);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      const resources = [sackGeometry, strapGeometry, beaconGeometry, ringGeometry, sackMaterial, strapMaterial, beaconMaterial, ringMaterial];
      for (const resource of resources) resource.dispose();
    },
  };
}
