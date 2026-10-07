import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Euler, SkinnedMesh, AnimationMixer, Vector3 } from 'three';

// One pose bake per encounter, prepared before combat like a cached severed prop. Exterior maps are borrowed; only the new geometry and cut material
// belong to this effect. Cut the torso at its waist, retaining both arms with the torso and placing the copied victim knife on the registered ARM ground.
function openWaist(root, anchor, cornerSupports = false) {
  const allocations={geometries:[],cut:null,group:null};const steps = openWaistSteps(root, anchor, cornerSupports,undefined,allocations);
  try{for (;;) { const step = steps.next(); if (step.done) return step.value; }}catch(error){allocations.group?.removeFromParent();for(const g of allocations.geometries)g.dispose();allocations.cut?.dispose();throw error;}
}
// The same bake in steps (a rank look's rebake, #918): at most CHUNK vertices or triangles of one draw per step, then the resting searches and
// the floor table. The caller holds the bake pose around every step (characters.ts), so the rig may play between steps; each step reads the
// rig afresh. One whole draw per step was 160 ms at CPU ×4 on the Goblin L3 body (18.7k tris, goblin-l3-packed4-d45f0f88, row C).
const CHUNK = 2048;
// And at most STEP_MS of it (checked every 256): a vertex count alone let one step of the Nightborn's L8 closed helm run 54.6 ms at CPU ×4
// (nightborn-L8-f3c54a6f, row C), where the Goblin's draws took 2–15. Where a step yields never changes what the bake cuts.
const STEP_MS = 8;
// The resting searches and the floor table read every support point once per candidate: at most SCAN reads per step (pure maths on the
// baked points, so no rig refresh after these yields). The weapon roll plus the floor table's first rows was the worst step (31 ms in Node,
// 188 ms at CPU ×4 in the browser, goblin-l3-packed4-e9fca274), read over triangle-corner duplicates; supports now hold each vertex once.
// Those scans run once per bake, so their first steps run unoptimised: at 300k reads the first rest-search steps were still 53–56 ms at
// CPU ×4 while later ones were 17 (goblin-l3-packed4-C-aa71088f), hence 100k.
const SCAN = 100_000;
// `cornerSupports` keeps the old one-support-per-triangle-corner path, only so a test can prove the dedupe changes nothing.
// `drawn` picks the draws the bake cuts (default: the visible ones): a rank look is baked before it is on (characters.ts prepareLook), with its
// hidden draws in and the rig's draws it turns off out.
function* openWaistSteps(root, anchor, cornerSupports = false, drawn, allocations) {
  const now = () => performance.now(); let since = now();
  root.updateWorldMatrix(true, true); root.updateMatrixWorld(true);
  let inverse = anchor.matrixWorld.clone().invert();
  const fresh = () => { root.updateWorldMatrix(true, true); root.updateMatrixWorld(true); inverse = anchor.matrixWorld.clone().invert(); };
  const pelvis = root.getObjectByName('pelvis'), spine = root.getObjectByName('spine_01');
  const hip = pelvis.getWorldPosition(new Vector3()).applyMatrix4(inverse);
  const waist = hip.y + (spine.getWorldPosition(new Vector3()).applyMatrix4(inverse).y - hip.y) * .6;
  const group = new Group(); group.name = 'Opened';allocations.group=group;const ownGeometry=()=>{const g=new BufferGeometry();allocations.geometries.push(g);return g;};
  const cut = new MeshStandardMaterial({ color: '#501c20', roughness: .88, side: DoubleSide, vertexColors: true });allocations.cut=cut;
  const lower = new Group(), upper = new Group(), weapon = new Group(); weapon.name = 'OpenedWeapon'; lower.name = 'OpenedLegs'; upper.name = 'OpenedTorso'; group.add(lower, upper, weapon);
  const supports = [[], [], []], cutEdges = [[], []];
  // Each vertex is a support once (a triangle corner repeats it ~6 times): every search below is a min or max over the set, so the same answer.
  const supported = [new Set(), new Set(), new Set()];
  // What each step did, yielded as its label (the gate reports the worst step by name).
  const did = [], at = (label) => { did.push(label); }, took = () => did.splice(0).join(' + ');
  const armBone = (name) => /^(clavicle|upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)_/.test(name);
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const bake = function* (object) {
    const geometry = object.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!position || !normal) return;
    const uv = geometry.getAttribute('uv'), color = geometry.getAttribute('color'), index = geometry.index;
    const transform = inverse.clone().multiply(object.matrixWorld), normalMatrix = new Matrix3().getNormalMatrix(transform);
    const skin = object instanceof SkinnedMesh ? object : null;
    skin?.skeleton.update();
    const pause = function* (i) { if (i % CHUNK === CHUNK - 1 || ((i & 255) === 255 && now() - since > STEP_MS)) { yield took(); since = now(); fresh(); skin?.skeleton.update(); at(`draw ${object.name}`); } };
    const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    const arm = skin?.skeleton.bones.map(b => armBone(b.name));
    let attachment = false;
    for (let p = object; p && p !== root; p = p.parent) if (p.name === 'WeaponDrawn' || p.name === 'SwordDrawn') attachment = true;
      const vertices = [];
    for (let i = 0; i < position.count; i++) {
      const p = object.getVertexPosition(i, new Vector3()).applyMatrix4(transform), n = new Vector3().fromBufferAttribute(normal, i);
      let armWeight = 0;
      if (skin) {
        const blended = new Matrix4(); blended.elements.fill(0);
        for (let k = 0; k < 4; k++) {
          const b = indices.getComponent(i,k), w = weights.getComponent(i,k);
          if (arm?.[b]) armWeight += w;
          for (let e = 0; e < 16; e++) blended.elements[e] += skin.skeleton.boneMatrices[b*16+e]*w;
        }
        blended.premultiply(skin.bindMatrixInverse).multiply(skin.bindMatrix);
        n.applyMatrix3(new Matrix3().getNormalMatrix(blended));
      }
      n.applyMatrix3(normalMatrix).normalize();
      vertices.push({ p, n, uv: [uv?.getX(i) ?? 0, uv?.getY(i) ?? 0], color: color ? [color.getX(i),color.getY(i),color.getZ(i)] : [], arm: armWeight });
      yield* pause(i);
    }
    for (const [halfIndex, half] of [lower,upper].entries()) {
      const side = halfIndex ? 1 : -1, edges = [];
      const positions = [], normals = [], uvs = [], colors = [], groups = [];
      const push = (v) => {
        const p = v.p.clone(); p.y -= waist;
        positions.push(...p.toArray()); normals.push(...v.n.toArray()); uvs.push(...v.uv); colors.push(...v.color);
        const s = attachment ? 2 : halfIndex; if (cornerSupports || !supported[s].has(v)) { supported[s].add(v); supports[s].push(p.x,p.y,p.z); }
      };
      for (let i = 0; i < (index?.count ?? position.count); i += 3) {
        yield* pause(i / 3);
        const tri = [0,1,2].map(k => vertices[index ? index.getX(i+k) : i+k]);
        const wholeArm = attachment || tri.reduce((s,v)=>s+v.arm,0)/3 > .5;
        if (wholeArm && !halfIndex) continue;
        const polygon = [], crossing = [];
        for (let k = 0; k < 3; k++) {
          const a = tri[k], b = tri[(k+1)%3], inside = wholeArm || (a.p.y-waist)*side >= 0;
          if (inside) polygon.push(a);
          if (wholeArm || inside === ((b.p.y-waist)*side >= 0)) continue;
          const t = (waist-a.p.y)/(b.p.y-a.p.y), p = a.p.clone().lerp(b.p,t); p.y = waist;
          polygon.push({p, n:a.n.clone().lerp(b.n,t).normalize(), uv:a.uv.map((x,j)=>x+(b.uv[j]-x)*t), color:a.color.map((x,j)=>x+(b.color[j]-x)*t), arm:0}); crossing.push(p);
        }
        if (crossing.length === 2) edges.push(crossing);
        const start = positions.length/3;
        for (let k = 1; k < polygon.length-1; k++) for (const v of [polygon[0],polygon[k],polygon[k+1]]) push(v);
        const count = positions.length/3-start;
        if (count && Array.isArray(object.material)) {
          const materialIndex = geometry.groups.find(g=>i>=g.start && i<g.start+g.count)?.materialIndex ?? 0;
          const last = groups.at(-1); if (last && last.materialIndex === materialIndex) last.count += count; else groups.push({start,count,materialIndex});
        }
      }
      const make = (p, n, u) => {
        const g = ownGeometry(); g.setAttribute('position',new Float32BufferAttribute(p,3)); g.setAttribute('normal',new Float32BufferAttribute(n,3)); g.setAttribute('uv',new Float32BufferAttribute(u,2)); return g;
      };
      if (positions.length) {
        const g = make(positions,normals,uvs); if (colors.length) g.setAttribute('color',new Float32BufferAttribute(colors,3));
        for (const entry of groups) g.addGroup(entry.start,entry.count,entry.materialIndex);
        const surface = source => source;
        const material = Array.isArray(object.material) ? object.material.map(m=>surface(m)) : surface(object.material);
        const mesh = new Mesh(g,material); mesh.name = object.name; mesh.userData.openedWeapon = attachment; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; (attachment ? weapon : half).add(mesh);
      }
      for (const edge of edges) cutEdges[halfIndex].push(...edge);
    }
  };
  let scanned = 0;
  const scan = function* (reads, label) { scanned += reads; if (scanned >= SCAN) { scanned = 0; yield took(); since = now(); at(label); } };
  const draws = []; root.traverse(object => { if (object instanceof Mesh && (drawn ? drawn(object, visible(object)) : visible(object))) draws.push(object); });
  for (const object of draws) { yield took(); since = now(); fresh(); at(`draw ${object.name}`); yield* bake(object); }
  yield took(); since = now(); at('cut caps');
  // One outer cross-section per half closes the layered clothes and body without coplanar cap flicker.
  for (const [h,half] of [lower,upper].entries()) {
    const points=cutEdges[h].sort((a,b)=>a.x-b.x || a.z-b.z);
    const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    const chain=(points)=>{const result=[];for(const p of points){while(result.length>1 && cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result;};
    const front=chain(points), back=chain([...points].reverse());
    const hull=[...front.slice(0,-1),...back.slice(0,-1)]; if(hull.length<3)continue;
    const center=new Vector3();for(const p of hull)center.add(p);center.divideScalar(hull.length);
    const p=[], n=[], tone=[];
    for(let i=0;i<hull.length;i++)for(const v of (h ? [center,hull[i],hull[(i+1)%hull.length]] : [center,hull[(i+1)%hull.length],hull[i]])) {
      p.push(v.x,0,v.z);n.push(0,h ? -1 : 1,0);
      const shade=v===center ? .9 : .5+.12*Math.sin(v.x*170+v.z*113);tone.push(shade,shade,shade);
    }
    const g=ownGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('normal',new Float32BufferAttribute(n,3));g.setAttribute('color',new Float32BufferAttribute(tone,3));
    const mesh=new Mesh(g,cut);mesh.name='WaistCut';mesh.castShadow=false;mesh.receiveShadow=true;half.add(mesh);
  }
  weapon.visible = weapon.children.length > 0; // claws have no separate dropped prop
  const scale = waist;
  const smooth = (p, start, end) => { const t = Math.max(0,Math.min(1,(p-start)/(end-start))); return t*t*(3-2*t); };
  // Find the broad resting face around the torso's long axis. A fixed roll can balance a different rig on a
  // planted hand or the end of its polearm; the lowest waist support gives the body a weighted final landing.
  yield took(); since = now(); at('rest search');
  const rest = new Quaternion(); let best = Infinity;
  for (let i=-32;i<=32;i++) {
    const angle=i*Math.PI/32, q=new Quaternion().setFromEuler(new Euler(-Math.PI/2,angle,0));
    const m=new Matrix4().makeRotationFromQuaternion(q).elements, points=supports[1]; let min=Infinity;
    for(let j=0;j<points.length;j+=3)min=Math.min(min,m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2]);
    const score=-min+.015*(1-Math.cos(angle));
    if(score<best){best=score;rest.copy(q);}
    yield* scan(points.length/3, 'rest search');
  }
  yield took(); since = now(); at('leg search');
  const legRest = new Quaternion(); let legSupport = Infinity;
  const legFall = new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-Math.PI/2);
  for(let i=0;i<64;i++) {
    const q=legFall.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),i*Math.PI/32));
    const m=new Matrix4().makeRotationFromQuaternion(q).elements,points=supports[0];let min=Infinity;
    for(let j=0;j<points.length;j+=3)min=Math.min(min,m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2]);
    if(-min<legSupport){legSupport=-min;legRest.copy(q);}
    yield* scan(points.length/3, 'leg search');
  }
  yield took(); since = now(); fresh(); at('weapon roll');
  const held = root.getObjectByName('WeaponDrawn') ?? root.getObjectByName('SwordDrawn');
  const grip = held.localToWorld(new Vector3()).applyMatrix4(inverse);
  const direction = held.localToWorld(new Vector3(0,1,0)).applyMatrix4(inverse).sub(grip).normalize();
  const flat = new Vector3(0,0,1), aligned = new Quaternion().setFromUnitVectors(direction,flat);
  const weaponRest = aligned.clone(); let thickness = Infinity;
  // Roll broad blades flat too: aligning only the shaft leaves a scythe head standing on its edge.
  for(let i=0;i<64;i++) {
    const q=new Quaternion().setFromAxisAngle(flat,i*Math.PI/32).multiply(aligned), m=new Matrix4().makeRotationFromQuaternion(q).elements;
    let low=Infinity,high=-Infinity;const points=supports[2];
    for(let j=0;j<points.length;j+=3){const y=m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2];low=Math.min(low,y);high=Math.max(high,y);}
    if(high-low<thickness){thickness=high-low;weaponRest.copy(q);}
    yield* scan(points.length/3, 'weapon roll');
  }
  function place(progress) {
    const slide = smooth(progress,.045,.3), fall = smooth(progress,.2,.66), legs = smooth(progress,.36,.84);
    upper.position.set(.5*scale*slide,waist*(1-fall),.12*scale*slide);
    upper.quaternion.identity().slerp(rest,fall);
    lower.position.set(-.35*scale*legs,waist*(1-legs),-.12*scale*legs); lower.quaternion.identity().slerp(legRest,legs);
    const drop = smooth(progress,.12,.62);
    weapon.position.set(.25*scale*drop,waist*(1-drop),-.35*scale*drop); weapon.quaternion.identity().slerp(weaponRest,drop);
  }
  // Precompute exact support heights once. Per-frame playback interpolates a tiny table; no per-frame vertex scan.
  const floors = [[],[],[]]; at('floor table');
  for (let i=0;i<=120;i++) {
    yield* scan(supports.reduce((n, points) => n + points.length/3, 0), 'floor table');
    place(i/120);
    for (const [h,half] of [lower,upper,weapon].entries()) {
      const m = new Matrix4().makeRotationFromQuaternion(half.quaternion).elements, points = supports[h]; let min = Infinity;
      for (let j=0;j<points.length;j+=3) min = Math.min(min,m[1]*points[j]+m[5]*points[j+1]+m[9]*points[j+2]);
      floors[h].push(points.length ? .008-min : 0);
    }
  }
  let envelopeRadius=0;for(const [h,points]of supports.entries()){let r=0;for(let i=0;i<points.length;i+=3)r=Math.max(r,Math.hypot(points[i],points[i+1],points[i+2]));const slide=h===0?Math.hypot(.35*scale,.12*scale):h===1?Math.hypot(.5*scale,.12*scale):Math.hypot(grip.x+.25*scale,grip.z-.35*scale);envelopeRadius=Math.max(envelopeRadius,r+slide);}envelopeRadius+=.008;
  supports.forEach(points=>{points.length=0;});
  return {
    group, waist,
    update(progress, dark, life = 1, canSlide = null) {
      const p = Math.max(0,Math.min(1,progress)); place(p);
      // A rotated weapon can lie entirely above its baked origin. Let that origin descend below zero.
      weapon.position.y += Math.min(0,floors[2][120]) * smooth(p,.12,.62);
      for (const [h,half] of [lower,upper,weapon].entries()) {
        const at = p*120, i = Math.min(119,Math.floor(at)), floor = floors[h][i]+(floors[h][i+1]-floors[h][i])*(at-i);
        half.position.y = Math.max(half.position.y,floor);
      }
      if(canSlide)for(const half of [lower,upper,weapon])if(!canSlide(half)){half.position.x=half===weapon?grip.x:0;half.position.z=half===weapon?grip.z:0;}
      cut.color.set('#501c20');
    },
    stats(){let vertices=0,triangles=0,geometryBytes=0,meshes=0;group.traverse(n=>{if(n instanceof Mesh){meshes++;vertices+=n.geometry.attributes.position.count;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;geometryBytes+=Object.values(n.geometry.attributes).reduce((a,b)=>a+b.array.byteLength,0);}});return{vertices,triangles,geometryBytes,meshes,ownedMaterials:1,ownedTextures:0,floorTableEntries:floors.reduce((n,a)=>n+a.length,0),waist,envelopeRadius};},
    dispose() { group.removeFromParent(); group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();}); cut.dispose(); }
  };
}

