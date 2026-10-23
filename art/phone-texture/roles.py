import json,struct,sys
d=open(sys.argv[1],'rb').read()
jl=struct.unpack('<I',d[12:16])[0]
j=json.loads(d[20:20+jl])
tex=j['textures']
src=lambda t:tex[t['index']].get('source')
roles={}
def add(t,r):
    if t is None: return
    roles.setdefault(tex[t['index']]['source'],set()).add(r)
for m in j['materials']:
    p=m.get('pbrMetallicRoughness',{})
    add(p.get('baseColorTexture'),'color'); add(p.get('metallicRoughnessTexture'),'mr')
    add(m.get('normalTexture'),'normal'); add(m.get('occlusionTexture'),'ao'); add(m.get('emissiveTexture'),'emissive')
    for k,e in m.get('extensions',{}).items():
        for kk,v in e.items():
            if isinstance(v,dict) and 'index' in v: add(v,k+'.'+kk)
for i in range(len(j['images'])): print(i,sorted(roles.get(i,['unused'])))
