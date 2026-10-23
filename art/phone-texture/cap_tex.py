import json,struct,sys,io,hashlib
from PIL import Image
CAP=1024
src,dst=sys.argv[1],sys.argv[2]
d=open(src,'rb').read()
jl=struct.unpack('<I',d[12:16])[0]
j=json.loads(d[20:20+jl]); bo=20+jl+8
bl=struct.unpack('<I',d[20+jl:24+jl])[0]
binc=d[bo:bo+bl]
assert len(j['buffers'])==1
imgs={im['bufferView']:i for i,im in enumerate(j['images'])}
order=sorted(range(len(j['bufferViews'])),key=lambda i:j['bufferViews'][i].get('byteOffset',0))
out=bytearray();log=[]
for i in order:
    bv=j['bufferViews'][i]; off=bv.get('byteOffset',0); raw=binc[off:off+bv['byteLength']]
    if i in imgs:
        im=Image.open(io.BytesIO(raw)); w,h=im.size
        if max(w,h)>CAP:
            s=CAP/max(w,h); nw,nh=max(1,round(w*s)),max(1,round(h*s))
            fmt=im.format; r=im.resize((nw,nh),Image.LANCZOS)
            b=io.BytesIO()
            if fmt=='JPEG': r.save(b,'JPEG',quality=90,optimize=True,subsampling=0)
            else: r.save(b,'PNG',optimize=True)
            log.append((imgs[i],fmt,(w,h),(nw,nh),len(raw),b.tell()))
            raw=b.getvalue()
    while len(out)%4: out.append(0)
    bv['byteOffset']=len(out); bv['byteLength']=len(raw); out+=raw
while len(out)%4: out.append(0)
j['buffers'][0]['byteLength']=len(out)
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
tot=12+8+len(js)+8+len(out)
g=struct.pack('<4sII',b'glTF',2,tot)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(out),b'BIN\0')+bytes(out)
open(dst,'wb').write(g)
for l in log:print(l)
print(len(d),'->',len(g),hashlib.sha256(g).hexdigest())
