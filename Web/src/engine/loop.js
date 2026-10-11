import * as THREE from 'three';
import {stepGame,resetMobileControls} from '../combat.js';
import {pistolPointerPoint} from '../pistol-targeting.js';
export function createBrowserLoop(s){
let last=0,accumulator=0,submitted=null;
function toDomain(v) {
  return {
    x: v.x * s.world.cameraRight.x - v.y * s.world.cameraForward.x,
    z: v.x * s.world.cameraRight.z - v.y * s.world.cameraForward.z,
  };
}
function combatVisibleIds() {
  return s.game.enemies.filter(e => {const v=s.world.toRender(e.pos,1).project(s.world.camera);return Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&v.z>=-1&&v.z<=1;}).map(e=>e.id);
}
function intent() {
  const raw = submitted ?? s.input.take(),
    value = {
      ...raw,
      manualPistolAim: !!raw.fireAim,
      combatVisibleIds: combatVisibleIds(),
      move: toDomain(raw.move),
      aim: s.game.pistol?.equipped ? raw.fireAim ? toDomain(raw.fireAim) : null : raw.aim ? toDomain(raw.aim) : null,
    };
  if (raw.mouse) {
    const bounds = s.canvas.getBoundingClientRect(),
      x=((raw.mouse.x-bounds.left)/bounds.width)*2-1,
      y=1-((raw.mouse.y-bounds.top)/bounds.height)*2,
      point=s.game.pistol?.equipped?pistolPointerPoint(s.world,s.actors.views,s.game.enemies,x,y):s.world.screenToGround(x,y);
    if (point) {
      value.manualPistolAim = true;
      value.aim = {
        x: point.x - s.game.player.pos.x,
        z: point.z - s.game.player.pos.z,
      };
    }
  }
  if(submitted)submitted={...submitted,actions:[],guardPressed:false,dodge:false};
  return value;
}
function frame(ms,providedElapsed) {
  const elapsed = providedElapsed ?? (last ? Math.max(0, (ms - last) / 1000) : 0), dt = Math.min(0.1, elapsed);
  last = ms;
  if (!s.world || !s.game || s.contextLost) return;
  // Travel holds this frame and simulation. Re-rendering the unchanged rigs
  // consumes the idle budget needed to finish the destination's preparation.
  if(s.traveling){s.hud.update(s.game);return;}
  s.effects?.advance(elapsed,{paused:s.paused||s.traveling});
  if (s.loaded && !s.paused && !s.traveling && !s.game.finished) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      const weaponBefore = s.game.player.weapon;
      stepGame(s.game, intent(), 1 / 60,{dispatchPistol:s.dispatchPistol});
      if (weaponBefore !== s.game.player.weapon) {s.input.clear();submitted=null;resetMobileControls(s.game);}
      s.collectNearbySupplies(s.game);
      s.collectNearbyVest(s.game);
      s.persistRun(s.game);
      s.effects.events(s.game);
      s.actors?.events(s.game);
      s.audio.play(s.game.events);s.emit(s.game.events);
      accumulator -= 1 / 60;
      if(s.areas.checkExit())break;
      if (s.game.finished) {
        resetMobileControls(s.game);
        s.game.pistolTargetId = null;
        s.game.pistolTargetFacing = null;
        s.input.clear();
        break;
      }
    }
  }
  s.world.update(s.game.player.pos, s.paused ? 0 : dt, innerWidth, innerHeight);
  s.atmosphere?.update(dt, {paused: s.paused || s.traveling});
  s.updateSupplies();
  s.updateVestBag();
  s.actors?.update(s.game, s.paused || s.traveling ? 0 : dt, s.effects?.pistolRecoil(s.game)??0,{presentationDt:s.paused||s.traveling?0:elapsed});
  s.effects?.update(s.game,{paused:s.paused||s.traveling,visibleIds:combatVisibleIds(),viewportHeight:s.canvas.clientHeight,viewportWidth:s.canvas.clientWidth});
  s.rim.position
    .copy(s.world.toRender(s.game.player.pos, 2.4))
    .add(new THREE.Vector3(0, 0, 0.8));
  s.hud.update(s.game);
  if(s.effects)s.effects.render(s.renderer,s.camera,s.game,s.canvas.clientHeight,s.canvas.clientWidth);else s.renderer.render(s.scene,s.camera);
}
return {frame,intent,combatVisibleIds,reset(){last=0;accumulator=0;submitted=null;},input(value){if(!value||typeof value!=="object")throw new TypeError("Input object required");submitted=structuredClone({move:{x:0,y:0},actions:[],held:[],...value});},step(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new TypeError('Finite nonnegative step required');frame(last+seconds*1000,seconds);}};
}
