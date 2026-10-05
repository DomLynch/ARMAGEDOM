import copy, hashlib, json, math, pathlib, struct

def decode(path):
    b=pathlib.Path(path).read_bytes(); n=struct.unpack_from('<I',b,12)[0]
    return json.loads(b[20:20+n]),b[28+n:],hashlib.sha256(b).hexdigest()

def values(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']]
    k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    f={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']]; sz=struct.calcsize(f)*k
    return [struct.unpack_from('<'+f*k,b,v.get('byteOffset',0)+a.get('byteOffset',0)+r*v.get('byteStride',sz)) for r in range(a['count'])]

def emit(d,b,path):
    j=json.dumps(d,separators=(',',':')).encode();j+=b' '*(-len(j)%4);b+=b'\0'*(-len(b)%4)
    pathlib.Path(path).write_bytes(struct.pack('<5I',0x46546c67,2,28+len(j)+len(b),len(j),0x4e4f534a)+j+struct.pack('<2I',len(b),0x004e4942)+b)

src,sbin,source_sha=decode('warrior.glb');base,bin0,base_sha=decode('hollow.glb')
assert source_sha=='d8aeb2ae0eb5c4b8b9dfa0813d04a41f17623d3d85b5702cd9494967b7fe9769'
assert base_sha=='b309eeb508a1c31babbfeaf13275ace3f54990dab380ae719c0d5881416f89fc'
pathlib.Path('results').mkdir(exist_ok=True)
recipes=[('neck-repair',1,1,[.83,.82,.73],[.48,.43,.36],None),('narrow-light',.87,1.035,[1,.98,.90],[.68,.52,.40],None),('broad-deep',1.12,.98,[.43,.29,.20],[.25,.13,.075],'rough')]
inventory=[]
for rid,width,height,face_colour,skin_colour,hair in recipes:
    d=copy.deepcopy(base);buf=bytearray(bin0)
    def append(rows,typ='VEC3',ct=5126):
        k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[typ];f={5121:'B',5123:'H',5125:'I',5126:'f'}[ct]
        buf.extend(b'\0'*(-len(buf)%4));start=len(buf)
        for row in rows:buf.extend(struct.pack('<'+f*k,*row))
        vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(buf)-start})
        ai=len(d['accessors']);a={'bufferView':vi,'componentType':ct,'count':len(rows),'type':typ}
        if typ=='VEC3':a.update(min=[min(r[k]for r in rows)for k in range(3)],max=[max(r[k]for r in rows)for k in range(3)])
        d['accessors'].append(a);return ai
    # Recover the donor's omitted LOWER NECK, including its original weights/bind.
    donor_neck=next(n for n in src['nodes']if n.get('name')=='Face')
    node=next(n for n in d['nodes']if n.get('name')=='Face')
    assert src['skins'][donor_neck['skin']]['joints']==d['skins'][donor_neck['skin']]['joints']
    mesh=copy.deepcopy(src['meshes'][donor_neck['mesh']])
    for pr in mesh['primitives']:
        for key,aid in list(pr['attributes'].items()):
            a=src['accessors'][aid];new=append(values(src,sbin,aid),a['type'],a['componentType'])
            if a.get('normalized'):d['accessors'][new]['normalized']=True
            pr['attributes'][key]=new
        aid=pr['indices'];a=src['accessors'][aid];pr['indices']=append(values(src,sbin,aid),'SCALAR',a['componentType']);pr['material']=3
    node['mesh']=len(d['meshes']);d['meshes'].append(mesh);node['skin']=donor_neck['skin'];node['name']='Recovered donor lower neck'
    # Original binds are checked numerically, not inferred from matching IDs.
    assert values(src,sbin,src['skins'][donor_neck['skin']]['inverseBindMatrices'])==values(base,bin0,d['skins'][donor_neck['skin']]['inverseBindMatrices'])
    face_node=next(n for n in d['nodes']if n.get('name')=='Photo')
    photo_pr=d['meshes'][face_node['mesh']]['primitives'][0]
    def transform(p):
        x,y,z=p;t=max(0,min(1,(y-1.59)/.07));t=t*t*(3-2*t)
        return (x*(1+(width-1)*t),y+(y-1.60)*(height-1)*t,z*(1+(width-1)*.35*t))
    def normal(p,n):
        x,y,z=p;u=max(0,min(1,(y-1.59)/.07));t=u*u*(3-2*u);dt=6*u*(1-u)/.07
        sx=1+(width-1)*t;sz=1+(width-1)*.35*t;dy=1+(height-1)*(t+(y-1.60)*dt)
        nx=n[0]/sx;nz=n[2]/sz;ny=(n[1]-x*(width-1)*dt*nx-z*(width-1)*.35*dt*nz)/dy
        length=math.sqrt(nx*nx+ny*ny+nz*nz);return(nx/length,ny/length,nz/length)
    # One shared positional field keeps the face, eyes and teeth together; zero
    # below the neck transition. No bone lengths, weights or clips are changed.
    for name in ['Photo','PhotoEyes','PhotoTeeth']:
        n=next(n for n in d['nodes']if n.get('name')==name)
        for pr in d['meshes'][n['mesh']]['primitives']:
            ps=values(base,bin0,pr['attributes']['POSITION']);pr['attributes']['POSITION']=append([transform(p)for p in ps])
            ns=values(base,bin0,pr['attributes']['NORMAL']);pr['attributes']['NORMAL']=append([normal(p,n)for p,n in zip(ps,ns)])
    d['materials'][0]['pbrMetallicRoughness']['baseColorFactor']=[*face_colour,1]
    d['materials'][3]['pbrMetallicRoughness']['baseColorFactor']=[*skin_colour,1]
    if hair:
        old=base['meshes'][face_node['mesh']]['primitives'][0];ps=values(base,bin0,old['attributes']['POSITION']);idx=[r[0]for r in values(base,bin0,old['indices'])]
        inds=[idx[i+j]for i in range(0,len(idx),3)if min(ps[idx[i+j]][1]for j in range(3))>1.725 for j in range(3)]
        used=sorted(set(inds));lookup={i:j for j,i in enumerate(used)}
        out=[]
        for i in used:
            x,y,z=transform(ps[i]);raised=.006+.016*(.5+.5*math.sin(x*231+z*183+y*99))
            out.append((x*1.025,y+raised,z*1.025))
        attrs={'POSITION':append(out)}
        for key in ['JOINTS_0','WEIGHTS_0']:
            a=base['accessors'][old['attributes'][key]];rows=values(base,bin0,old['attributes'][key]);attrs[key]=append([rows[i]for i in used],a['type'],a['componentType'])
        mi=len(d['materials']);d['materials'].append({'name':'Rough cropped dark hair','pbrMetallicRoughness':{'baseColorFactor':[.025,.018,.012,1],'metallicFactor':0,'roughnessFactor':.98},'doubleSided':True})
        hm={'primitives':[{'attributes':attrs,'indices':append([(lookup[i],)for i in inds],'SCALAR',5125),'material':mi}]}
        nd=copy.deepcopy(face_node);nd['name']='Rough cropped hair';nd['mesh']=len(d['meshes']);d['meshes'].append(hm);ni=len(d['nodes']);d['nodes'].append(nd)
        parent=next(n for n in d['nodes']if d['nodes'].index(face_node)in n.get('children',[]));parent['children'].append(ni)
    d['buffers'][0]={'byteLength':len(buf)};out='results/'+rid+'.glb';emit(d,bytes(buf),out)
    inventory.append({'id':rid,'bytes':pathlib.Path(out).stat().st_size,'sha256':hashlib.sha256(pathlib.Path(out).read_bytes()).hexdigest(),'headWidth':width,'headHeight':height,'hair':hair,'neckRestored':True})
pathlib.Path('results/build.json').write_text(json.dumps({'sourceSHA':source_sha,'fallbackSHA':base_sha,'recipes':inventory,'diagnosis':'Hollow builder keep-list omitted donor Face mesh (lower neck y1.4727–1.5663) while retaining Photo (miny1.5521). Restored original weighted donor Face only, with identical bind matrices/joints.','status':'Representative pilot; not approved50 recipe library or runtime integration'},indent=2))
print(json.dumps(inventory))
