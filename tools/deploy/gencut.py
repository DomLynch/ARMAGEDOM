"""Derive gateN.sh, installN.sh and mkmanifestN.py for release N from release N-1's.

Usage: gencut.py N CAND_SRC CAND_FP   (run on the VPS beside the per-cut scripts)
"""
import pathlib, re, sys

N, CSRC, CFP = sys.argv[1:4]
n = int(N)
P = n - 1
R = pathlib.Path('/mnt/HC_Volume_107195252')
DATE = 'three-20261028-'

gate = (R / f'gate{P}.sh').read_text()
keep = sys.argv[4] if len(sys.argv) > 4 else f'deploy{P}-b{P - 1}'  # last baseline in the parent's BASES
assert keep in gate
gate = gate.replace(keep, 'KEEPLAST').replace(str(P), str(n))
gate = gate.replace('KEEPLAST', f'{keep} deploy{n}-b{P}')
(R / f'gate{n}.sh').write_text(gate)

inst = (R / f'install{P}.sh').read_text().replace(str(P), str(n)).replace(f'Root stays on {P - 1}', f'Root stays on {P}')
(R / f'install{n}.sh').write_text(inst)

old = (R / f'mkmanifest{P}.py').read_text()
shas = re.findall(r"'sourceCommit': '([0-9a-f]{40})'", old) + re.findall(r"'sourceFingerprint': '([0-9a-f]{64})'", old)
assert len(shas) == 2, shas
mm = old.replace(DATE + str(P), DATE + str(n)).replace(shas[0], CSRC).replace(shas[1], CFP)
(R / f'mkmanifest{n}.py').write_text(mm)
print('gen ok', n)
