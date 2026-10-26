import json,struct,sys,io,hashlib
from PIL import Image
# usage: cap_tex_roles.py src dst mr=512,ao=512,normal=1024,color=1024
# Per-role longest-edge caps; unlisted roles and images already within the cap keep their original bytes.
# Only image bufferView payloads change; every other byte range is copied byte-for-byte in original order.
src,dst=sys.argv[1],sys.argv[2]
caps={k:int(v) for k,v in (p.split('=') for p in sys.argv[3].split(','))}
d=open(src,'rb').read()
jl=struct.unpack('<I',d[12:16])[0]
j=json.loads(d[20:20+jl]); bo=20+jl+8
bl=struct.unpack('<I',d[20+jl:24+jl])[0]
binc=d[bo:bo+bl]
tex=j['textures']; roles={}
def source(t):
    # A texture names its image directly or through an extension such as EXT_texture_webp.
    return t['source'] if 'source' in t else next(e['source'] for e in t['extensions'].values() if 'source' in e)
def add(t,r):
    if t: roles.setdefault(source(tex[t['index']]),set()).add(r)
for m in j['materials']:
    p=m.get('pbrMetallicRoughness',{})
    add(p.get('baseColorTexture'),'color'); add(p.get('metallicRoughnessTexture'),'mr')
    add(m.get('normalTexture'),'normal'); add(m.get('occlusionTexture'),'ao'); add(m.get('emissiveTexture'),'color')
imgs={im['bufferView']:i for i,im in enumerate(j['images'])}
# The GLB's own bytes are buffer 0. A bufferView lives there directly, or, under EXT_meshopt_compression, its compressed bytes are the
# extension's own byteOffset/byteLength in buffer 0 while the view itself points at the later fallback buffer, which holds no bytes here and
# stays as it is. `ref` is the dict that carries the offset to rewrite: the view, or its extension.
refs=[]
for i,v in enumerate(j['bufferViews']):
    ext=v.get('extensions',{}).get('EXT_meshopt_compression')
    if ext is not None:
        if ext.get('buffer',0)==0: refs.append((i,ext))
    elif v.get('buffer',0)==0: refs.append((i,v))
order=sorted(refs,key=lambda r:r[1].get('byteOffset',0))
out=bytearray();log=[];placed={}
for i,ref in order:
    off=ref.get('byteOffset',0); raw=binc[off:off+ref['byteLength']]
    if i in imgs:
        idx=imgs[i]; cs=[caps[r] for r in roles.get(idx,()) if r in caps]
        cap=min(cs) if cs else None
        im=Image.open(io.BytesIO(raw)); w,h=im.size
        if cap and max(w,h)>cap:
            s=cap/max(w,h); nw,nh=max(1,round(w*s)),max(1,round(h*s))
            fmt=im.format; r=im.resize((nw,nh),Image.LANCZOS); b=io.BytesIO()
            if fmt=='JPEG': r.save(b,'JPEG',quality=90,optimize=True,subsampling=0)
            else: r.save(b,'PNG',optimize=True)
            log.append((idx,sorted(roles.get(idx,[])),fmt,(w,h),(nw,nh),len(raw),b.tell())); raw=b.getvalue()
    elif (off,ref['byteLength']) in placed:
        ref['byteOffset']=placed[(off,ref['byteLength'])]; continue
    while len(out)%4: out.append(0)
    if i not in imgs: placed[(off,ref['byteLength'])]=len(out)
    ref['byteOffset']=len(out); ref['byteLength']=len(raw); out+=raw
while len(out)%4: out.append(0)
j['buffers'][0]['byteLength']=len(out)
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
g=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(out))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(out),b'BIN\0')+bytes(out)
open(dst,'wb').write(g)
for l in log:print(l)
print(len(d),'->',len(g),hashlib.sha256(g).hexdigest())
