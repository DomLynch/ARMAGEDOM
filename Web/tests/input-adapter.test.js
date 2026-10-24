import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInput } from '../src/input.js';

// Node supplies real EventTarget dispatch; only the DOM surface is substituted.
class Element extends EventTarget {
  constructor() {
    super();
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.style = new Map();
    this.style.setProperty = this.style.set.bind(this.style);
    this.dataset = {};
  }
  setPointerCapture() {}
}
function send(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  const {timeStamp,...rest}=values;Object.assign(event,{clientX:0,clientY:0,pointerId:1,...rest});if(timeStamp!==undefined)Object.defineProperty(event,'timeStamp',{value:timeStamp});
  target.dispatchEvent(event);
}
function setup(t, pistol = false, hybrid = false) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const window = new EventTarget(),
    document = new EventTarget();
  const elements = Object.fromEntries(
    ['move', 'slash', 'heavy', 'guard', 'dodge', 'menu', 'entry', 'ending'].map(
      (id) => [id, new Element()],
    ),
  );
  document.body = new Element();
  document.hidden = false;
  elements.entry.hidden = true;
  elements.ending.hidden = true;
  elements.menu.open = false;
  for (const id of ['slash', 'heavy', 'guard', 'dodge'])
    elements[id].dataset.action = id;
  document.getElementById = (id) => elements[id];
  document.querySelector = (selector) => elements[selector.slice(1)];
  document.querySelectorAll = (selector) =>
    selector === '[data-action]'
      ? ['slash', 'heavy', 'guard', 'dodge'].map((id) => elements[id])
      : Object.values(elements).filter((el) =>
          el.classList.contains('pressed'),
        );
  globalThis.window = window;
  globalThis.document = document;
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  const env = {
    window,
    document,
    elements,
    canvas: new Element(),
    paused: false,
    retries: 0,
    menus: 0,
  };
  document.elementFromPoint=()=>env.surface??env.canvas;env.uiRects=[];const previousQuery=document.querySelectorAll;document.querySelectorAll=selector=>selector.startsWith('#vitals,')?env.uiRects:previousQuery(selector);
  env.input = attachInput({
    canvas: env.canvas,
    isPistol: () => pistol,
    isWorldGun:()=>hybrid,
    isPaused: () => env.paused,
    onRetry: () => env.retries++,
    onMenu: () => env.menus++,
  });
  return env;
}

