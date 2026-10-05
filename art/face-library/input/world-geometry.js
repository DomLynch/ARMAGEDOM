const ASPECT = 1672 / 941;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
function inside(p, poly) {
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a.z>p.z)!=(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) hit=!hit;
  }
  return hit;
}
function distanceSq(p,a,b) {
  const x=b.x-a.x,z=b.z-a.z;
  const t=clamp(((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z),0,1);
  return (p.x-a.x-t*x)**2+(p.z-a.z-t*z)**2;
}
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function intersects(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z)) return false;
  return cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0;
}
export function createGeometry(layout) {
  const {height:h,distance:d,targetZ,fieldOfView}=layout;
  if(![h,d,targetZ,fieldOfView].every(Number.isFinite)||h<=0||d<=0||fieldOfView<=0||fieldOfView>=90) throw Error('Invalid London calibration');
  const length=Math.hypot(h,d+targetZ),down=h/length,forward=(d+targetZ)/length,tan=Math.tan(fieldOfView*Math.PI/360);
  function ground(p) {
    const v=1-2*p.y,dy=-down+v*forward*tan,dz=forward+v*down*tan;
    if(dy>=0) throw Error('Artwork point is above the ground horizon');
    const t=-h/dy;
    return {x:(2*p.x-1)*tan*ASPECT*t,z:-d+dz*t};
  }
  function point(p,y=0) {
    const depth=(h-y)*down+(p.z+d)*forward;
    return {x:.5+p.x/(depth*tan*ASPECT)*.5,y:.5-((y-h)*forward+(p.z+d)*down)/(depth*tan)*.5,depth};
  }
  const road=layout.road.map(ground),blockers=(layout.blockers??[]).map(b=>b.points.map(ground));
  const edges=[road,...blockers].flatMap(poly=>poly.map((a,i)=>[a,poly[(i+1)%poly.length]]));
  function clear(p,radius=0) {
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Number.isFinite(radius)||radius<0) return false;
    return inside(p,road)&&!blockers.some(poly=>inside(p,poly))&&edges.every(([a,b])=>distanceSq(p,a,b)>(radius+.061)**2);
  }
  function lineClear(a,b) {
    return clear(a)&&clear(b)&&!edges.some(([c,d])=>intersects(a,b,c,d));
  }
  function move(position,delta,radius=.4) {
    let p={x:position.x,z:position.z};
    if(![delta.x,delta.z,radius].every(Number.isFinite)||radius<0) return p;
    const count=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/Math.max(.025,Math.min(.2,radius*.5))));
    const dx=delta.x/count,dz=delta.z/count;
    for(let i=0;i<count;i++) {
      let next={x:p.x+dx,z:p.z+dz};
      if(clear(next,radius)&&lineClear(p,next)) {p=next;continue;}
      next={x:p.x+dx,z:p.z};if(clear(next,radius)&&lineClear(p,next))p=next;
      next={x:p.x,z:p.z+dz};if(clear(next,radius)&&lineClear(p,next))p=next;
    }
    return p;
  }
  return {ground,point,clear,move,lineClear,road,blockers,edges};
}
