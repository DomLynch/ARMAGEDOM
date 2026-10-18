from pathlib import Path
import json,struct,hashlib
import argparse
parser=argparse.ArgumentParser(description='Select reviewed arm/body accessors without rebaking originals')
parser.add_argument('portable',type=Path);parser.add_argument('output',type=Path);parser.add_argument('receipt',type=Path)
args=parser.parse_args();root=args.portable;out=args.output
def read(name,sha):
 b=(root/name).read_bytes();assert hashlib.sha256(b).hexdigest()==sha;n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);return d,b[28+n:]
body,bb=read('hollow-body-left-arm-removed.glb','0edd767abfda70ef289f28b53d5c4162b471798af02649515ae5031a0b367924')
arm,ab=read('hollow-left-arm-closed.glb','4de20484dca69d285c5e6595568ba59679f1d529d6745f22b1e09253bab6c88b')
views=[];accessors=[];binary=bytearray();receipt=[]
def extract(d,b,tag):
 vm={};am={}
 def accessor(i):
  if i in am:return am[i]
  a=dict(d['accessors'][i]);assert 'sparse' not in a;v=a['bufferView']
  if v not in vm:
   src=dict(d['bufferViews'][v]);chunk=b[src.get('byteOffset',0):src.get('byteOffset',0)+src['byteLength']];assert len(chunk)==src['byteLength'];binary.extend(b'\0'*((-len(binary))%4));src['byteOffset']=len(binary);src['buffer']=0;binary.extend(chunk);vm[v]=len(views);views.append(src);receipt.append({'source':tag,'bufferView':v,'bytes':len(chunk),'sha256':hashlib.sha256(chunk).hexdigest()})
  a['bufferView']=vm[v];am[i]=len(accessors);accessors.append(a);return am[i]
 mesh=json.loads(json.dumps(d['meshes'][7]));assert len(mesh['primitives']) in [3,5]
 for p in mesh['primitives']:
  p['attributes']={k:accessor(v) for k,v in p['attributes'].items()};p['indices']=accessor(p['indices'])
 return mesh,accessor
bm,ac=extract(body,bb,'body');inverse=ac(body['skins'][10]['inverseBindMatrices']);ar,_=extract(arm,ab,'arm')
nodes=json.loads(json.dumps(body['nodes']))
for n in nodes:n.pop('mesh',None);n.pop('skin',None)
nodes[83].update(mesh=0,skin=0,name='Prepared_left_arm_body');armnode=dict(nodes[83],mesh=1,name='Prepared_detached_left_arm');nodes.append(armnode);nodes[1]['children'].append(len(nodes)-1)
skin=dict(body['skins'][10],inverseBindMatrices=inverse)
materials=json.loads(json.dumps(body['materials']))
for i,m in enumerate(materials):
 if i!=8:materials[i]={'name':m.get('name',str(i)),'extras':{'borrowSourceMaterial':i}}
d={'asset':{'version':'2.0','generator':'ARMAGEDOM exact accessor selection; no mesh/rig/pose bake'},'scene':body.get('scene',0),'scenes':body['scenes'],'nodes':nodes,'skins':[skin],'meshes':[bm,ar],'materials':materials,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(binary)}]}
j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary.extend(b'\0'*((-len(binary))%4));result=struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(result)
r={'asset':str(out),'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'originalsUnchanged':True,'newGeometryAndBorrowedIBMOnly':True,'copiedRanges':receipt,'animations':0,'images':0,'skins':1,'jointCount':len(skin['joints'])};args.receipt.write_text(json.dumps(r,indent=2));print({k:v for k,v in r.items() if k!='copiedRanges'})