for (const ending of ['pointercancel', 'lostpointercapture']) {
  test(`${ending} discards only the cancelled action's unconsumed press`, (t) => {
    const { elements: e, input } = setup(t);
    send(e.heavy, 'pointerdown', { pointerId: 1 });
    send(e.slash, 'pointerdown', { pointerId: 2 });
    send(e.heavy, ending, { pointerId: 1 });
    assert.deepEqual(input.take().actions, ['slash']);
    assert.equal(e.heavy.classList.contains('pressed'), false);
    assert.equal(e.slash.classList.contains('pressed'), true);
  });
}
test('quick released tap survives normal automatic lost capture exactly once', (t) => {
  const { elements: e, input } = setup(t);
  send(e.heavy, 'pointerdown');
  send(e.heavy, 'pointerup', { clientX: -100 });
  send(e.heavy, 'lostpointercapture');
  assert.deepEqual(input.take().actions, ['heavy']);
  assert.deepEqual(input.take().actions, []);
});
for (const action of ['guard', 'dodge']) {
  test(`cancelled ${action} cannot emit a fresh press on the next frame`, (t) => {
    const { elements: e, input } = setup(t);
    send(e[action], 'pointerdown');
    send(e[action], 'pointercancel');
    const value = input.take();
    assert.equal(value.guard, false);
    assert.equal(value.guardPressed, false);
    assert.equal(value.dodge, false);
  });
}
test('cancel does not clear independent movement or a second guard hold', (t) => {
  const { elements: e, input } = setup(t);
  send(e.move, 'pointerdown', { pointerId: 1 });
  send(e.move, 'pointermove', { pointerId: 1, clientX: 30 });
  send(e.guard, 'pointerdown', { pointerId: 2 });
  input.take();
  send(e.guard, 'pointerdown', { pointerId: 3 });
  send(e.guard, 'pointercancel', { pointerId: 3 });
  const value = input.take();
  assert.ok(value.move.x > 0);
  assert.equal(value.guard, true);
  assert.equal(value.guardPressed, false);
});
test('two thumbs: move and attack held together through the real pointer path, each releasing alone', (t) => {
  const { elements: e, input } = setup(t);
  send(e.move, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
  send(e.move, 'pointermove', { pointerId: 1, clientX: 130, clientY: 300 });
  send(e.slash, 'pointerdown', { pointerId: 2, clientX: 600, clientY: 300 });
  const first = input.take();
  assert.equal(first.moveHeld, true);
  assert.ok(first.move.x > 0);
  assert.deepEqual(first.actions, ['slash']);
  assert.deepEqual(
    first.actionEdges.started.map((p) => p.kind),
    ['slash'],
  );
  assert.deepEqual(first.held, ['slash']);
  // A third contact on the pad cannot take over steering from the first thumb.
  send(e.move, 'pointerdown', { pointerId: 3, clientX: 100, clientY: 300 });
  send(e.move, 'pointermove', { pointerId: 3, clientX: 70, clientY: 300 });
  const held = input.take();
  assert.ok(held.move.x > 0);
  assert.deepEqual(held.actions, []);
  assert.deepEqual(held.held, ['slash']);
  assert.equal(e.move.classList.contains('pressed'), true);
  assert.equal(e.slash.classList.contains('pressed'), true);
  // Lifting the attack thumb ends the attack and leaves movement running.
  send(e.slash, 'pointerup', { pointerId: 2 });
  const afterAttack = input.take();
  assert.equal(afterAttack.moveHeld, true);
  assert.ok(afterAttack.move.x > 0);
  assert.deepEqual(afterAttack.held, []);
  assert.deepEqual(
    afterAttack.actionEdges.released.map((p) => p.kind),
    ['slash'],
  );
  assert.equal(e.slash.classList.contains('pressed'), false);
  // Attack again, then lift the move thumb: the attack stays held and movement stops.
  send(e.slash, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 300 });
  input.take();
  send(e.move, 'pointerup', { pointerId: 1 });
  const afterMove = input.take();
  assert.equal(afterMove.moveHeld, false);
  assert.deepEqual(afterMove.move, { x: 0, y: 0 });
  assert.deepEqual(afterMove.held, ['slash']);
});
test('released drag cannot steer a later tap', (t) => {
  const { elements: e, input } = setup(t);
  send(e.slash, 'pointerdown');
  send(e.slash, 'pointermove', { clientX: 30 });
  assert.deepEqual(input.take().aim, { x: 1, y: 0 });
  send(e.slash, 'pointerup');
  send(e.heavy, 'pointerdown', { pointerId: 2 });
  assert.equal(input.take().aim, null);
});
test('releasing latest aim pointer restores another live aimed guard', (t) => {
  const { elements: e, input } = setup(t);
  send(e.guard, 'pointerdown', { pointerId: 1 });
  send(e.guard, 'pointermove', { pointerId: 1, clientY: 30 });
  send(e.slash, 'pointerdown', { pointerId: 2 });
  send(e.slash, 'pointermove', { pointerId: 2, clientX: 30 });
  assert.deepEqual(input.take().aim, { x: 1, y: 0 });
  send(e.slash, 'pointercancel', { pointerId: 2 });
  assert.deepEqual(input.take().aim, { x: 0, y: 1 });
});
test('canvas cancellation cannot queue a mouse attack', (t) => {
  const { canvas, input } = setup(t);
  send(canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
  send(canvas, 'pointercancel');
  assert.deepEqual(input.take().actions, []);
});
test('R is blocked during pause, menu, loading and hidden document', (t) => {
  const env = setup(t);
  env.paused = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.paused = false;
  env.elements.menu.open = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.elements.menu.open = false;
  env.elements.entry.hidden = false;
  send(env.window, 'keydown', { code: 'KeyR' });
  env.elements.entry.hidden = true;
  env.document.hidden = true;
  send(env.window, 'keydown', { code: 'KeyR' });
  assert.equal(env.retries, 0);
});
test('R retries active play and death once per fresh press', (t) => {
  const env = setup(t);
  send(env.window, 'keydown', { code: 'KeyR' });
  send(env.window, 'keydown', { code: 'KeyR', repeat: true });
  env.paused = true; // main includes finished in its pause predicate.
  env.elements.ending.hidden = false;
  send(env.window, 'keydown', { code: 'KeyR' });
  assert.equal(env.retries, 2);
});
test('Escape repeat does not repeatedly toggle the menu', (t) => {
  const env = setup(t);
  send(env.window, 'keydown', { code: 'Escape' });
  send(env.window, 'keydown', { code: 'Escape', repeat: true });
  assert.equal(env.menus, 1);
});
test('blur and visibility handlers clear held and queued intent', (t) => {
  const env = setup(t);
  for (const [target, type] of [
    [env.window, 'blur'],
    [env.document, 'visibilitychange'],
  ]) {
    send(env.elements.heavy, 'pointerdown');
    send(env.elements.guard, 'pointerdown', { pointerId: 2 });
    send(target, type);
    const value = env.input.take();
    assert.deepEqual(value.actions, []);
    assert.equal(value.guard, false);
    assert.equal(value.guardPressed, false);
  }
});
test('cancelling a reused pointer ID preserves its earlier completed quick tap', (t) => {
  const { elements: e, input } = setup(t);
  send(e.slash, 'pointerdown');
  send(e.slash, 'pointerup');
  send(e.heavy, 'pointerdown');
  send(e.heavy, 'pointercancel');
  assert.deepEqual(input.take().actions, ['slash']);
});

for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`second movement touch cannot steal steering or stop the owner on ${ending}`, (t) => {
    const { elements: e, input } = setup(t);
    send(e.move, 'pointerdown', { pointerId: 1 });
    send(e.move, 'pointermove', { pointerId: 1, clientX: 46 });
    send(e.move, 'pointerdown', { pointerId: 2 });
    send(e.move, 'pointermove', { pointerId: 2, clientX: -46 });
    assert.deepEqual(input.take().move, { x: 1, y: 0 });
    send(e.move, ending, { pointerId: 2 });
    assert.deepEqual(input.take().move, { x: 1, y: 0 });
    assert.equal(e.move.style.get('--knob-x'), '36px');
    assert.equal(e.move.classList.contains('pressed'), true);
    send(e.move, 'pointercancel', { pointerId: 1 });
    assert.deepEqual(input.take().move, { x: 0, y: 0 });
    assert.equal(e.move.style.get('--knob-x'), '0px');
    assert.equal(e.move.classList.contains('pressed'), false);
    send(e.move, 'pointerdown', { pointerId: 3 });
    send(e.move, 'pointermove', { pointerId: 3, clientY: -46 });
    assert.deepEqual(input.take().move, { x: 0, y: -1 });
  });
}

