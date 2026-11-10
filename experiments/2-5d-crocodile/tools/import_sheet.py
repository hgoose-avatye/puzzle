"""Replace a species' pictures with one redrawn character sheet (2026-11-09, docs/art-reference/character-grids/PROMPTS.md).

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/import_sheet.py <manifest.sprites.json> <sheet.png|webp>

The sheet has one row per part (head first; one row for a 1-cell animal) and three columns: facing the viewer (0°),
facing right (90°), facing away (180°), on a transparent background. Each view is found as one opaque blob, then fitted
into the box of the picture it replaces (same width, same bottom, same middle), so the manifest's anchors and offsets
still hold. A 270° entry gets the mirrored 90° view; 45°/135° entries are dropped (the renderer mirrors or takes the
nearest). Pictures whose bottom was moved down behind the near part (`extend` in the manifest, or an `extend` edit in
tools/polish_candidates.py) are moved again with the same band (a band near the bottom moves the least picture). Writes <manifest dir>/v3/<species>_<part>_<angle>.png
and points the manifest at them; the sheet is copied to <manifest dir>/received_v3/. Nothing else is touched.
"""
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polish_candidates as P  # noqa: E402

ANGLE_COL = {0: 0, 90: 1, 180: 2}


def views(sheet):
    """The sheet's blobs as rows (top to bottom) of crops (left to right)."""
    a = np.array(sheet)[:, :, 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=12))
    boxes = [s for i, s in enumerate(ndimage.find_objects(lab)) if (lab[s] == i + 1).sum() > 0.01 * a.size]
    boxes.sort(key=lambda s: (s[0].start + s[0].stop) / 2)
    rows, gap = [], sheet.height * 0.15
    for s in boxes:
        cy = (s[0].start + s[0].stop) / 2
        if rows and cy - rows[-1][-1][0] < gap:
            rows[-1].append((cy, s))
        else:
            rows.append([(cy, s)])
    out = []
    for r in rows:
        r.sort(key=lambda t: t[1][1].start)
        crops = []
        for _, s in r:
            c = sheet.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
            crops.append(c.crop(c.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()))
        out.append(crops)
    return out


def box(img):
    return img.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()


def fit(view, ref_box, size):
    w = ref_box[2] - ref_box[0]
    s = w / view.width
    v = view.resize((round(view.width * s), round(view.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.alpha_composite(v, ((ref_box[0] + ref_box[2]) // 2 - v.width // 2, ref_box[3] - v.height))
    return out


def main():
    manifest_path, sheet_path = sys.argv[1], sys.argv[2]
    root = os.path.dirname(manifest_path)
    m = json.load(open(manifest_path))
    sp = m['species']
    parts = list(m['parts'].keys())
    rows = views(Image.open(sheet_path).convert('RGBA'))
    if len(rows) != len(parts) or any(len(r) != 3 for r in rows):
        sys.exit(f'{sp}: sheet has rows {[len(r) for r in rows]}, expected {len(parts)} rows of 3')
    os.makedirs(f'{root}/v3', exist_ok=True)
    os.makedirs(f'{root}/received_v3', exist_ok=True)
    shutil.copy(sheet_path, f'{root}/received_v3/{sp}_sheet{os.path.splitext(sheet_path)[1]}')

    old_extend = m.get('extend', {})
    key_re = re.compile(r'_(single|head|body|tail)_(\d{3})\.png$')
    bands = {}  # part_angle -> band row
    for name, e in old_extend.items():
        k = key_re.search(name)
        if k:
            bands[f'{k.group(1)}_{k.group(2)}'] = (e['band'], e['rows'])
    for key, todo in P.EDITS.get(sp, {}).items():
        if 'extend' in todo and key not in bands:
            bands[key] = (todo['extend'], 0)

    pics, files = {}, {}
    for r, part in enumerate(parts):
        drawn = m['parts'][part]['drawn']
        for ang in list(drawn.keys()):
            a = int(ang)
            e = drawn[ang]
            if a in (45, 135):
                del drawn[ang]
                continue
            fn = e if isinstance(e, str) else e['file']
            old = Image.open(f'{root}/{fn}').convert('RGBA')
            ref = list(box(old))
            key = f'{part}_{a:03d}'
            old_name = os.path.basename(fn)
            if old_name in old_extend:
                ref[3] -= old_extend[old_name]['rows']
            view = ImageOps.mirror(rows[r][1]) if a == 270 else rows[r][ANGLE_COL[a]]
            pics[key] = np.array(fit(view, ref, old.size))
            files[key] = (part, ang)

    new_extend = {}
    near_of = P.THREE if len(parts) >= 3 else P.TWO
    for key, (band, _) in bands.items():
        near = near_of.get(key)
        if key not in pics or near not in pics:
            continue
        a, k, share = P.extend(pics[key].copy(), band, pics[near])
        pics[key] = a
        new_extend[f'{sp}_{key}.png'] = {'band': band, 'rows': int(k)}
        print(f'{sp} {key}: extend band {band} +{k} rows, hidden {share:.3f}{"" if share >= P.HIDDEN else "  << NOT HIDDEN"}')

    for key, a in pics.items():
        part, ang = files[key]
        name = f'{sp}_{key}.png'
        Image.fromarray(P.defringe(a)).save(f'{root}/v3/{name}')
        e = m['parts'][part]['drawn'][ang]
        if isinstance(e, str):
            m['parts'][part]['drawn'][ang] = f'v3/{name}'
        else:
            e['file'] = f'v3/{name}'
    if new_extend or old_extend:
        m['extend'] = new_extend
    m['note'] = (m.get('note', '') + ' 2026-11-09: v3/ = redrawn sheet (received_v3/, tools/import_sheet.py), each view fitted into the box of the picture it replaced.').strip()
    json.dump(m, open(manifest_path, 'w'), indent=1, ensure_ascii=False)
    print(f'{sp}: {len(pics)} pictures -> {root}/v3/')


if __name__ == '__main__':
    main()
