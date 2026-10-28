#!/usr/bin/env python3
"""first30_list.py OUT.json   (VPS) the looks of the first 30 Armagedom crowd bodies (19 shipped + 11 withheld), from the factory rows they were built from."""
import json, sys
P = '/mnt/frankendom-donors/_private-ref-games/parts-lab/makehuman'
b = json.load(open(P + '/mh-rows.json'))['bodies']
g = json.load(open(P + '-gen/gen-rows-0001-0050.json'))['bodies']
out = []


def add(i, r):
    out.append(dict(id=i, gender='m' if r['macro']['gender'] >= 0.5 else 'f', age=r['macro'].get('age'), skin=r['skin'].replace('.mhmat', ''), hair=(r.get('hair') or 'bald').replace('.mhclo', ''),
                    outfit=r['clothes'][0].replace('.mhclo', ''), shoes=r['clothes'][-1].replace('.mhclo', ''), shirt='?', trousers='?'))


for i in 'mh-male-01 mh-man-01 mh-man-02 mh-man-03 mh-woman-01 mh-woman-02 mh-female-01 mh-tall-01 mh-giant-01 mh-brute-01'.split():
    add(i, b[i])
for n in '0001 0002 0005 0009 0011 0012 0014 0015 0017 0020 0021 0027 0030 0036 0037 0041 0043 0044 0046 0048'.split():
    add('mh-gen-v2-' + n, g['body-' + n])
json.dump(out, open(sys.argv[1], 'w'), indent=1)
print(len(out))
