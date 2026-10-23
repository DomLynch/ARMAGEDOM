import json,struct,io,sys
from PIL import Image
def load(f):
    d=open(f,'rb').read(); jl=struct.unpack('<I',d[12:16])[0]
    j=json.loads(d[20:20+jl]); bo=20+jl+8
    return j,d[bo:]
def mb(j,b):
    t=0
    for im in j['images']:
        bv=j['bufferViews'][im['bufferView']]; o=bv.get('byteOffset',0)
        w,h=Image.open(io.BytesIO(b[o:o+bv['byteLength']])).size
        t+=w*h*4*4/3
    return t/1048576
for a,c in [(sys.argv[1],sys.argv[2])]:
    ja,ba=load(a); jc,bc=load(c)
    imgs={im['bufferView'] for im in ja['images']}
    same=0
    for i,(x,y) in enumerate(zip(ja['bufferViews'],jc['bufferViews'])):
        if i in imgs: continue
        oa,oc=x.get('byteOffset',0),y.get('byteOffset',0)
        assert x['byteLength']==y['byteLength'] and ba[oa:oa+x['byteLength']]==bc[oc:oc+y['byteLength']],i
        assert {k:v for k,v in x.items() if k!='byteOffset'}=={k:v for k,v in y.items() if k!='byteOffset'}
        same+=1
    strip=lambda j:{k:v for k,v in j.items() if k not in('bufferViews','buffers')}
    assert strip(ja)==strip(jc),'json differs'
    print(a,'non-image bufferViews identical:',same,'rest of JSON identical; GPU MB',round(mb(ja,ba),1),'->',round(mb(jc,bc),1))