test('pistol touch button taps once and holds Fire without an aiming drag', t=>{
 const {elements:e,input}=setup(t,true);send(e.slash,'pointerdown');send(e.slash,'pointerup');
 let i=input.take();assert.deepEqual(i.actions,['fire']);assert.deepEqual(i.held,[]);assert.equal(i.aim,null);
 assert.deepEqual(input.take().actions,[]);send(e.slash,'pointerdown',{pointerId:2});
 i=input.take();assert.deepEqual(i.held,['fire']);assert.equal(i.aim,null);
 send(e.slash,'pointercancel',{pointerId:2});assert.deepEqual(input.take().held,[]);
});
test('Fire drag never gains an aim arrow and another pointer cannot replace its owner', t=>{
 const {elements:e,input}=setup(t,true);send(e.slash,'pointerdown',{pointerId:1,clientX:100,clientY:100});send(e.slash,'pointermove',{pointerId:1,clientX:100,clientY:70});const angle=e.slash.style.get('--aim-angle');assert.equal(angle,'0rad');assert.equal(e.slash.classList.contains('aiming'),false);
 send(e.slash,'pointerdown',{pointerId:2,clientX:100,clientY:100});assert.equal(e.slash.style.get('--aim-angle'),angle);send(e.slash,'pointerup',{pointerId:2});assert.equal(e.slash.style.get('--aim-angle'),angle);
 send(e.slash,'pointercancel',{pointerId:1});assert.equal(e.slash.style.get('--aim-angle'),'0rad');assert.equal(e.slash.classList.contains('aiming'),false);assert.equal(input.take().fireAim,null);send(e.slash,'pointerdown',{pointerId:3});assert.equal(e.slash.style.get('--aim-angle'),'0rad');input.clear();assert.equal(e.slash.style.get('--aim-angle'),'0rad');
});

test('keyboard Special and Space Dodge remain available without a Special touch node',t=>{
 const env=setup(t);
 send(env.window,'keydown',{code:'KeyE'});assert.ok(env.input.take().actions.includes('special'));send(env.window,'keyup',{code:'KeyE'});
 send(env.window,'keydown',{code:'Space'});assert.equal(env.input.take().dodge,true);send(env.window,'keyup',{code:'Space'});
});

test('disposing input removes owned gameplay and browser listeners',t=>{const env=setup(t);send(env.window,'keydown',{code:'KeyW'});assert.equal(env.input.state.keys.has('KeyW'),true);env.input.dispose();send(env.window,'keydown',{code:'KeyD'});assert.equal(env.input.state.keys.size,0);send(env.elements.slash,'pointerdown');assert.equal(env.input.take().actions.length,0);env.input.dispose();});

