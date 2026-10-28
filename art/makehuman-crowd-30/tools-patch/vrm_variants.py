"""Variants of a VRM body from data rows (VPS Blender 5.2 headless, called by vrm_export.py before the export): recolour the textures and reshape the mesh.
Row fields (vrm-rows.json, a body row may also say `"from": "<id>"` to inherit every field of another body row):
  recolor: [{"match": "<regex on the material name>", "mode": "tone" | "hue", ...}]
    tone: the texture's light and dark pattern is kept and re-coloured to "rgb" [r,g,b] 0..1 (sRGB): out = rgb * (luma / its 92nd percentile), the brightest part lifted toward white by "highlight" (default 0.3).
          For hair: the dark blue hair of a sample becomes any colour. optional "dark_floor" (default 0.12) keeps black lines from going to pure black.
    hue:  rotate the hue by "hue_deg", multiply saturation by "sat" (default 1) and value by "val" (default 1): for outfits and eyes.
  shape: {"fat": k, "belly": b, "arms": ka, "legs": kl, "neck": kn}   radial inflation about each humanoid bone's own axis: a vertex moves away from the line through the bone by
    weight * k * its distance from that line (k 0.3 = clearly plump, 0.6 = fat); belly adds a forward (front = +Y in Blender before the half turn) push on the torso's front vertices.
    Defaults per bone group: torso = fat, arms = fat * 0.8, legs = fat * 0.9, hands and feet = 0.25 * fat, neck = fat * 0.3, head = 0 (the face is never inflated).
  The height / width scale is not here: it is the row `scale` [x, y, z] applied in vrm_rest.py on the finished file."""
import re, math
import numpy as np
import bpy


def _rgb_to_hsv(rgb):
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]; mx = rgb.max(1); mn = rgb.min(1); d = mx - mn; h = np.zeros_like(mx)
    m = d > 1e-6; rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6; h[gm] = (b - r)[gm] / d[gm] + 2; h[bm] = (r - g)[bm] / d[bm] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0); return np.stack([h / 6.0, s, mx], 1)


def _hsv_to_rgb(hsv):
    h, s, v = hsv[:, 0] * 6.0, hsv[:, 1], hsv[:, 2]; i = np.floor(h).astype(int) % 6; f = h - np.floor(h); p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.zeros_like(hsv); sel = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    for k, (a, b, c) in enumerate(sel): m = i == k; out[m, 0] = a[m]; out[m, 1] = b[m]; out[m, 2] = c[m]
    return out


def palette(bid):
    """the data-row palette of one body: env PALETTE_ROWS = palette-rows.json {"bodies": {id: [recolour rows]}}; [] when there is none. The body's own `recolor` rows run first, the palette after."""
    import os, json
    p = os.environ.get('PALETTE_ROWS')
    return (json.load(open(p))['bodies'].get(bid, []) if p and os.path.exists(p) else [])


