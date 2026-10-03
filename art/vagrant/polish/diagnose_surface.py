from pathlib import Path
import bpy,json
root=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root/'output/candidate.blend'),use_scripts=False)
o=bpy.data.objects['Vagrant body'];m=o.data
adj=[set() for v in m.vertices]
for e in m.edges:adj[e.vertices[0]].add(e.vertices[1]);adj[e.vertices[1]].add(e.vertices[0])
seen=set();components=[]
for v in m.vertices:
 if v.index in seen:continue
 stack=[v.index];group=[];seen.add(v.index)
 while stack:
  a=stack.pop();group.append(a)
  for b in adj[a]-seen:seen.add(b);stack.append(b)
 if len(group)<200:
  centre=sum((m.vertices[i].co for i in group),m.vertices[0].co*0)/len(group)
  components.append({'n':len(group),'first':group[0],'centre':list(centre)})
print(json.dumps(components))
# Conservative local joint smoothing trial; unchanged rig/groups/UV.
indices=[v.index for v in m.vertices if -.535<v.co.x<-.425 and -.14<v.co.y<.01 and .935<v.co.z<1.047]
initial={i:m.vertices[i].co.copy() for i in indices}
for iteration in range(8):
 new={i:m.vertices[i].co.lerp(sum((m.vertices[j].co for j in adj[i]),m.vertices[i].co*0)/len(adj[i]),.45) for i in indices if adj[i]}
 for i,co in new.items():
  delta=co-initial[i]
  if delta.length>.004:co=initial[i]+delta.normalized()*.004
  m.vertices[i].co=co
m.update()
print('HAND_SMOOTH',len(indices))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'output/diagnostic-smoothed.blend'))