// ARMAGEDOM: prepare the actual native cut pose off the lethal frame, restore
// every actor transform, preserve borrowed appearance, and own finite buffers.
export function prepareOpened({model,root,clips,groundY=0,isBlocked,maxVertices=300000}) {
 const clip=clips.find(c=>c.name==='Death_SplitCrown');
 if(!Number.isFinite(groundY)||!clip||!(clip.duration>0)||!model.getObjectByName('pelvis')||!model.getObjectByName('spine_01')||!model.getObjectByName('WeaponDrawn')||!model.getObjectByName('Hollow_body_and_worn_trousers')||!model.getObjectByName('Torn_modern_canvas_jacket'))throw Error('Unsupported Opened foundation');
 const nodes=[],visible=[];model.traverse(n=>{nodes.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]);if(n.isMesh){let shown=true;for(let p=n;p;p=p.parent)shown&&=p.visible;if(shown)visible.push(n);}});
 const mixer=new AnimationMixer(model);let prepared=null;
 try{const action=mixer.clipAction(clip);action.play();action.paused=true;action.time=clip.duration*.045;mixer.update(0);root.updateWorldMatrix(true,true);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});prepared=openWaist(model,root);if(prepared.stats().vertices>maxVertices)throw Error('Opened vertex budget exceeded');}
 catch(error){prepared?.dispose();throw error;}
 finally{mixer.stopAllAction();mixer.uncacheRoot(model);for(const[n,p,q,s]of nodes){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}root.updateWorldMatrix(true,true);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});}
 prepared.group.name='Prepared Opened';let disposed=false;const originalDispose=prepared.dispose;
 const point=new Vector3(),from=new Vector3(),size=new Vector3();
 const canStart=()=>{root.updateWorldMatrix(true,false);root.getWorldPosition(point);root.getWorldScale(size);if(Math.max(size.x,size.y,size.z)-Math.min(size.x,size.y,size.z)>1e-5)return false;return typeof isBlocked==='function'&&!isBlocked({x:point.x,z:-point.z},prepared.stats().envelopeRadius*size.x,{x:point.x,z:-point.z});};
 return{group:prepared.group,nodes:visible,stats:prepared.stats,canStart,update(progress){prepared.update(progress,false);root.getWorldPosition(point);root.getWorldScale(size);const groundOffset=(groundY-point.y)/size.y;for(const half of prepared.group.children)half.position.y+=groundOffset;},dispose(){if(disposed)return;disposed=true;originalDispose();}};
}
