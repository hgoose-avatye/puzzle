"""Build the dachshund candidate parts from the v2 part sheets so the three cards join into one long dog.

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/dachshund_import.py [--root DIR] [--body-width 0.9] [--scale 1.2]

Input  assets/dachshund/received-v2/sheet_2.png (0°: head, body, tail), sheet_4.png (180°), sheet_3.png (side: head
       facing right = 90°, body, tail facing left = mirrored for 90°). The sheets are not modified.
Output assets/dachshund/candidate/dachshund_<part>_<deg>.png in the SPRITES.md frame (1024, cell 512 px at scale 1,
       floor centre (512, 640)), candidate/dachshund.sprites.json (standard frame, drawn 0/90/180, 270 mirrored),
       candidate/extend.json = {} (no folded extensions) and candidate/preview.png (the three headings composited
       at game geometry). The game draws these with ?art=candidate.

How the parts are made to join (the "one silhouette first" design, then split per cell):
  size      0°/180°: the body block is BODY_WIDTH cells wide, tail block scaled to the same width (the head keeps the
            sheet's proportion). 90°: the body block is exactly one cell long; head and tail use the same scale.
  place     0°/180°: lowest pixel (feet / block bottom) on the cell's front edge, block centred on x = 512.
            90°: block underside (above the legs) at 0.37 cell in front of the floor centre, block centred.
  flatten   a block end that meets a neighbour is cut flat and filled with the block's own cross-section (its middle
            row / column, saddle stripe included) up to the cell boundary (+ a small overlap), so the stripe and the
            body run on into the next card. Flattened: body 0° top (toward the tail; never exposed in a turn because
            the tail turns after the body), body 180° top and tail 180° top (toward the head / body), body 90° both
            ends, tail 90° head-side end. Outer ends (head crown, tail curl, muzzle) stay rounded.
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SIZE, CELL, ANCHOR = 1024, 512, (512, 640)
SIN58 = math.sin(math.radians(58))
HERE = os.path.dirname(os.path.abspath(__file__))
FULL = 0.97  # a row / column this share of the block's largest extent counts as the straight part of the block
FEET_FORWARD = 0.37  # 90°: block underside this many cells in front of the floor centre
OVERLAP = 0.06  # cells a flattened end runs past the cell boundary under the neighbour


def opaque(a):
    return a[:, :, 3] > 127


def parts_of(sheet):
    """The three blobs of a sheet, left to right, each cut out with its own alpha only."""
    a = np.array(Image.open(sheet).convert('RGBA'))
    m = opaque(a)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = [k + 1 for k in np.argsort(sizes)[::-1] if sizes[k] > 0.05 * sizes.max()]
    out = []
    for k in sorted(big, key=lambda k: np.where(lab == k)[1].mean()):
        ys, xs = np.where(lab == k)
        crop = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        crop[:, :, 3] = np.where(lab[ys.min():ys.max() + 1, xs.min():xs.max() + 1] == k, crop[:, :, 3], 0)
        out.append(crop)
    if len(out) != 3:
        raise SystemExit(f'{sheet}: expected 3 parts, found {len(out)}')
    return out


def resize(img, sx, sy=None):
    """Lanczos resize (premultiplied so edges keep their colour)."""
    sy = sx if sy is None else sy
    pre = img.astype(float)
    pre[:, :, :3] *= pre[:, :, 3:4] / 255
    im = Image.fromarray(pre.round().astype(np.uint8)).resize((max(1, round(img.shape[1] * sx)), max(1, round(img.shape[0] * sy))), Image.LANCZOS)
    o = np.array(im).astype(float)
    o[:, :, :3] = np.clip(o[:, :, :3] / np.maximum(o[:, :, 3:4] / 255, 1e-3), 0, 255)
    return o.round().astype(np.uint8)


def leg_top(img):
    """First row of the legs: below it the outline splits into separate runs."""
    f = opaque(img)
    ys = np.where(f.any(1))[0]
    y = ys[-1] - 6
    while y > ys[0] and ndimage.label(f[y])[1] >= 2:
        y -= 1
    return y + 1


def place(img, cx, row, y):
    """img in the standard frame with its column cx at x = 512 and its row `row` at frame row y."""
    frame = np.zeros((SIZE, SIZE, 4), np.uint8)
    x0, y0 = round(ANCHOR[0] - cx), round(y - row)
    h, w = img.shape[:2]
    frame[y0:y0 + h, x0:x0 + w] = img
    return frame


def flatten_top(frame, cell_top):
    """Replace the rounded top cap of the block by its full-width cross-section, up to the cell's back edge."""
    f = opaque(frame)
    widths = f.sum(1)
    full = np.where(widths >= FULL * widths.max())[0]
    y_full = full[0]
    ref = frame[y_full + 8:y_full + 24].astype(float).mean(0).round().astype(np.uint8)
    top = min(np.where(f.any(1))[0][0], int(cell_top))
    out = frame.copy()
    out[top:y_full + 8] = ref
    out[:top] = 0
    return out


