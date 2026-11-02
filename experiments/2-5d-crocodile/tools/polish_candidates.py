"""Polish candidates for the 2- and 3-cell 2.5D pictures, made from the pictures the manifest uses (never modified).

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/polish_candidates.py [--root DIR]

Writes <species>/candidate/<same file name> for every entry in EDITS; the game draws them with ?art=candidate.

  extend  0°/180°: the far part (higher on screen) ends in its own belly / feet / rounded bottom just above the near part,
          so every joint reads as a new block. One row band just above that bottom is repeated, which moves the bottom
          down behind the near part; face, top and pattern above the band are untouched. The row count is the smallest
          that hides >= 99% of the moved bottom behind the near part's opaque pixels (one cell = 362 px at scale 1.2).
  lid     removes the brown oval cut face on top of a body / tail block, filled from the surrounding colour.
  legs    90° head: the two legs of the same species' 90° tail, put under the head block (behind it) so the
          side view stands on four legs like the 0°/180° views.
Every written picture also gets its semi-transparent edge recoloured from the nearest opaque pixel (no dark/red halo).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

CELL = round(512 / 1.2 * np.sin(np.radians(58)))  # one cell of floor depth on screen, in picture px (scale 1.2)
HIDDEN = 0.99

# far part key -> the near part that covers its moved bottom (one cell lower on screen)
THREE = {'head_180': 'body_180', 'body_000': 'head_000', 'body_180': 'tail_180', 'tail_000': 'body_000'}
TWO = {'tail_000': 'head_000'}
EDITS = {
    'snake': {'head_180': {'extend': 500}, 'body_000': {'extend': 535}, 'body_180': {'extend': 535}, 'tail_000': {'extend': 535}},
    'caterpillar': {'head_180': {'extend': 590}, 'body_000': {'extend': 530}, 'body_180': {'extend': 530}, 'tail_000': {'extend': 530}},
    'dachshund': {'head_180': {'extend': 588}, 'body_000': {'extend': 560, 'lid': True}, 'body_180': {'extend': 560, 'lid': True},
                  'tail_000': {'extend': 530, 'lid': True}},
    # 2-cell head_180 is left as is: its bottom already sits >= 99% behind the 180° tail
    # husky: the band sits above the white cut face (from row ~430), which then goes behind the head like the legs
    **{sp: {'tail_000': {'extend': band}, 'head_090': {'legs': True}}
       for sp, band in (('cow', 545), ('pig', 545), ('fox', 545), ('tiger', 545), ('husky', 420))},
}


def manifest_file(root, sp, key):
    part, deg = key.split('_')
    e = json.load(open(f'{root}/{sp}/{sp}.sprites.json'))['parts'][part]['drawn'][str(int(deg))]
    return e if isinstance(e, str) else e['file']


def load(root, sp, key):
    return np.array(Image.open(f'{root}/{sp}/{manifest_file(root, sp, key)}').convert('RGBA'))


def opaque(a):
    return a[:, :, 3] > 127


def extend(a, band, near):
    """Repeat the row band at `band` k times; k = smallest that hides the moved bottom behind `near` (one cell lower)."""
    f, n = opaque(a), np.zeros_like(opaque(near))
    n[CELL:] = opaque(near)[:-CELL]
    lower = f[band + 1:]
    best = (0.0, 0)
    for k in range(0, 1024 - CELL):
        h = 1024 - band - 1 - k
        if lower[h:].any():
            break  # would push opaque pixels off the canvas
        moved = np.zeros_like(f)
        moved[band + 1 + k:] = lower[:h]
        share = (moved & n).sum() / max(1, moved.sum())
        if share > best[0]:
            best = (share, k)
        if share >= HIDDEN:
            break
    share, k = best
    row = a[band - 2:band + 3].astype(float).mean(0).round().astype(np.uint8)
    out = np.zeros_like(a)
    out[:band + 1] = a[:band + 1]
    out[band + 1:band + 1 + k] = row
    out[band + 1 + k:] = a[band + 1:1024 - k]
    return out, k, share


def fill_from_surroundings(a, hole):
    """Harmonic fill of `hole` (RGB) from the opaque pixels around it."""
    known = opaque(a) & ~hole
    idx = ndimage.distance_transform_edt(~known, return_indices=True)[1]
    rgb = a[:, :, :3].astype(float)[idx[0], idx[1]]
    k = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], float)
    for _ in range(600):
        avg = np.stack([ndimage.convolve(rgb[:, :, c], k, mode='nearest') / 4 for c in range(3)], -1)
        rgb[hole] = avg[hole]
    out = a.copy()
    out[hole, :3] = rgb[hole].round().astype(np.uint8)
    return out


def remove_lid(a):
    r, g, b = (a[:, :, i].astype(int) for i in range(3))
    brown = opaque(a) & (r - b > 50) & (r < 180) & (g < 115)
    brown[460:] = False  # the lid is the top face only
    lab, n = ndimage.label(brown)
    if not n:
        return a, 0
    big = lab == (1 + np.argmax(ndimage.sum(brown, lab, range(1, n + 1))))
    hole = ndimage.binary_dilation(ndimage.binary_fill_holes(big), iterations=10) & (a[:, :, 3] > 0)
    return fill_from_surroundings(a, hole), int(hole.sum())


def leg_strip(tail):
    """The legs of a 90° tail: rows below the block (where the outline splits into separate runs), as two pieces."""
    f = opaque(tail)
    ys = np.where(f.any(1))[0]
    y = ys[-1] - 8  # a few rows up: the very lowest row can be a single hoof
    while y > ys[0] and ndimage.label(f[y])[1] >= 2:
        y -= 1
    top = y + 1
    lab, n = ndimage.label(f[top:])
    pieces = sorted(range(1, n + 1), key=lambda i: -(lab == i).sum())[:2]
    return top, [(lab == i) for i in sorted(pieces, key=lambda i: np.where(lab == i)[1].mean())]


def add_legs(head, tail):
    """Two tail legs under the head block, same inset from the block's ends as on the tail, drawn behind the head."""
    top, legs = leg_strip(tail)
    th = tail[top:]
    hf, tf = opaque(head), opaque(tail)
    tx = np.where(tf[top - 1])[0]  # tail block ends just above its legs
    hy = np.where(hf.any(1))[0][-1]
    hx = np.where(hf[hy - 12])[0]  # head block ends near its bottom
    under = np.zeros_like(head)
    for leg, (t_end, h_end) in zip(legs, ((tx[0], hx[0]), (tx[-1], hx[-1]))):
        xs = np.where(leg.any(0))[0]
        dx = h_end - t_end
        src = leg[:, xs[0]:xs[-1] + 1]
        dst = under[top:, xs[0] + dx:xs[-1] + 1 + dx]
        dst[src] = th[:, xs[0]:xs[-1] + 1][src]
    alpha = head[:, :, 3:4].astype(float) / 255  # head over legs
    comp = under.astype(float) * (1 - alpha) + head.astype(float) * alpha
    comp[:, :, 3] = np.maximum(under[:, :, 3], head[:, :, 3])
    return comp.round().astype(np.uint8), top, hy


