import json,math,heapq,shutil
from pathlib import Path
from check_candidates import ROOT,N,MARGIN,inside,segments,dist,ground,landmarks
order={
'west':['left forecourt','left lower pavement','left road above lion','bus-side road','right pavement above wreck','right pavement under HUD','right pavement lower edge','bridge'],
'south':['gate gap','upper-left pavement','left connecting lane','station approach','station lower pavement','below supplies','lower road below bus','right pavement beside bus','right pavement above bus','upper-right pavement'],
'east':['back bridge pavement','statue rear path','mid bridge road','front bridge pavement','above bus','beyond bridge','far street','far pavement edge']}
checks={
'west':[(('wreck',(.92,.86)),(.77,.85)),(('river',(.60,.515)),(.61,.37))],
'south':[(('wreck',(.59,.47)),(.47,.50)),(('river',(.875,.60)),(.99,.55))],
'east':[(('bus',(.67,.33)),(.57,.36)),(('river',(.49,.49)),(.52,.62))]}
all_routes=[]
for area,(entry,ls) in landmarks.items():
 d=json.loads((ROOT/'candidates'/f'{area}-layout.json').read_text());road=[(p['x'],p['y']) for p in d['road']];blocks=[[(p['x'],p['y']) for p in b['points']] for b in d['blockers']];edges=[(ground(a,d),ground(b,d)) for ps in [road]+blocks for a,b in segments(ps)]
 def valid(q):
  if not inside(q,road) or any(inside(q,ps) for ps in blocks):return False
  if area=='west' and q[1]>.965 and .49<q[0]<.75:return False
  if area=='south' and q[1]<.24 and .49<q[0]<.58:return False
  if area=='east' and q[0]<.045 and .68<q[1]<.81:return False
  g=ground(q,d);return g is not None and min(dist(g,a,b) for a,b in edges)>MARGIN
 cells={(x,y) for x in range(N+1) for y in range(N+1) if valid((x/N,y/N))}
 def line(a,b):
  ga,gb=ground(a,d),ground(b,d);n=max(1,math.ceil(math.dist(ga,gb)/.20))
  return all(valid((a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n)) for i in range(n+1))
 def route(a,b):
  assert valid(a) and valid(b),(area,'invalid route endpoint',a,b)
  if line(a,b):nodes=[a,b]
  else:
   start=min(cells,key=lambda c:math.dist((c[0]/N,c[1]/N),a));end=min(cells,key=lambda c:math.dist((c[0]/N,c[1]/N),b));queue=[(0,start)];g={start:0};parents={}
   while queue:
    _,p=heapq.heappop(queue)
    if p==end:break
    for q in [(p[0]+1,p[1]),(p[0]-1,p[1]),(p[0],p[1]+1),(p[0],p[1]-1)]:
     if q not in cells:continue
     cost=g[p]+math.dist(ground((p[0]/N,p[1]/N),d),ground((q[0]/N,q[1]/N),d))
     if cost<g.get(q,float('inf')):g[q]=cost;parents[q]=p;heapq.heappush(queue,(cost+math.dist(ground((q[0]/N,q[1]/N),d),ground(b,d)),q))
   assert end in g,(area,'disconnected',a,b)
   p=end;ns=[b,(p[0]/N,p[1]/N)]
   while p!=start:p=parents[p];ns.append((p[0]/N,p[1]/N))
   ns.append(a);ns.reverse();nodes=[ns[0]];i=0
   while i<len(ns)-1:
    j=len(ns)-1
    while j>i+1 and not line(ns[i],ns[j]):j-=1
    nodes.append(ns[j]);i=j
  out=[]
  for a,b in zip(nodes,nodes[1:]):
   n=max(1,math.ceil(math.dist(ground(a,d),ground(b,d))/8))
   out.extend((a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n) for i in range(1,n+1))
  return out
 targets=dict(ls);last=entry;waypoints=[];survey=[]
 for name in order[area]:
  q=targets[name];waypoints+=route(last,q);survey.append(name);last=q
 waypoints+=route(last,entry);last=entry;tests=[]
 for (name,frm),goal in checks[area]:
  tests.append(dict(name=name,points=[dict(x=x,y=y) for x,y in route(last,frm)],blocked=dict(x=goal[0],y=goal[1])));last=frm
 folder=ROOT/'candidates'/area;folder.mkdir(exist_ok=True);(folder/'layout.json').write_text(json.dumps(d,indent=2)+'\n');img=folder/'backdrop.png'
 if not img.exists():img.symlink_to((Path('Game/Assets/StreamingAssets/London/Travel')/area/'backdrop.png').resolve())
 all_routes.append(dict(area=area,points=[dict(x=x,y=y) for x,y in waypoints],survey=survey,checks=tests))
 print(area,len(waypoints),'survey waypoints;',len(tests),'physical exclusion checks')
(ROOT/'routes.json').write_text(json.dumps(dict(areas=all_routes),indent=2)+'\n')