def recolor_pixels(rgb, a, spec, size=None):
    """the pixel maths of one recolour row, no Blender needed: rgb (n,3) 0..1 sRGB, a (n,) alpha, size (W, H) of the image (mode regions) -> new rgb (n,3). Modes: tone, split, regions, mul, hue"""
    if spec['mode'] == 'worn':      # Armagedom crowd batch 2: regions recolour + logo fill + dirt and fade (worn_mode.py, same folder)
        import worn_mode
        return worn_mode.apply(rgb, a, spec, size, recolor_pixels)
    if size is not None: size = (int(size[0]), int(size[1])); size = (size[1], size[0])      # callers pass (W, H); the maths below reads (H, W)
    if spec['mode'] == 'tone':
        lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32); live = a > 0.5; ref = float(np.percentile(lum[live], float(spec.get('ref_pct', 60)))) if live.any() else 1.0      # the typical pixel gets the full target colour (a dark sample hair would otherwise stay dark)
        nrm = np.clip(lum / max(ref, 1e-4), 0, 1.3) ** float(spec.get('gamma', 0.5))      # gamma < 1 lifts the mid tones: a dark sample hair becomes a bright pink, not a dark one (the old `dark_floor` line sat inside a comment and never ran: behaviour kept so built hair does not shift)
        t = np.array(spec['rgb'], np.float32); out = t[None, :] * nrm[:, None]
        hl = np.clip((nrm - 0.85) / 0.4, 0, 1)[:, None] * float(spec.get('highlight', 0.3)); out = out * (1 - hl) + hl
    elif spec['mode'] == 'split':      # two colours in one texture: the dark areas (a navy vest, trousers) take "dark", the light areas (a white shirt) take "light", shading kept in both; "thr" = luma between them (default 0.45), soft edge
        lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32); live = a > 0.5; thr = float(spec.get('thr', 0.45)); wid = float(spec.get('soft', 0.08)); gam = float(spec.get('gamma', 0.5))
        w = np.clip((lum - (thr - wid)) / (2 * wid), 0, 1)[:, None]

        def shade(mask):
            ref = float(np.percentile(lum[live & mask], float(spec.get('ref_pct', 60)))) if (live & mask).any() else 1.0
            return (np.clip(lum / max(ref, 1e-4), 0, 1.3) ** gam)[:, None]
        d = np.array(spec['dark'], np.float32)[None, :] * shade(lum < thr); l = np.array(spec['light'], np.float32)[None, :] * shade(lum >= thr)
        out = d * (1 - w) + l * w
    elif spec['mode'] == 'regions':      # colour by UV rectangle (fractions of the image, top-left origin, [x0, y0, x1, y1]): pixels inside any rect take "in" (the trousers), the rest "out" (the shirt); shading kept. For garments whose parts sit in known places (a tee above jeans) where a luma split would speckle the denim wash
        H, W = size; idx = np.arange(len(rgb)); x = ((idx % W) + 0.5) / W; y = 1.0 - ((idx // W) + 0.5) / H
        mask = np.zeros(len(rgb), bool)
        for x0, y0, x1, y1 in spec['rects']: mask |= (x >= x0) & (x < x1) & (y >= y0) & (y < y1)
        lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32); live = a > 0.5; gam = float(spec.get('gamma', 0.5))

        def shade(m):
            ref = float(np.percentile(lum[live & m], float(spec.get('ref_pct', 60)))) if (live & m).any() else 1.0
            return (np.clip(lum / max(ref, 1e-4), 0, 1.3) ** gam)[:, None]
        inn = np.array(spec['in'], np.float32)[None, :] * shade(mask); outc = np.array(spec['out'], np.float32)[None, :] * shade(~mask)
        out = np.where(mask[:, None], inn, outc)
    elif spec['mode'] == 'mul':      # multiplicative tint: every detail (eyes, tusks, teeth) stays, the whole texture takes the colour; the only mode that can colour a grey (wolf fur)
        out = rgb * np.array(spec['rgb'], np.float32)[None, :] * float(spec.get('gain', 1.0))
    else:
        hsv = _rgb_to_hsv(rgb.astype(np.float64)); hsv[:, 0] = (hsv[:, 0] + float(spec.get('hue_deg', 0)) / 360.0) % 1.0; hsv[:, 1] = np.clip(hsv[:, 1] * float(spec.get('sat', 1)), 0, 1)
        hsv[:, 2] = np.clip(hsv[:, 2] * float(spec.get('val', 1)), 0, 1); out = _hsv_to_rgb(hsv).astype(np.float32)
    return np.clip(out, 0, 1)


def recolor(body, specs, rep):
    done = {}
    for spec in specs:
        rx = re.compile(spec['match'], re.I)
        for m in body.data.materials:
            if not m or not rx.search(m.name) or not m.use_nodes: continue
            img = next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
            if img is None: continue
            if img.name in done: rep.setdefault('recolor_skipped_shared', []).append(m.name); continue
            n = len(img.pixels); buf = np.empty(n, np.float32); img.pixels.foreach_get(buf); px = buf.reshape(-1, 4); rgb = px[:, :3].copy(); a = px[:, 3]
            px[:, :3] = recolor_pixels(rgb, a, spec, tuple(img.size)); img.pixels.foreach_set(px.reshape(-1)); img.update(); done[img.name] = m.name
            if spec['mode'] in ('tone', 'split', 'regions', 'worn'): rep.setdefault('tone_materials', []).append(m.name)      # their VRM colour factor (a dark navy on a blue-haired sample) must not multiply the new colour
    rep['recolored_images'] = done


def reset_factors(path, names):
    """JSON patch of an exported GLB: baseColorFactor = white on the named materials (the re-toned hair: the texture alone carries the colour now)"""
    import json, struct
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); rest = b[20 + L:]; n = 0
    for m in j.get('materials', []):
        if m.get('name') in names: m.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = [1.0, 1.0, 1.0, 1.0]; n += 1
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    open(path, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest); return n