def defringe(a):
    edge = (a[:, :, 3] > 0) & (a[:, :, 3] < 250)
    solid = a[:, :, 3] >= 250  # approved pictures are 250-254 inside, not 255
    idx = ndimage.distance_transform_edt(~solid, return_indices=True)[1]
    out = a.copy()
    out[edge, :3] = a[idx[0][edge], idx[1][edge], :3]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='experiments/2-5d-crocodile/assets')
    root = ap.parse_args().root
    for sp, edits in EDITS.items():
        near_of = THREE if 'body_000' in edits else TWO
        os.makedirs(f'{root}/{sp}/candidate', exist_ok=True)
        for key, todo in edits.items():
            a, notes = load(root, sp, key), []
            if todo.get('lid'):
                a, px = remove_lid(a)
                notes.append(f'lid {px}px')
            if 'extend' in todo:
                a, k, share = extend(a, todo['extend'], load(root, sp, near_of[key]))
                notes.append(f'extend band {todo["extend"]} +{k} rows, hidden {share:.3f}{"" if share >= HIDDEN else "  << NOT HIDDEN"}')
            if todo.get('legs'):
                a, top, hy = add_legs(a, load(root, sp, 'tail_090'))
                notes.append(f'legs from tail_090 rows {top}+, head bottom was {hy}')
            a = defringe(a)
            f = opaque(a)
            ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
            name = os.path.basename(manifest_file(root, sp, key))
            Image.fromarray(a).save(f'{root}/{sp}/candidate/{name}')
            print(f'{sp:11s} {key}  bbox y{ys[0]}-{ys[-1]} x{xs[0]}-{xs[-1]}  ' + '; '.join(notes))


if __name__ == '__main__':
    main()
