import test from 'node:test';import assert from 'node:assert/strict';
import {createHUD} from '../src/hud.js';
// Records DOM mutations the way a browser would: assigning the value an element already holds is still a write here.
class Node extends EventTarget{
 constructor(counter,id){super();this.counter=counter;this.id=id;this._text='';this._hidden=false;this._disabled=false;this.open=false;this.attrs=new Map();this.classes=new Set();this.kids=new Map();
  const self=this,styleValues={};
  this.style={get width(){return styleValues.width??'';},set width(v){self.hit('width');styleValues.width=v;},setProperty(name,v){self.hit(name);styleValues[name]=v;}};
  this.classList={toggle:(name,on)=>{const had=this.classes.has(name);if(!!on!==had)this.hit('class '+name);on?this.classes.add(name):this.classes.delete(name);},remove:(...names)=>{for(const name of names)if(this.classes.delete(name))this.hit('class '+name);},contains:name=>this.classes.has(name)};}
 hit(what){this.counter.writes.push(this.id+'.'+what);}
 get textContent(){return this._text;}set textContent(v){this.hit('text');this._text=String(v);}
 get hidden(){return this._hidden;}set hidden(v){this.hit('hidden');this._hidden=v;}
 get disabled(){return this._disabled;}set disabled(v){this.hit('disabled');this._disabled=v;}
 getAttribute(name){return this.attrs.get(name)??null;}setAttribute(name,v){this.hit('attr '+name);this.attrs.set(name,String(v));}
 querySelector(selector){if(!this.kids.has(selector))this.kids.set(selector,new Node(this.counter,this.id+' '+selector));return this.kids.get(selector);}
 showModal(){this.open=true;}close(){this.open=false;}focus(){}
}
function setup(t){
 const prior={document:globalThis.document,window:globalThis.window},counter={writes:[]},nodes=new Map();
 globalThis.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node(counter,id));return nodes.get(id);},hidden:false,body:new Node(counter,'body'),addEventListener(){}};
 globalThis.window=new EventTarget();
 t.after(()=>{for(const key of ['document','window']){if(prior[key]===undefined)delete globalThis[key];else globalThis[key]=prior[key];}});
 const hud=createHUD({onRetry(){},onPause(){},onSound(){}});counter.writes.length=0;
 return{hud,counter,nodes};
}
const game=()=>({pilot:'donor-knife',time:10,wave:1,enemies:[{kind:3,hp:50,maxHP:100}],message:'Hello',messageUntil:99,finished:false,
 pistol:{collected:true,equipped:true,magazine:4,reserve:9,reloadingUntil:0,nextFireAt:10.2,pickupPos:{x:0,z:0},pickupAreaId:'westminster'},
 world:{areaId:'westminster'},cooldowns:{heavy:0,dodge:.6},
 player:{hp:75,maxHP:150,stamina:60,maxStamina:100,guarding:false,guardBrokenUntil:0,heavyReady:12,dodgeReady:10.3,pos:{x:5,z:5},weapon:'pistol'}});
test('a second identical HUD update makes zero DOM writes',t=>{
 const{hud,counter}=setup(t),g=game();hud.update(g);assert(counter.writes.length>0,'first update paints the HUD');
 counter.writes.length=0;hud.update(g);hud.update(g);assert.deepEqual(counter.writes,[]);
});
test('a changed value is still written and the DOM shows it',t=>{
 const{hud,counter,nodes}=setup(t),g=game();hud.update(g);counter.writes.length=0;
 g.player.hp=30;g.pistol.magazine=3;g.message='Changed';hud.update(g);
 assert(counter.writes.length>0);assert.equal(nodes.get('health-number').textContent,'30 / 150');assert.equal(nodes.get('health-fill').style.width,'20%');
 assert.match(nodes.get('ammo').textContent,/3 \/ 6/);assert.equal(nodes.get('notice').textContent,'Changed');
 counter.writes.length=0;hud.update(g);assert.deepEqual(counter.writes,[]);
});
