#!/usr/bin/env python3
"""crowd30_rows.py OUT_DIR FIRST_30_JSON [--count 34] [--seed 20301028]   (VPS, plain python3)

Armagedom crowd batch 2: realistic adult bodies in worn 2030 clothing, built through the OpenTrident MakeHuman factory
(mh_gen_rows.make_body for the macro, skin, hair, outfit and shoes draw; this file for the worn palette and the
no-repeat gate against the first 30 crowd bodies). Ids body-0101 ... (stable for a seed). Writes
  OUT_DIR/crowd30-rows.json      rows file for mh_batch.py (defaults copied from mh-rows.json)
  OUT_DIR/crowd30-palette.json   palette rows (env PALETTE_ROWS): shirt and trousers by UV region, worn shoes, natural hair
  OUT_DIR/crowd30-manifest.tsv   id, gender, age, skin, hair, outfit, shirt, trousers, shoes
Rules: no creature heads, no hats, no armour, no neon (pack has suits only, so "worn" = faded, dull, dark-washed tones),
normal silhouettes only. Gate: no body shares (skin, hair, outfit, shirt, trousers) with any of the first 30 or each other,
and no (skin, hair, outfit) triple repeats inside this batch.
"""
import sys, os, json, random, argparse
sys.path.insert(0, '/root')
import mh_gen_rows as G

# The 9 suits of the CC0 pack, placed by eye on a UV grid sheet (suit_sheet.py): RECTS = trouser or skirt panels (fractions, top-left origin),
# LOGOS = the round MakeHuman logo prints on the shirts (filled with plain cloth by the "worn" palette mode, tools-patch/worn_mode.py).
# The look-pass rect table of batch 1 (mh_look_rows.py) is wrong for casualsuit03/05/06 and the female suits, so it is not reused.
RECTS = {
    'male_casualsuit01': [[0.35, 0.0, 0.73, 1.0]], 'male_casualsuit02': [[0.0, 0.45, 0.78, 1.0]], 'male_casualsuit03': [[0.04, 0.0, 0.99, 0.58]],
    'male_casualsuit04': [[0.0, 0.42, 0.78, 1.0]], 'male_casualsuit05': [[0.0, 0.5, 0.66, 1.0]], 'male_casualsuit06': [[0.0, 0.42, 0.78, 1.0]],
    'female_casualsuit01': [[0.0, 0.47, 0.76, 1.0]], 'female_casualsuit02': [[0.0, 0.46, 0.76, 1.0]], 'female_elegantsuit01': [[0.0, 0.0, 1.0, 0.32]],
}
LOGOS = {
    'male_casualsuit02': [[0.47, 0.10, 0.64, 0.27]], 'male_casualsuit04': [[0.47, 0.10, 0.64, 0.27]],
    'male_casualsuit06': [[0.16, 0.05, 0.42, 0.20], [0.46, 0.04, 0.64, 0.20], [0.74, 0.12, 0.82, 0.22]],
    'female_casualsuit01': [[0.64, 0.11, 0.95, 0.32]], 'female_casualsuit02': [[0.58, 0.11, 0.89, 0.32]],
}
G.OUTFITS = {'m': [k for k in RECTS if k.startswith('male')], 'f': [k for k in RECTS if k.startswith('female')]}
# worn 2030: faded, sun-bleached, oil-dark, patched-over tones. Nothing saturated.
WORN_SHIRT = {'faded-denim': [0.30, 0.38, 0.48], 'bleached-khaki': [0.62, 0.58, 0.46], 'dust-grey': [0.46, 0.46, 0.44], 'soot-black': [0.15, 0.15, 0.16],
              'rust-stained': [0.50, 0.32, 0.24], 'moss-drab': [0.34, 0.38, 0.26], 'tarp-green': [0.26, 0.34, 0.30], 'washed-maroon': [0.38, 0.20, 0.22],
              'ash-cream': [0.70, 0.66, 0.56], 'dull-teal': [0.24, 0.36, 0.38], 'mud-brown': [0.36, 0.28, 0.22], 'faded-mustard': [0.58, 0.48, 0.24]}
WORN_TROUSER = {'black-denim': [0.14, 0.14, 0.16], 'grey-work': [0.30, 0.30, 0.30], 'olive-drab': [0.28, 0.30, 0.20], 'dirt-khaki': [0.46, 0.42, 0.30],
                'dark-indigo': [0.16, 0.20, 0.31], 'mud-brown': [0.28, 0.21, 0.16], 'charcoal': [0.20, 0.20, 0.22]}
WORN_SHOE = {'scuffed-black': [0.11, 0.10, 0.10], 'worn-brown': [0.24, 0.16, 0.10], 'dust-tan': [0.42, 0.34, 0.22], 'grey-canvas': [0.32, 0.32, 0.33]}
HAIR = {'black': [0.06, 0.05, 0.05], 'dark-brown': [0.16, 0.10, 0.07], 'brown': [0.27, 0.18, 0.11], 'auburn': [0.34, 0.15, 0.08], 'dark-blond': [0.42, 0.33, 0.18], 'grey': [0.50, 0.50, 0.50], 'white': [0.78, 0.77, 0.74]}


