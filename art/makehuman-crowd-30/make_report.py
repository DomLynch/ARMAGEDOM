#!/usr/bin/env python3
"""make_report.py WORK_DIR REPO_DIR   (Mac)  WORK_DIR = the pulled VPS folder (crowd30-*.json/tsv, first30.json, build*.log, sizes.tsv, selected.txt, out/*.glb)
Writes in REPO_DIR/art/makehuman-crowd-30/: reduction-report.md, rows.json (mh-worn-NN -> factory row + palette names), diff-vs-first-30.md.
The GLBs themselves are copied to REPO_DIR/Web/public/assets/crowd/mh-worn-NN.glb in the order of selected.txt."""
import sys, os, re, json, gzip, shutil

W, R = sys.argv[1], sys.argv[2]
A = os.path.join(R, 'art/makehuman-crowd-30')
rows = json.load(open(W + '/crowd30-rows.json'))['bodies']
pal = json.load(open(W + '/crowd30-palette.json'))['bodies']
first = json.load(open(W + '/first30.json'))
sel = [l.split()[0] for l in open(W + '/selected.txt') if l.strip()]
tris = {}
for log in ('batch1.log', 'batch2.log', 'batch3.log', 'rebuild.log'):      # later logs win (rebuild.log = the 16 bodies rebuilt after the rect fix)
    for l in open(W + '/' + log):
        m = re.match(r'(body-\d+) (\{"killed".*\})', l)
        if m: tris[m.group(1)] = json.loads(m.group(2))
sizes = {l.split('\t')[0]: int(l.split('\t')[1]) for l in open(W + '/sizes.tsv') if l.strip()}
os.makedirs(R + '/Web/public/assets/crowd', exist_ok=True)
rep = ['# Crowd batch 2 (worn 2030 clothing) reduction report', '',
       '| id | tris before | tris after | KB before | KB after | gz KB after | joints | row |', '|---|---|---|---|---|---|---|---|']
rj = {}
for n, bid in enumerate(sel, 1):
    nid = 'mh-worn-%02d' % n
    src = W + '/out/%s.glb' % bid; dst = R + '/Web/public/assets/crowd/%s.glb' % nid
    shutil.copyfile(src, dst)
    data = open(dst, 'rb').read()
    t = tris[bid]
    rep.append('| %s | %d | %d | %d | %d | %d | 106 | %s |' % (nid, t['trisPostLayer'], t['trisOut'], round(sizes[bid] / 1024), round(len(data) / 1024), round(len(gzip.compress(data)) / 1024), bid))
    r = rows[bid]
    rj[nid] = {'factory_row': bid, 'row': r, 'palette': pal[bid]}
open(A + '/reduction-report.md', 'w').write('\n'.join(rep) + '\n')
json.dump(rj, open(A + '/rows.json', 'w'), indent=1)

# diff against the first 30
man = {l.split('\t')[0]: l.rstrip('\n').split('\t') for l in open(W + '/crowd30-manifest.tsv')}
used = {(f['skin'], f['hair'], f['outfit']) for f in first}
out = ['# Diff against the first 30 crowd bodies', '',
       'First 30 = the 30 delivered by OpenTrident Dev for batch 1 (19 shipped, 11 withheld for a possible print, see ../makehuman-crowd/PROVENANCE.md).', '',
       '## First 30 (skin / hair / suit / sex)', '', '| id | sex | skin | hair | suit |', '|---|---|---|---|---|']
for f in first: out.append('| %s | %s | %s | %s | %s |' % (f['id'], f['gender'], f['skin'], f['hair'], f['outfit']))
out += ['', '## Batch 2 (30 built)', '', '| id | factory row | sex | age | skin | hair | suit | shirt | trousers | shoes | repeats a first-30 (skin, hair, suit)? |', '|---|---|---|---|---|---|---|---|---|---|---|']
rep_n = 0
for n, bid in enumerate(sel, 1):
    m = man[bid]; clash = (m[3], m[4], m[5]) in used; rep_n += clash
    out.append('| mh-worn-%02d | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % ((n, bid) + tuple(m[1:9]) + ('YES' if clash else 'no',)))
# within batch
trip = [(man[b][3], man[b][4], man[b][5]) for b in sel]
full = [(man[b][3], man[b][4], man[b][5], man[b][6], man[b][7]) for b in sel]
out += ['', 'Repeats of a first-30 (skin, hair, suit) triple: %d. Repeats inside batch 2: triples %d, full looks (with shirt and trousers) %d.' % (rep_n, len(trip) - len(set(trip)), len(full) - len(set(full))),
        'Clothing: batch 1 bodies wore the pack suits in the pack colours, a muted tint or a neon accent (first-30 colour columns are not tabulated: the 10 hand-made rows were recoloured by the look pass, the gen rows by tier). Batch 2 recolours the same pack suits from a separate worn set (faded, dark, dust, rust and mud tones; shirt and trousers apart; scuffed shoes; natural or grey hair; no neon). The comparison key is therefore skin + hair + suit, which is stricter than the colour.']
open(A + '/diff-vs-first-30.md', 'w').write('\n'.join(out) + '\n')
print('selected', len(sel), 'repeats vs first 30:', rep_n)
