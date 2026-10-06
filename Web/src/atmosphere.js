import {atmosphereForArea, atmosphereBudget} from './atmosphere-areas.js';

const vertexShader = `
attribute vec2 corner;
attribute vec3 motion;
attribute vec2 size;
attribute float phase;
attribute float strength;
attribute vec3 tint;
attribute vec2 variation;
uniform float clock;
uniform vec3 right;
uniform vec3 up;
varying vec2 uvLocal;
varying float age;
varying float alpha;
varying vec3 smokeTint;
varying float effectClock;
void main(){
  age=fract(clock*motion.z+phase);
  uvLocal=corner;
  alpha=strength;
  smokeTint=tint;
  effectClock=clock+variation.y;
  float drift=(sin(age*3.14159+phase*19.0)+age*variation.x)*motion.x;
  vec3 p=position+right*(corner.x*size.x+drift)+up*(corner.y*size.y+age*motion.y);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const fragments = {
  smoke:`float r=length(uvLocal*vec2(1.0,.85));
    float edge=1.0-smoothstep(.25,1.0,r);
    float grain=.45+.55*turbulence(uvLocal*3.5+vec2(age*.6,-effectClock*.13));
    float a=edge*grain*sin(age*3.14159)*alpha;
    gl_FragColor=vec4(smokeTint,a);`,
  flame:`vec2 q=vec2(uvLocal.x,(uvLocal.y+1.0)*.5);
    float flow=turbulence(vec2(q.x*3.2,q.y*5.5-effectClock*1.8));
    float curl=.16*sin(q.y*9.0-effectClock*3.1)+.13*sin(q.y*17.0-effectClock*5.7);
    float taper=(1.0-q.y)*(.65+.28*flow);
    float body=1.0-smoothstep(taper*.38,taper+.02,abs(q.x+curl*q.y));
    float tip=1.0-smoothstep(.57+flow*.36,.86+flow*.14,q.y);
    float tongues=.55+.45*turbulence(vec2(q.x*7.0,q.y*9.0-effectClock*2.8));
    float a=body*tip*tongues*smoothstep(0.0,.035,q.y)*alpha;
    float core=body*pow(1.0-q.y,1.7)*(.55+.45*flow);
    vec3 color=mix(vec3(.72,.12,.015),vec3(1.0,.62,.20),core);
    gl_FragColor=vec4(color,a);`,
  ember:`float a=(1.0-smoothstep(.15,1.0,length(uvLocal)))*pow(sin(age*3.14159),4.0)*alpha;
    gl_FragColor=vec4(.63,.29,.08,a);`
};
// Original analytic turbulence; no borrowed footage, sprite sheet or textures.
const noiseShader=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float turbulence(vec2 p){return noise(p)*.57+noise(p*2.03+3.1)*.28+noise(p*4.11+1.7)*.15;}
`;