def hair_for(rng, age):
    if age >= 0.85: return rng.choice(['grey', 'grey', 'white', 'dark-brown'])
    if age >= 0.7: return rng.choice(['grey', 'black', 'dark-brown', 'brown'])
    return rng.choice(['black', 'dark-brown', 'brown', 'auburn', 'dark-blond', 'black'])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('first30'); ap.add_argument('--count', type=int, default=34)
    ap.add_argument('--seed', type=int, default=20301028); ap.add_argument('--base', default='/mnt/frankendom-donors/_private-ref-games/parts-lab/makehuman/mh-rows.json')
    ap.add_argument('--start', type=int, default=101)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    first = json.load(open(a.first30))                       # list of {id, skin, hair, outfit, shirt, trousers}
    used_full = {(r['skin'], r['hair'], r['outfit'], r['shirt'], r['trousers']) for r in first}
    used_triple = {(r['skin'], r['hair'], r['outfit']) for r in first}      # also keep the same person-look out: skin + hair + outfit
    defaults = json.load(open(a.base))['defaults']
    bodies, pal, man = {}, {}, []
    n = a.start; guard = 0
    while len(bodies) < a.count and guard < 5000:
        guard += 1; idx = n; n += 1
        i, row, _p, line = G.make_body(idx, a.seed)       # the v1 generator that built the first 50 (VPS copy of mh_gen_rows.py)
        rng = random.Random('crowd30:%d:%d' % (a.seed, idx))
        of = row['clothes'][0].replace('.mhclo', ''); skin = row['skin'].replace('.mhmat', ''); hair = row.get('hair', 'bald.mhclo').replace('.mhclo', '')
        age = row['macro']['age']
        if hair == 'bald' and row['macro']['gender'] < 0.5: continue       # no bald women in a crowd of worn civilians
        if sum(1 for b in bodies.values() if (b['macro']['gender'] >= 0.5) == (row['macro']['gender'] >= 0.5)) >= (a.count + 1) // 2: continue       # balanced sexes
        sh = rng.choice(list(WORN_SHIRT)); tr = rng.choice(list(WORN_TROUSER)); so = rng.choice(list(WORN_SHOE))
        if (skin, hair, of) in used_triple: continue
        if (skin, hair, of, sh, tr) in used_full: continue
        used_triple.add((skin, hair, of)); used_full.add((skin, hair, of, sh, tr))
        hc = hair_for(rng, age)
        row['label'] = 'Crowd worn %04d' % idx
        row['gen'] = {'seed': a.seed, 'index': idx, 'batch': 'armagedom-crowd-30', 'palette': {'shirt': sh, 'trousers': tr, 'shoes': so, 'hair': hc}}
        row['batch'] = 200
        bodies[i] = row
        sp = [{'match': r'\.%s$' % of, 'mode': 'worn', 'rects': RECTS[of], 'in': WORN_TROUSER[tr], 'out': WORN_SHIRT[sh], 'logo_rects': LOGOS.get(of, []),
               'dirt': round(rng.uniform(0.35, 0.65), 2), 'fade': round(rng.uniform(0.10, 0.22), 2), 'seed': idx},
              {'match': r'shoes0\d', 'mode': 'tone', 'rgb': WORN_SHOE[so]}]
        if hair != 'bald':
            sp.append({'match': r'\.(short|bob|long|ponytail|braid|afro)0\d', 'mode': 'tone', 'rgb': HAIR[hc]})
        sp.append({'match': 'eyebrow', 'mode': 'tone', 'rgb': [round(c * 0.85, 3) for c in HAIR[hc]]})
        pal[i] = sp
        man.append([i, 'm' if row['macro']['gender'] >= 0.5 else 'f', age, skin, hair, of, sh, tr, so])
    json.dump({'about': 'Armagedom crowd batch 2 rows (crowd30_rows.py, seed %d)' % a.seed, 'defaults': defaults, 'bodies': bodies}, open(a.out + '/crowd30-rows.json', 'w'), indent=1)
    json.dump({'about': 'worn 2030 palette rows', 'bodies': pal}, open(a.out + '/crowd30-palette.json', 'w'), indent=1)
    with open(a.out + '/crowd30-manifest.tsv', 'w') as f:
        f.write('id\tgender\tage\tskin\thair\toutfit\tshirt\ttrousers\tshoes\n')
        for l in man: f.write('\t'.join(str(x) for x in l) + '\n')
    print('wrote %d rows, ids %s..%s' % (len(bodies), man[0][0], man[-1][0]))


if __name__ == '__main__':
    main()