def face_morph(body, arm, f, rep):
    """Lower-face reshape of the joined body mesh (the face skin, mouth, brow and eye overlays move together because the field is spatial, not per material).
    Row face: {"jaw_w": 1.0 (width of the lower face, 1.15 = wider jaw, 0.9 = narrower), "chin_len": 0.0 (fraction of the face height the chin is lengthened, 0.12 = long chin, -0.05 = short),
               "chin_point": 0.0 (narrowing toward the chin tip: 0.4 = pointed, -0.15 = square), "nose": 0.0 (a forward bump of the nose area, fraction of the face height: 0.04 = clear nose),
               "cheek": 0.0 (extra width at the cheek line, 0.08 = chubby cheeks)}.
    Face height = from the eye line to the lowest face-skin vertex. Only the front of the head (in front of the Head joint) with Head-bone weight is touched; front = +Y in Blender before the half turn."""
    me = body.data; n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3).astype(np.float64)
    bones = arm.data.bones; hb = bones['mixamorig:Head']; eyes = [bones[x].head_local for x in ('mixamorig:LeftEye', 'mixamorig:RightEye') if x in bones]
    eye_z = float(np.mean([e[2] for e in eyes])) if eyes else float(hb.head_local[2]) + 0.08; head_y = float(hb.head_local[1]); cx = float(hb.head_local[0])
    humanoid = {b.name for b in bones if b.name.startswith('mixamorig:')}
    def host(name):
        b = bones.get(name)
        while b is not None and b.name not in humanoid: b = b.parent
        return b.name if b is not None else None
    vg_host = {g.index: host(g.name) for g in body.vertex_groups}; headset = {'mixamorig:Head', 'mixamorig:LeftEye', 'mixamorig:RightEye'}
    wh = np.zeros(n)
    for vi, v in enumerate(me.vertices):
        for g in v.groups:
            if vg_host.get(g.group) in headset: wh[vi] += g.weight
    wh = np.clip(wh, 0, 1)
    face_mi = {i for i, m in enumerate(me.materials) if m and 'Face_00_SKIN' in m.name}; fv = set()
    for p in me.polygons:
        if p.material_index in face_mi: fv.update(p.vertices)
    if not fv: rep['face_note'] = 'no face skin material found'; return
    chin_z = float(min(co[v, 2] for v in fv)); face_h = eye_z - chin_z
    if face_h <= 0.02: rep['face_note'] = 'face height %.3f unusable' % face_h; return
    t = np.clip((eye_z - co[:, 2]) / face_h, 0, 1); s = t * t * (3 - 2 * t)      # 0 at the eye line, 1 at the chin tip
    front = np.clip((co[:, 1] - (head_y - 0.01)) / 0.04, 0, 1); fw = wh * front; w = fw * s
    jaw_w, chin_len, chin_point = float(f.get('jaw_w', 1)), float(f.get('chin_len', 0)), float(f.get('chin_point', 0)); nose, cheek = float(f.get('nose', 0)), float(f.get('cheek', 0))
    xfac = 1 + (jaw_w - 1) * w; xfac *= (1 - chin_point * w * s)
    cheek_prof = np.exp(-(((t - 0.35) / 0.22) ** 2)) * fw; xfac += cheek * cheek_prof
    # the chin lengthening only acts BELOW the mouth (stretching through the mouth overlay turned it into jagged fangs): the ramp starts at the mouth's lowest vertex
    mouth_v = [v for p in me.polygons if me.materials[p.material_index] and 'FaceMouth' in me.materials[p.material_index].name for v in p.vertices]
    mouth_bot = float(min(co[v, 2] for v in mouth_v)) if mouth_v else eye_z - 0.62 * face_h
    t2 = np.clip((mouth_bot - co[:, 2]) / max(mouth_bot - chin_z, 1e-4), 0, 1); s2 = t2 * t2 * (3 - 2 * t2); rep['mouth_bottom_t'] = round((eye_z - mouth_bot) / face_h, 3)
    out = co.copy(); out[:, 0] = cx + (co[:, 0] - cx) * xfac; out[:, 2] = co[:, 2] - chin_len * face_h * fw * s2
    if nose:
        nose_z = eye_z - 0.38 * face_h; g = np.exp(-(((co[:, 0] - cx) / (0.22 * face_h)) ** 2 + ((co[:, 2] - nose_z) / (0.16 * face_h)) ** 2)); out[:, 1] += nose * face_h * g * fw
    me.vertices.foreach_set('co', out.astype(np.float32).reshape(-1)); me.update()
    try: bpy.context.view_layer.objects.active = body; bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e: rep['face_normals_note'] = repr(e)[:100]
    rep['face'] = dict(f); rep['face_height_m'] = round(face_h, 4); rep['face_max_move_m'] = round(float(np.abs(out - co).max()), 4)


