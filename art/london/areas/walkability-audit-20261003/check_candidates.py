import json,math,heapq
from pathlib import Path
ROOT=Path(__file__).parent
N=160
MARGIN=.52

def inside(q,ps):
 x,y=q;c=False
 for a,b in zip(ps,ps[1:]+ps[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:c=not c
 return c

def segments(ps):return list(zip(ps,ps[1:]+ps[:1]))
def dist(q,a,b):
 vx,vz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((q[0]-a[0])*vx+(q[1]-a[1])*vz)/(vx*vx+vz*vz)))
 return math.hypot(q[0]-a[0]-t*vx,q[1]-a[1]-t*vz)
def ground(q,d):
 L=math.hypot(d['height'],d['distance']+d['targetZ']);tan=math.tan(math.radians(d['fieldOfView']/2));v=1-2*q[1]
 dx=(2*q[0]-1)*tan*1672/941;dy=-d['height']/L+v*(d['distance']+d['targetZ'])/L*tan;dz=(d['distance']+d['targetZ'])/L+v*d['height']/L*tan
 if dy>=0:return None
 t=-d['height']/dy;return dx*t,-d['distance']+dz*t

def assess(area,entry,landmarks):
 d=json.loads((ROOT/'candidates'/f'{area}-layout.json').read_text());road=[(p['x'],p['y']) for p in d['road']];blocks=[[(p['x'],p['y']) for p in b['points']] for b in d['blockers']];edges=[]
 for ps in [road]+blocks:
  for a,b in segments(ps):
   ga,gb=ground(a,d),ground(b,d);assert ga and gb and max(abs(v) for v in ga+gb)<99,(area,'invalid floor point',a,b)
   edges.append((ga,gb))
 def valid(q):
  if not inside(q,road) or any(inside(q,ps) for ps in blocks):return False
  g=ground(q,d)
  return g is not None and min(dist(g,a,b) for a,b in edges)>MARGIN
 cells={(ix,iy) for ix in range(N+1) for iy in range(N+1) if valid((ix/N,iy/N))}
 start=min(cells,key=lambda c:math.hypot(c[0]/N-entry[0],c[1]/N-entry[1]));seen={start};todo=[start]
 while todo:
  x,y=todo.pop()
  for q in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
   if q in cells and q not in seen:seen.add(q);todo.append(q)
 results=[]
 for name,q in landmarks:
  nearest=min(cells,key=lambda c:math.hypot(c[0]/N-q[0],c[1]/N-q[1]));offset=math.hypot(nearest[0]/N-q[0],nearest[1]/N-q[1])
  results.append(dict(name=name,point=q,clear=valid(q),connected=nearest in seen,nearest=[nearest[0]/N,nearest[1]/N],offset=round(offset,4)))
 print(area,'clear cells',len(cells),'connected',len(seen),'unconnected',len(cells)-len(seen))
 for r in results:print(r)
 return dict(area=area,clear_cells=len(cells),connected_cells=len(seen),margin_m=MARGIN,landmarks=results)
landmarks={
'west':((.5,.8),[('right pavement above wreck',(.83,.705)),('right pavement under HUD',(.92,.86)),('right pavement lower edge',(.94,.96)),('left forecourt',(.20,.78)),('left lower pavement',(.265,.875)),('left road above lion',(.24,.435)),('bus-side road',(.275,.42)),('bridge',(.90,.40))]),
'south':((.55,.29),[('upper-left pavement',(.30,.105)),('gate gap',(.36,.335)),('left connecting lane',(.29,.37)),('station approach',(.195,.73)),('station lower pavement',(.235,.825)),('below supplies',(.32,.86)),('right pavement above bus',(.72,.53)),('right pavement beside bus',(.915,.735)),('lower road below bus',(.82,.94)),('upper-right pavement',(.675,.29))]),
'east':((.10,.72),[('back bridge pavement',(.20,.57)),('statue rear path',(.26,.53)),('mid bridge road',(.43,.475)),('front bridge pavement',(.44,.555)),('above bus',(.56,.31)),('beyond bridge',(.67,.33)),('far street',(.82,.30)),('far pavement edge',(.965,.32))])}
if __name__=='__main__':
 out=[assess(a,e,ls) for a,(e,ls) in landmarks.items()];(ROOT/'candidate-connectivity.json').write_text(json.dumps(out,indent=2)+'\n')