const worldEvent=(env,type,values={})=>send(env.canvas,type,{pointerType:'touch',pointerId:31,clientX:200,clientY:300,...values});
test('world touch only emits one completed short tap, never held Fire; successful lostcapture preserves completed tap',t=>{const env=setup(t,true,true);worldEvent(env,'pointerdown');assert.equal(env.input.take().worldTap,undefined);worldEvent(env,'pointerup');worldEvent(env,'lostpointercapture');const out=env.input.take();assert.deepEqual(out.worldTap,{x:200,y:300});assert.deepEqual(out.actions,[]);assert.deepEqual(out.held,[]);assert(out.mobile);assert.equal(env.input.take().worldTap,undefined);});
for(const mode of ['drag','cancel','lost','long','pause','blur','background','touchcancel','release-over-UI'])test('world '+mode+' cannot generate a target/shot intent',t=>{const env=setup(t,true,true);worldEvent(env,'pointerdown',{timeStamp:10});if(mode==='drag'){worldEvent(env,'pointermove',{clientX:230});worldEvent(env,'pointermove');}if(mode==='cancel')worldEvent(env,'pointercancel');if(mode==='lost')worldEvent(env,'lostpointercapture');if(mode==='pause')env.paused=true;if(mode==='blur')send(env.window,'blur');if(mode==='background')send(env.document,'visibilitychange');if(mode==='touchcancel')send(env.document,'touchcancel');if(mode==='release-over-UI')env.surface=env.elements.slash;worldEvent(env,'pointerup',{timeStamp:mode==='long'?500:30});assert.equal(env.input.take().worldTap,undefined);});
test('visual readout clickthrough blocks world tap without treating the entire fullscreen HUD as UI',t=>{const env=setup(t,true,true),node={hidden:false,getClientRects:()=>[1],getBoundingClientRect:()=>({left:180,right:220,top:280,bottom:320,width:40,height:40})};env.uiRects=[node];worldEvent(env,'pointerdown');worldEvent(env,'pointerup');assert.equal(env.input.take().worldTap,undefined);worldEvent(env,'pointerdown',{clientX:260});worldEvent(env,'pointerup',{clientX:260});assert.deepEqual(env.input.take().worldTap,{x:260,y:300});});
for(const moveFirst of[true,false])test('separate movement thumb and world tap are independent, order '+moveFirst,t=>{const env=setup(t,true,true);const move=()=>{send(env.elements.move,'pointerdown',{pointerId:7,pointerType:'touch'});send(env.elements.move,'pointermove',{pointerId:7,clientX:30,clientY:0});};if(moveFirst)move();worldEvent(env,'pointerdown');if(!moveFirst)move();worldEvent(env,'pointerup');const out=env.input.take();assert(out.moveHeld&&out.move.x>0);assert.deepEqual(out.worldTap,{x:200,y:300});assert.equal(env.input.state.pointers.size,1);send(env.elements.move,'pointerup',{pointerId:7});assert(!env.input.take().moveHeld);});
test('two world contacts form a gesture, not two shots; controls never bubble into world tap',t=>{const env=setup(t,true,true);worldEvent(env,'pointerdown');worldEvent(env,'pointerdown',{pointerId:32});worldEvent(env,'pointerup');worldEvent(env,'pointerup',{pointerId:32});assert.equal(env.input.take().worldTap,undefined);send(env.elements.dodge,'pointerdown',{pointerId:5,pointerType:'touch'});send(env.elements.dodge,'pointerup',{pointerId:5,pointerType:'touch'});const out=env.input.take();assert(out.dodge);assert.equal(out.worldTap,undefined);});
test('grenade/melee world tap remains disabled and cancelled reused pointer cannot erase prior completed world tap',t=>{const disabled=setup(t,true,false);worldEvent(disabled,'pointerdown');worldEvent(disabled,'pointerup');assert.equal(disabled.input.take().worldTap,undefined);disabled.input.dispose();const env=setup(t,true,true);worldEvent(env,'pointerdown');worldEvent(env,'pointerup');worldEvent(env,'pointerdown',{clientX:250});worldEvent(env,'pointercancel',{clientX:250});assert.deepEqual(env.input.take().worldTap,{x:200,y:300});});

test('direct mouse press and keyboard action return to existing desktop input after touch, without needing a pointermove',t=>{const env=setup(t,true,true);worldEvent(env,'pointerdown');worldEvent(env,'pointerup');assert(env.input.take().mobile);send(env.canvas,'pointerdown',{pointerType:'mouse',button:0,pointerId:88,clientX:250,clientY:350});const mouse=env.input.take();assert(!mouse.mobile);assert.deepEqual(mouse.mouse,{x:250,y:350});assert.deepEqual(mouse.actions,['fire']);send(env.canvas,'pointerup',{pointerType:'mouse',pointerId:88});worldEvent(env,'pointerdown');worldEvent(env,'pointerup');env.input.take();send(env.window,'keydown',{code:'Space'});const keyboard=env.input.take();assert(!keyboard.mobile);assert(keyboard.dodge);assert.equal(keyboard.worldTap,undefined);});