def inflate(body, arm, shape, rep):
    """radial inflation of the joined body mesh about each humanoid bone (see the module docstring)"""
    fat = float(shape.get('fat', 0)); belly = float(shape.get('belly', 0))
    if fat == 0 and belly == 0: return
    def group_k(name):
        n = name.replace('mixamorig:', '')
        if n.startswith('Head') or n.startswith('LeftEye') or n.startswith('RightEye'): return 0.0
        if n.startswith('Neck'): return fat * float(shape.get('neck', 0.3))
        if 'Hand' in n and ('Thumb' in n or 'Index' in n or 'Middle' in n or 'Ring' in n or 'Pinky' in n): return fat * 0.25
        if n.endswith('Hand') or 'Foot' in n or 'Toe' in n: return fat * 0.25
        if 'Arm' in n or 'Shoulder' in n: return fat * float(shape.get('arms', 0.8))
        if 'Leg' in n or 'UpLeg' in n: return fat * float(shape.get('legs', 0.9))
        return fat
    bones = {b.name: b for b in arm.data.bones}; humanoid = {n for n in bones if n.startswith('mixamorig:')}
    def host(name):      # the nearest humanoid ancestor of a bone (spring and hair joints ride on it)
        b = bones.get(name)
        while b is not None and b.name not in humanoid: b = b.parent
        return b.name if b is not None else None
    vg_host = {g.index: host(g.name) for g in body.vertex_groups}
    torso = {'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'}
    me = body.data; n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3).astype(np.float64)
    disp = np.zeros_like(co); wsum = np.zeros(n); wtorso = np.zeros(n); cy = np.zeros(n)
    axes = {nm: (np.array(bones[nm].head_local, np.float64), np.array(bones[nm].tail_local, np.float64)) for nm in humanoid}
    for vi, v in enumerate(me.vertices):
        for g in v.groups:
            hn = vg_host.get(g.group)
            if hn is None or g.weight <= 0: continue
            k = group_k(hn)
            if k == 0 and hn not in torso: wsum[vi] += g.weight; continue
            h, t = axes[hn]; d = t - h; dl = float(d @ d)
            u = (co[vi] - h); proj = h + d * ((u @ d) / dl) if dl > 1e-12 else h; r = co[vi] - proj
            disp[vi] += g.weight * k * r; wsum[vi] += g.weight
            if hn in torso: wtorso[vi] += g.weight; cy[vi] += g.weight * proj[1]
    if belly:
        front = np.where(wtorso > 0, co[:, 1] - cy / np.maximum(wtorso, 1e-6), 0.0); disp[:, 1] += belly * wtorso * np.maximum(front, 0.0) * 1.0
    co2 = (co + disp).astype(np.float32); me.vertices.foreach_set('co', co2.reshape(-1)); me.update()
    try: bpy.context.view_layer.objects.active = body; bpy.ops.mesh.customdata_custom_splitnormals_clear()      # the imported custom normals no longer match the moved vertices
    except Exception as e: rep['shape_normals_note'] = repr(e)[:100]
    rep['shape'] = {k: v for k, v in shape.items()}; rep['shape_max_move_m'] = round(float(np.abs(disp).max()), 4)
