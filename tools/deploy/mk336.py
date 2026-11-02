"""Build ops336-upload from ops335-upload.
Usage: mk336.py <candidate release.json sha256> <candidate source sha> <candidate fingerprint>
"""
import json, pathlib, shutil, sys

CAND_SHA, C336_SRC, C336_FP = sys.argv[1:4]
SRC = pathlib.Path('/mnt/HC_Volume_107195252/ops335-upload')
DST = pathlib.Path('/mnt/HC_Volume_107195252/ops336-upload')
assert not DST.exists()
shutil.copytree(SRC, DST)

P335_SHA = '8dab2fe7a5bd4cf887c37ae42a606b4e624b428c4695db4a575e9b03e150fa02'
P335_SRC = 'acc47f4efbe3f5ef96aa2e387fa90e9784a2db3c'

# Order matters: shift the candidate (335 -> 336) before the parent (334 -> 335).
CAND = ('three-20261028-335', 'three-20261028-336')
PARENT = ('three-20261028-334', 'three-20261028-335')
VERSION_SHIFT = [CAND, PARENT]


def edit(name, pairs):
    # A file may lack the parent string when it does not mention the parent.
    p = DST / name
    t = p.read_text()
    for old, new in pairs:
        if old not in t:
            assert old == PARENT[0], (name, old)
            continue
        t = t.replace(old, new)
    p.write_text(t)


for name in ['activate-preview.sh', 'nginx-preview.conf', 'publish-reviewed.sh', 'resume-publish.sh']:
    edit(name, VERSION_SHIFT)

edit('rollback-owned-routing.py', VERSION_SHIFT)
edit('wait-route-ready.py', [('rollout=335', 'rollout=336')])
edit('promote-root.py', VERSION_SHIFT + [
    ('ROOT335 active', 'ROOT336 active'),
    ("'333', '334']:", "'333', '334', '335']:"),
])
edit('verify-served.py', VERSION_SHIFT + [
    ('root335', 'root336'),
    ("[('334',", "[('335','%s'),('334'," % P335_SHA),
])
edit('verify-routing.py', VERSION_SHIFT + [
    ('rollout=335', 'rollout=336'),
    (P335_SHA, CAND_SHA),
])

(DST / 'mksums335.py').rename(DST / 'mksums336.py')

plan = json.loads((DST / 'deployment-plan.json').read_text())
plan['parent'] = {
    'version': 'three-20261028-335',
    'source': P335_SRC,
    'releaseSHA': P335_SHA,
}
plan['candidate'] = {
    'version': 'three-20261028-336',
    'source': C336_SRC,
    'fingerprint': C336_FP,
    'releaseSHA': CAND_SHA,
}
plan['privateRoot'] = '/opt/armagedom-preview-staging/three-20261028-336-private'
(DST / 'deployment-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
print('ok')
