"""Build opsN-upload from ops(N-1)-upload. Replaces the per-release mkNNN.py.

Usage: mk.py N [--base DIR] [--releases FILE]

Constants (parent source and release sha, candidate source, fingerprint and release sha) come from the
releases.json rows for N and N-1; nothing is edited per release. The candidate row must already carry
releaseSHA (add it after packaging, before running this).
"""
import argparse, json, pathlib, shutil

ap = argparse.ArgumentParser()
ap.add_argument('n', type=int)
ap.add_argument('--base', default='/mnt/HC_Volume_107195252')
ap.add_argument('--releases', default=str(pathlib.Path(__file__).with_name('releases.json')))
a = ap.parse_args()

N, P, PP, PPP = a.n, a.n - 1, a.n - 2, a.n - 3
rows = json.load(open(a.releases))
cand, par = rows[str(N)], rows[str(P)]
for r in (cand, par):
    assert r.get('source') and r.get('releaseSHA'), r
assert cand.get('fingerprint'), cand
SRC = pathlib.Path(a.base) / f'ops{P}-upload'
DST = pathlib.Path(a.base) / f'ops{N}-upload'
assert not DST.exists()
shutil.copytree(SRC, DST)

pre = cand['version'][:-len(str(N))]
v = lambda k: pre + str(k)
# Order matters: shift the candidate (P -> N) before the parent (PP -> P).
VERSION_SHIFT = [(v(P), v(N)), (v(PP), v(P))]


def edit(name, pairs):
    # A file may lack the parent string when it does not mention the parent.
    p = DST / name
    t = p.read_bytes().decode()
    for old, new in pairs:
        if old not in t:
            assert old == v(PP), (name, old)
            continue
        t = t.replace(old, new)
    p.write_bytes(t.encode())


for name in ['activate-preview.sh', 'nginx-preview.conf', 'publish-reviewed.sh', 'resume-publish.sh']:
    edit(name, VERSION_SHIFT)

edit('rollback-owned-routing.py', VERSION_SHIFT)
edit('wait-route-ready.py', [(f'rollout={P}', f'rollout={N}')])
edit('promote-root.py', VERSION_SHIFT + [
    (f'ROOT{P} active', f'ROOT{N} active'),
    (f"'{PPP}', '{PP}']:", f"'{PPP}', '{PP}', '{P}']:"),
])
edit('verify-served.py', VERSION_SHIFT + [
    (f'root{P}', f'root{N}'),
    (f"[('{PP}',", f"[('{P}','{par['releaseSHA']}'),('{PP}',"),
])
edit('verify-routing.py', VERSION_SHIFT + [
    (f'rollout={P}', f'rollout={N}'),
    (par['releaseSHA'], cand['releaseSHA']),
])

(DST / f'mksums{P}.py').rename(DST / f'mksums{N}.py')

plan = json.loads((DST / 'deployment-plan.json').read_bytes())
plan['parent'] = {'version': par['version'], 'source': par['source'], 'releaseSHA': par['releaseSHA']}
plan['candidate'] = {'version': cand['version'], 'source': cand['source'],
                     'fingerprint': cand['fingerprint'], 'releaseSHA': cand['releaseSHA']}
plan['privateRoot'] = f'/opt/armagedom-preview-staging/{cand["version"]}-private'
(DST / 'deployment-plan.json').write_bytes((json.dumps(plan, indent=2) + '\n').encode())
print('ok')
