"""Repeatable colour grade: six later areas toward the westminster/east/south look.
Colour/tone only; same pixel grid. Usage: python grade.py"""
import io, json, numpy as np, cv2
from PIL import Image, ImageDraw
from stats import REF, TGT, load, stats, table

P = dict(
    hue_lo=12.0, hue_hi=48.0, hue_feather=10.0,   # warm hue band (deg), soft edges
    chroma_cut=0.55,        # max chroma reduction of strongly warm highlights (fraction)
    chroma_cut_mid=0.25,    # chroma reduction of warm mid tones
    lum_knee=42.0,          # L* above which warm highlights are compressed
    lum_ratio=0.45,         # slope above knee for fully warm pixels (1 = none)
    glow_sigma=14.0,        # px; low-frequency warm glow is pulled down extra
    glow_cut=0.35,          # fraction of warm low-freq glow removed (cores kept)
    ab_mean=0.6, ab_std=0.6,  # partial Reinhard match of LAB a/b to reference pool
    l_match=0.5,            # partial histogram match of L* to reference pool
)
AREA_STRENGTH = {'area8': 1.0, 'area7': 1.0, 'east-bridge': 1.0, 'central-hub': 0.6,
                 'lambeth': 1.0, 'elephant-and-castle': 1.0}


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def to_lab(rgb):
    lab = cv2.cvtColor(rgb.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    return lab[..., 0], lab[..., 1], lab[..., 2]


def from_lab(L, a, b):
    out = cv2.cvtColor(np.dstack([L, a, b]).astype(np.float32), cv2.COLOR_Lab2RGB)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def warm_weight(a, b, L):
    """soft 0..1 weight of 'orange' pixels from LAB hue angle (deg) and chroma."""
    hue = (np.degrees(np.arctan2(b, a)) + 360) % 360   # LAB hue: orange approx 50-80 deg
    # map HSV 12-48 deg onto LAB hue band
    lo, hi, f = P['hue_lo'] + 38, P['hue_hi'] + 38, P['hue_feather']
    w = smooth((hue - (lo - f)) / f) * smooth(((hi + f) - hue) / f)
    chroma = np.hypot(a, b)
    return w * smooth((chroma - 6) / 20)


def reference_pool():
    ab, Ls = [], []
    for n in REF:
        L, a, b = to_lab(load(f'src/{n}/backdrop-phone.webp'))
        Ls.append(L.ravel()[::7]); ab.append(np.stack([a.ravel()[::7], b.ravel()[::7]], 1))
    ab = np.concatenate(ab); Ls = np.concatenate(Ls)
    return dict(a_m=float(ab[:, 0].mean()), a_s=float(ab[:, 0].std()),
                b_m=float(ab[:, 1].mean()), b_s=float(ab[:, 1].std()), L=np.sort(Ls))


def grade(rgb, ref, k):
    L, a, b = to_lab(rgb)
    # 1. hue-targeted desaturation + compression of warm highlights
    w = warm_weight(a, b, L) * k
    hl = smooth((L - 30) / 40)                      # highlight-ness
    cut = P['chroma_cut_mid'] + (P['chroma_cut'] - P['chroma_cut_mid']) * hl
    scale = 1 - w * cut
    a, b = a * scale, b * scale
    over = np.maximum(L - P['lum_knee'], 0)
    L = L - w * over * (1 - P['lum_ratio'])
    # 2. kill big warm blooms but leave small lamp cores: remove part of the blurred warm excess
    wb = cv2.GaussianBlur(w, (0, 0), P['glow_sigma'])
    Lb = cv2.GaussianBlur(L, (0, 0), P['glow_sigma'])
    ex = np.maximum(Lb - cv2.GaussianBlur(L, (0, 0), P['glow_sigma'] * 6), 0)
    core = np.maximum(L - Lb, 0)                    # local peak above its surroundings = core, kept
    L = L - P['glow_cut'] * k * wb * ex
    L = L + 0  # core detail preserved because only the blurred excess is subtracted
    # 3. partial Reinhard match of a/b to the reference pool
    for ch, key in ((0, 'a'), (1, 'b')):
        x = a if ch == 0 else b
        m, s = x.mean(), x.std() + 1e-6
        tm, ts = ref[key + '_m'], ref[key + '_s']
        m2 = m + P['ab_mean'] * k * (tm - m)
        s2 = s * (1 + P['ab_std'] * k * (min(ts / s, 1.0) - 1))
        x = (x - m) * (s2 / s) + m2
        if ch == 0: a = x
        else: b = x
    # 4. partial L histogram match to reference pool
    flat = L.ravel()
    order = np.argsort(flat)
    ranks = np.empty(flat.size, np.float32); ranks[order] = np.linspace(0, 1, flat.size)
    target = np.interp(ranks, np.linspace(0, 1, ref['L'].size), ref['L'])
    sm = P['l_match'] * k
    Lm = (1 - sm) * flat + sm * target
    # never brighten lamp-free areas above their original; matching only pulls tone
    L = np.minimum(Lm, flat + 3).reshape(L.shape)
    return from_lab(L, a, b)


def encode(img, target_bytes):
    best = None
    for q in range(60, 96):
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=q, method=6)
        best = (q, buf.getvalue())
        if len(best[1]) >= target_bytes: break
    return best