// No independent clock/render loop. Caller uses existing RAF and dt=0 on pause.
export function createAtmosphere({THREE,scene,world}) {
  const group=new THREE.Group();group.name='London restrained atmosphere';
  let area=null,elapsed=0,disposed=false;
  const resources=[];
  const right=new THREE.Vector3(),up=new THREE.Vector3();
  function clear(){
    scene.remove(group);
    for(const mesh of resources){group.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
    resources.length=0;
  }
  function build(){
    // Use the original calibration, not the current zoom/crop projection.
    const inverse=world.calibrated.clone().invert(),camera=world.camera;
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
    const project=(x,y,depth)=>{
      const p=new THREE.Vector3(2*x-1,1-2*y,.5).applyMatrix4(inverse);
      return p.multiplyScalar(depth/-p.z).applyMatrix4(camera.matrixWorld);
    };
    const batches={smoke:[],flame:[],ember:[]};
    for(const anchor of atmosphereForArea(area)){
      const depth=anchor.depth??world.geometry.point(world.geometry.ground(anchor.foot)).depth-.03;
      const origin=project(anchor.x,anchor.y,depth);
      const unitX=project(anchor.x+1,anchor.y,depth).distanceTo(origin);
      const unitY=project(anchor.x,anchor.y-1,depth).distanceTo(origin);
      for(let i=0;i<anchor.smoke;i++)batches.smoke.push({origin,wx:anchor.width*unitX,wy:anchor.width*unitY*.8,dx:anchor.width*unitX*.35,dy:anchor.rise*unitY,speed:anchor.smokeSpeed??1/7,phase:(i/anchor.smoke+(anchor.phase??0))%1,alpha:anchor.opacity,tint:anchor.smokeColor,variation:[anchor.wind??0,anchor.noiseOffset??0]});
      const fireHalfHeight=anchor.fireHeight*unitY*.5;
      if(anchor.fireHeight>0)batches.flame.push({origin:origin.clone().addScaledVector(up,fireHalfHeight),wx:anchor.fireWidth*unitX,wy:fireHalfHeight,dx:0,dy:0,speed:0,phase:0,alpha:.90,variation:[0,anchor.noiseOffset??0]});
      for(let i=0;i<anchor.embers;i++)batches.ember.push({origin,wx:.0007*unitX,wy:.0009*unitY,dx:anchor.width*unitX*.3,dy:anchor.rise*unitY*.6,speed:1/4,phase:(i/anchor.embers+(anchor.phase??0))%1,alpha:.35,variation:[anchor.wind??0,anchor.noiseOffset??0]});
    }
    for(const [kind,particles] of Object.entries(batches)){
      if(!particles.length)continue;
      const positions=[],corners=[],motions=[],sizes=[],phases=[],strengths=[],tints=[],variations=[],indices=[];
      for(const p of particles){
        const base=positions.length/3;
        for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
          positions.push(p.origin.x,p.origin.y,p.origin.z);corners.push(x,y);motions.push(p.dx,p.dy,p.speed);sizes.push(p.wx,p.wy);phases.push(p.phase);strengths.push(p.alpha);
          tints.push(...(p.tint??[.095,.085,.075]));variations.push(...(p.variation??[0,0]));
        }
        indices.push(base,base+1,base+2,base,base+2,base+3);
      }
      const geometry=new THREE.BufferGeometry();
      for(const [name,data,count] of [['position',positions,3],['corner',corners,2],['motion',motions,3],['size',sizes,2],['phase',phases,1],['strength',strengths,1],['tint',tints,3],['variation',variations,2]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,count));
      geometry.setIndex(indices);
      const material=new THREE.ShaderMaterial({vertexShader,fragmentShader:`uniform float clock; varying vec2 uvLocal; varying float age; varying float alpha; varying vec3 smokeTint; varying float effectClock; ${noiseShader} void main(){${fragments[kind]}}`,uniforms:{clock:{value:elapsed},right:{value:right},up:{value:up}},transparent:true,depthTest:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`Atmosphere ${kind}`;
      // Render after registered depth masks, before combat actors/tells. Camera
      // depth tests keep the distant tower behind foreground masks and actors.
      mesh.renderOrder=-80;mesh.frustumCulled=false;group.add(mesh);resources.push(mesh);
    }
    const quads=resources.reduce((n,m)=>n+m.geometry.index.count/6,0);
    if(quads>atmosphereBudget(area).quads){clear();throw Error(`Atmosphere budget exceeded: ${area}`);}
    scene.add(group);
  }
  return {
    update(dt,{paused=false,enabled=true}={}){
      if(disposed)return;
      if(area!==world.areaId){clear();area=world.areaId;elapsed=0;if(atmosphereForArea(area).length)build();}
      group.visible=resources.length>0&&enabled;
      if(!group.visible||paused)return;
      if(Number.isFinite(dt)&&dt>0)elapsed+=Math.min(dt,.1);
      for(const mesh of resources)mesh.material.uniforms.clock.value=elapsed;
    },
    reset(){if(disposed)return;elapsed=0;for(const mesh of resources)mesh.material.uniforms.clock.value=0;},
    stats(){return {area,visible:group.visible,budget:atmosphereBudget(area),quads:resources.reduce((n,m)=>n+m.geometry.index.count/6,0),drawCalls:resources.length,textureBytes:0,time:elapsed,disposed};},
    dispose(){if(disposed)return;disposed=true;clear();}
  };
}