def flatten_side(frame, side, x_cut, rows, extrude=False):
    """Cut the block (rows `rows`, legs excluded) flat at x_cut and fill up to it with its middle column; with
    `extrude` the whole straight part of the block is that column too, so the stripe's edge is one straight line
    across every card (the sheet's saddle patch has a rounded front edge that would repeat at each join)."""
    f = opaque(frame)
    r0, r1 = rows
    heights = f[r0:r1].sum(0)
    full = np.where(heights >= FULL * heights.max())[0]
    xc = (full[0] + full[-1]) // 2
    ref = frame[r0:r1, xc - 8:xc + 8].astype(float).mean(1).round().astype(np.uint8)
    out = frame.copy()
    x_cut = int(round(x_cut))
    if side == 'right':
        x_from = full[0] + 8 if extrude else full[-1] - 8
        out[:, x_from:] = 0
        out[r0:r1, x_from:x_cut] = ref[:, None, :]
    else:
        x_to = full[-1] - 8 if extrude else full[0] + 8
        out[:, :x_to] = 0
        out[r0:r1, x_cut:x_to] = ref[:, None, :]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.join(HERE, '..', 'assets', 'dachshund'))
    ap.add_argument('--body-width', type=float, default=0.9, help='body block width in cells (0°/180°)')
    ap.add_argument('--scale', type=float, default=1.2, help='manifest scale: one cell is 512/scale picture px')
    args = ap.parse_args()
    root, scale = args.root, args.scale
    cell = CELL / scale  # one cell in picture px at this manifest scale
    depth = cell * SIN58
    ax, ay = ANCHOR
    front, back = ay + depth / 2, ay - depth / 2
    out_dir = os.path.join(root, 'candidate')
    os.makedirs(out_dir, exist_ok=True)
    pics = {}

    # 0° and 180°: stacked along the screen's vertical
    for sheet, deg in (('sheet_2.png', 0), ('sheet_4.png', 180)):
        head, body, tail = parts_of(os.path.join(root, 'received-v2', sheet))
        s = args.body_width * cell / body.shape[1]
        for name, img in (('head', head), ('body', body), ('tail', tail)):
            im = resize(img, s)
            if name == 'tail':  # same block width as the body, so the joined silhouette has straight sides
                f = opaque(im)
                w = f.sum(1).max()
                im = resize(im, (args.body_width * cell) / w, 1.0)
            f = opaque(im)
            xs = np.where(f.any(0))[0]
            frame = place(im, (xs[0] + xs[-1]) / 2, np.where(f.any(1))[0][-1], front)
            if (name, deg) in (('body', 0), ('body', 180), ('tail', 180)):
                frame = flatten_top(frame, back)
            pics[f'{name}_{deg:03d}'] = frame

    # 90°: side by side. The body loaf is exactly one cell long and is ALSO the tail block's body (same cross-section,
    # tone and stripe height), with the sheet tail's curl and hind legs put on it; the head keeps the sheet's picture.
    head, body, tail = parts_of(os.path.join(root, 'received-v2', 'sheet_3.png'))
    tail = tail[:, ::-1]  # the sheet's tail faces left; 90° faces right
    s = cell / body.shape[1]
    underside = ay + FEET_FORWARD * depth

    def placed(img, row):
        f = opaque(img)
        xs = np.where(f.any(0))[0]
        return place(img, (xs[0] + xs[-1]) / 2, row, underside)

    loaf = placed(resize(body, s), resize(body, s).shape[0])
    rows = (np.where(opaque(loaf).any(1))[0][0], int(underside))
    pics['body_090'] = flatten_side(flatten_side(loaf, 'right', ax + cell / 2 + OVERLAP * cell, rows, extrude=True), 'left', ax - cell / 2, rows)
    head_im = resize(head, s)
    pics['head_090'] = placed(head_im, leg_top(head_im))
    tail_im = resize(tail, s)
    t = placed(tail_im, leg_top(tail_im))
    tf = opaque(t)
    # straight part of each block: rows where the loaf / the tail block are at full width
    def straight(f):
        w = f.sum(1)
        return np.where(w >= 0.9 * w.max())[0]
    lo_rows, t_rows = straight(opaque(loaf)), straight(tf[:int(underside)])
    lo_x0, t_x0 = np.where(opaque(loaf)[lo_rows[0]])[0][0], np.where(tf[t_rows[0]])[0][0]
    dy, dx = lo_rows[0] - t_rows[0], lo_x0 - t_x0
    r, g, b = (t[:, :, i].astype(int) for i in range(3))
    brown = tf & (r - b > 50) & (r < 190) & (g < 120)
    curl = brown & (np.arange(SIZE)[:, None] < t_rows[0] + 30) & (np.arange(SIZE)[None, :] < ax)
    legs = tf & (np.arange(SIZE)[:, None] >= int(underside))
    tail_frame = flatten_side(loaf, 'right', ax + cell / 2 + OVERLAP * cell, rows, extrude=True)
    for mask, (sy, sx) in ((legs, (0, dx)), (curl, (dy, dx))):
        src = np.where(mask[:, :, None], t, 0)
        moved = np.roll(np.roll(src, sy, 0), sx, 1)
        over = moved[:, :, 3] > 127
        under = ~opaque(tail_frame) if mask is legs else np.ones_like(over)
        put = over & under
        tail_frame[put] = moved[put]
    pics['tail_090'] = tail_frame

    for key, frame in pics.items():
        f = opaque(frame)
        ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
        Image.fromarray(frame).save(os.path.join(out_dir, f'dachshund_{key}.png'))
        print(f'dachshund_{key}.png: x{xs[0]}-{xs[-1]} ({(xs[-1] - xs[0]) / cell:.2f} cell) y{ys[0]}-{ys[-1]}')

    manifest = {
        'species': 'dachshund',
        'note': 'candidate: parts cut from received-v2 sheets by tools/dachshund_import.py into the standard frame, ends flattened to join into one dog; 270 mirrors 90, diagonals use the nearest',
        'frame': {'size': SIZE, 'cellPx': CELL, 'anchor': list(ANCHOR)},
        'scale': scale,
        'tuck': 0,
        'parts': {part: {'drawn': {str(d): f'dachshund_{part}_{d:03d}.png' for d in (0, 90, 180)}} for part in ('head', 'body', 'tail')},
    }
    with open(os.path.join(out_dir, 'dachshund.sprites.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    with open(os.path.join(out_dir, 'extend.json'), 'w') as fh:
        fh.write('{}\n')

    # preview: the three headings composited at game geometry (draw order as the game: far first; at 90° head, body, tail)
    views = {
        '000': [('tail_000', 0, -2 * depth), ('body_000', 0, -depth), ('head_000', 0, 0)],
        '180': [('head_180', 0, -2 * depth), ('body_180', 0, -depth), ('tail_180', 0, 0)],
        '090': [('head_090', cell, 0), ('body_090', 0, 0), ('tail_090', -cell, 0)],
    }
    tiles = []
    for order in views.values():
        canvas = np.zeros((SIZE + 2 * int(2 * depth) + 100, SIZE + 2 * int(cell) + 100, 4), float)
        for key, dx, dy in order:
            img = pics[key].astype(float)
            al = img[:, :, 3:4] / 255
            x0, y0 = int(canvas.shape[1] / 2 - SIZE / 2 + dx), int(canvas.shape[0] / 2 - SIZE / 2 + dy)
            sl = canvas[y0:y0 + SIZE, x0:x0 + SIZE]
            sl[:, :, :3] = img[:, :, :3] * al + sl[:, :, :3] * (1 - al)
            sl[:, :, 3:4] = np.maximum(sl[:, :, 3:4], img[:, :, 3:4])
        ys, xs = np.where(canvas[:, :, 3] > 10)
        tiles.append(Image.fromarray(canvas.round().astype(np.uint8)).crop((xs.min() - 20, ys.min() - 20, xs.max() + 20, ys.max() + 20)))
    h = max(t.height for t in tiles)
    sheet = Image.new('RGBA', (sum(t.width for t in tiles) + 40 * (len(tiles) + 1), h + 40), (90, 140, 90, 255))
    x = 40
    for t in tiles:
        sheet.alpha_composite(t, (x, 20 + (h - t.height) // 2))
        x += t.width + 40
    sheet.save(os.path.join(out_dir, 'preview.png'))
    print('preview.png written')


if __name__ == '__main__':
    main()