def label(im, text):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 190, 22], fill=(0, 0, 0)); d.text((6, 5), text, fill=(255, 255, 255))
    return im


if __name__ == '__main__':
    import os
    ref = reference_pool()
    json.dump(dict(params=P, area_strength=AREA_STRENGTH, reference_pool={k: v for k, v in ref.items() if k != 'L'},
                   webp='method 6, quality chosen per image to match source byte size'),
              open('params.json', 'w'), indent=1)
    res = {}
    for n in TGT:
        sp = f'src/{n}/backdrop-phone.webp'
        src = Image.open(sp).convert('RGB')
        out = grade(np.asarray(src), ref, AREA_STRENGTH[n])
        im = Image.fromarray(out)
        assert im.size == src.size
        q, data = encode(im, os.path.getsize(sp))
        os.makedirs(f'out/{n}', exist_ok=True)
        open(f'out/{n}/backdrop-phone.webp', 'wb').write(data)
        res[n] = dict(quality=q, bytes=len(data), src_bytes=os.path.getsize(sp))
        # compare
        g = Image.open(f'out/{n}/backdrop-phone.webp').convert('RGB')
        w = 800; h = round(src.size[1] * w / src.size[0])
        c = Image.new('RGB', (1600, h))
        c.paste(label(src.resize((w, h), Image.LANCZOS), f'{n} BEFORE'), (0, 0))
        c.paste(label(g.resize((w, h), Image.LANCZOS), f'{n} AFTER'), (w, 0))
        c.save(f'compare/{n}.jpg', quality=80)
    ref_imgs = [Image.open(f'src/{n}/backdrop-phone.webp').convert('RGB').resize((533, 300), Image.LANCZOS) for n in REF]
    s = Image.new('RGB', (1599, 300))
    for i, (n, im) in enumerate(zip(REF, ref_imgs)):
        s.paste(label(im, n), (i * 533, 0))
    s.save('compare/reference.jpg', quality=80)
    t0, r0 = table([(n, f'src/{n}/backdrop-phone.webp') for n in REF + TGT], 'Before (source)')
    t1, r1 = table([(n, f'out/{n}/backdrop-phone.webp') for n in TGT], 'After (graded)')
    enc = '\n### Encoding\n\n' + '\n'.join(f'- {n}: q{v["quality"]}, {v["bytes"]} B (source {v["src_bytes"]} B)' for n, v in res.items())
    open('stats.md', 'w').write('# Backdrop stats\n\nbright orange = hue 15-45 deg, S>0.5, V>0.6 (HSV). warm hi = hue 15-45, V>0.6. '
                                'L is CIE L* 0-100.\n\n' + t0 + '\n' + t1 + enc + '\n')
    print(t1 + enc)
