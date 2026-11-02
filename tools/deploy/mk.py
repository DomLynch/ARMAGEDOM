"""Build opsN-upload from ops(N-1)-upload. Replaces the per-release mkNNN.py.

Usage: mk.py N [--base DIR] [--releases FILE] [--parent P]  (P defaults to N-1; use it when N-1 was never staged)

Constants (parent source and release sha, candidate source, fingerprint and release sha) come from the
releases.json rows for N and N-1; nothing is edited per release. The candidate row must already carry
releaseSHA (add it after packaging, before running this).
"""
import argparse, json, pathlib, re, shutil

ap = argparse.ArgumentParser()
ap.add_argument('n', type=int)
ap.add_argument('--base', default='/mnt/HC_Volume_107195252')
ap.add_argument('--releases', default=str(pathlib.Path(__file__).with_name('releases.json')))
ap.add_argument('--parent', type=int)
a = ap.parse_args()

N = a.n
P = a.parent or N - 1
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
# The source ops set names its own candidate and parent (they differ from P and P-1 when a release was never staged).
# Order matters: shift the candidate (-> N) before the parent (-> P).
src_plan = json.loads((SRC / 'deployment-plan.json').read_bytes())
S, SP = src_plan['candidate']['version'], src_plan['parent']['version']
assert S == v(P), ('source ops candidate is not the parent', S, v(P))
VERSION_SHIFT = [(S, v(N)), (SP, v(P))]
PP = int(SP[len(pre):])
UNSTAGED = {int(k) for k in rows.get('_unstaged', [])}


def edit(name, pairs):
    # A file may lack the parent string when it does not mention the parent.
    p = DST / name
    t = p.read_bytes().decode()
    for old, new in pairs:
        if old not in t:
            assert old == SP, (name, old)
            continue
        t = t.replace(old, new)
    p.write_bytes(t.encode())


for name in ['activate-preview.sh', 'nginx-preview.conf', 'publish-reviewed.sh', 'resume-publish.sh']:
    edit(name, VERSION_SHIFT)

edit('rollback-owned-routing.py', VERSION_SHIFT)
edit('wait-route-ready.py', [(f'rollout={P}', f'rollout={N}')])
edit('promote-root.py', VERSION_SHIFT + [(f'ROOT{P} active', f'ROOT{N} active')])


def patch_promote(path, floor, last):
    """Verify the previews floor..last (the rollback floor onward) instead of a hard-coded list of every historical
    build, and abort naming the build if one is missing."""
    t = path.read_bytes().decode()
    lst = re.compile(r"for n in \[(?:'\d+', )*'\d+'\]:")
    assert len(lst.findall(t)) == 1, 'promote-root.py list literal not found exactly once'
    t = lst.sub('for n in %r:' % [str(k) for k in range(floor, last + 1) if k not in UNSTAGED], t)
    old = " m=json.loads((root/'release.json').read_text())"
    assert t.count(old) == 1
    guard = " assert (root/'release.json').exists(), 'Missing preview build %s: restore it before flipping' % root\n"
    t = t.replace(old, guard + old)
    path.write_bytes(t.encode())


def patch_served(path, rows, floor, last):
    """verify-served compares each earlier preview's release sha over HTTP: restrict it to floor..last, from releases.json."""
    t = path.read_bytes().decode()
    lst = re.compile(r"for version,release_sha in \[(?:\('\d+','[0-9a-f]{64}'\),?)+\]:")
    assert len(lst.findall(t)) == 1, 'verify-served.py prior list not found exactly once'
    old = dict(re.findall(r"\('(\d+)','([0-9a-f]{64})'\)", lst.search(t).group(0)))
    pairs = [(str(k), rows[str(k)]['releaseSHA']) for k in range(last, floor - 1, -1) if k not in UNSTAGED]
    for k, sha in pairs:
        assert old.get(k, sha) == sha, ('releases.json disagrees with the old list', k)
    t = lst.sub('for version,release_sha in [' + ','.join("('%s','%s')" % p for p in pairs) + ']:', t)
    path.write_bytes(t.encode())


def patch_routing(path):
    """The domlynch.com legacy-alias check must not need the old preview build to exist: assert the 301 and its Location
    without following it (the redirect is the contract; the 2026100x builds are archived)."""
    t = path.read_bytes().decode()
    if 'legacy alias 301' in t:
        return
    pat = re.compile(r"r=urllib\.request\.urlopen\('https://domlynch\.com/armagedom/preview/(three-2026\d{4}-\d{3})/\?touch=1',timeout=15\);assert '/\1/\?touch=1' in r\.url")
    assert len(pat.findall(t)) == 1, 'verify-routing.py domlynch alias check not found exactly once'
    t = pat.sub(lambda m: (
        "try:opener.open('https://domlynch.com/armagedom/preview/%s/?touch=1',timeout=15);raise AssertionError('legacy alias 301 missing')\n"
        "except urllib.error.HTTPError as e:assert e.code==301 and 'playarmagedom.com/armagedom/preview/%s/?touch=1' in e.headers['Location'],'legacy alias 301'"
        % (m.group(1), m.group(1))), t)
    path.write_bytes(t.encode())


patch_promote(DST / 'promote-root.py', int(rows.get('_floor', 323)), P)
edit('verify-served.py', VERSION_SHIFT + [(f'root{P}', f'root{N}')])
patch_served(DST / 'verify-served.py', rows, int(rows.get('_floor', 323)), P)
edit('verify-routing.py', VERSION_SHIFT + [
    (f'rollout={P}', f'rollout={N}'),
    (par['releaseSHA'], cand['releaseSHA']),
])
patch_routing(DST / 'verify-routing.py')

(DST / f'mksums{P}.py').rename(DST / f'mksums{N}.py')

plan = json.loads((DST / 'deployment-plan.json').read_bytes())
plan['parent'] = {'version': par['version'], 'source': par['source'], 'releaseSHA': par['releaseSHA']}
plan['candidate'] = {'version': cand['version'], 'source': cand['source'],
                     'fingerprint': cand['fingerprint'], 'releaseSHA': cand['releaseSHA']}
plan['privateRoot'] = f'/opt/armagedom-preview-staging/{cand["version"]}-private'
(DST / 'deployment-plan.json').write_bytes((json.dumps(plan, indent=2) + '\n').encode())
print('ok')
