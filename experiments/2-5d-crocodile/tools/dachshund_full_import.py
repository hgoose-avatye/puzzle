"""Split the whole-body dachshund pictures (one per heading, flat green ground) into head / body / tail cards.

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/dachshund_full_import.py [--root DIR] [--body-width 0.9] [--scale 1.2]

Input  assets/dachshund/received-v3/dachshund_full_000.png (faces the camera, head at the bottom), _090.png (faces
       right), _180.png (faces away, head at the top); one dog each on a flat #00FF00 ground. Not modified.
Output assets/dachshund/candidate/dachshund_<part>_<deg>.png in the SPRITES.md frame (1024×1024, cell 512 px at
       scale 1, floor centre (512, 640)), candidate/dachshund.sprites.json (standard frame, drawn 0/90/180, 270
       mirrored), candidate/extend.json = {} and candidate/preview.png (the three headings reassembled at game geometry).

Method: the dog is keyed off the green, scaled so the body is BODY_WIDTH cells wide (0°/180°; the 90° picture so the
dog from rump to face is 3 cells long), put on the three cells (0°/180°: front feet / hind feet on the near cell's front
edge; 90°: feet 0.45 cell in front of the floor centre), then cut into cards along straight lines in screen space:
  0°    head = rows from the crown down (the head is drawn over the body, so its whole silhouette stays with it);
        body = rows between the tail/body floor boundary and the crown; tail = rows above that boundary.
  180°  cuts at the two floor boundaries (tail nearest, head farthest).
  90°   head = columns from the back of the ear to the muzzle; body = columns back to the tail/body floor boundary;
        tail = the rest (rump, hind legs, curl).
Reassembled in place the three cards reproduce the picture exactly; in a turn each cut end sits behind the
neighbouring card that has moved to the corner (SPRITES.md draw order, placement C).
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
FEET_FORWARD = 0.45  # 90°: feet this many cells in front of the floor centre
NOSE_OVER = 0.12  # 90°: how far the nose may stick out past the head cell's front edge, in cells


def key_green(rgb):
    """RGBA float (alpha 0..1): alpha from how far a pixel is from the pure green ground, colour un-blended."""
    rgb = rgb.astype(float)
    g_excess = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    alpha = np.clip(1 - (g_excess - 20) / 140, 0, 1)
    core = ndimage.binary_fill_holes(alpha > 0.98)
    alpha = np.where(core, 1.0, alpha)
    alpha *= ndimage.binary_dilation(core, iterations=3)
    green = np.array([0.0, 255.0, 0.0])
    k = np.maximum(alpha, 1e-3)[:, :, None]
    colour = np.where(core[:, :, None], rgb, np.clip((rgb - (1 - k) * green) / k, 0, 255))
    return np.dstack([colour, alpha])


def resize(img, s):
    return resize_xy(img, s, s)


def resize_xy(img, sx, sy):
    pre = img.copy()
    pre[:, :, :3] *= pre[:, :, 3:4]
    pre[:, :, 3] *= 255
    im = Image.fromarray(pre.round().astype(np.uint8)).resize((round(img.shape[1] * sx), round(img.shape[0] * sy)), Image.LANCZOS)
    o = np.array(im).astype(float)
    a = o[:, :, 3] / 255
    rgb = np.clip(o[:, :, :3] / np.maximum(a, 1e-3)[:, :, None], 0, 255)
    return np.dstack([rgb, a])


def to8(img):
    out = img.copy()
    out[:, :, 3] *= 255
    return out.round().astype(np.uint8)


def window(img, cx, cy, rows=None, cols=None):
    """1024 frame with picture point (cx, cy) at the anchor; only rows / cols in the given half-open ranges kept."""
    frame = np.zeros((SIZE, SIZE, 4), float)
    x0, y0 = int(round(ANCHOR[0] - cx)), int(round(ANCHOR[1] - cy))
    h, w = img.shape[:2]
    keep = np.ones((h, w), bool)
    if rows is not None:
        keep[:max(0, rows[0])] = False
        keep[max(0, rows[1]):] = False
    if cols is not None:
        keep[:, :max(0, cols[0])] = False
        keep[:, max(0, cols[1]):] = False
    src = np.where(keep[:, :, None], img, 0)
    sy0, sx0 = max(0, -y0), max(0, -x0)
    sy1, sx1 = min(h, SIZE - y0), min(w, SIZE - x0)
    if sy1 > sy0 and sx1 > sx0:
        frame[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = src[sy0:sy1, sx0:sx1]
    return frame


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.join(HERE, '..', 'assets', 'dachshund'))
    ap.add_argument('--body-width', type=float, default=0.8, help='body width in cells; 0.8 puts the 3-cell dog on its three cells')
    ap.add_argument('--scale', type=float, default=1.2)
    args = ap.parse_args()
    root = args.root
    cell = CELL / args.scale
    depth = cell * SIN58
    out_dir = os.path.join(root, 'candidate')
    os.makedirs(out_dir, exist_ok=True)
    src = {deg: key_green(np.array(Image.open(os.path.join(root, 'received-v3', f'dachshund_full_{deg:03d}.png')).convert('RGB'))) for deg in (0, 90, 180)}
    pics = {}
    report = []

    # ---- 0° and 180°: body width -> BODY_WIDTH cells; the near cell's feet on its front edge
    for deg in (0, 180):
        img = src[deg]
        f = img[:, :, 3] > 0.5
        widths = f.sum(1)
        ys = np.where(f.any(1))[0]
        mid = ys[0] + (ys[-1] - ys[0]) // 2
        body_w = np.median(widths[mid - 150:mid + 150])
        sx = args.body_width * cell / body_w
        if deg == 0:
            img = resize(img, sx)
            dog_height = (ys[-1] - ys[0]) * sx
        else:
            # the 180° picture is drawn longer for its width than the 0° one: same body width, same overall length
            sy = dog_height / (ys[-1] - ys[0])
            img = resize(img, sx) if abs(sy / sx - 1) < 0.03 else resize_xy(img, sx, sy)
            report.append(f'180°: scaled x {sx:.3f}, y {sy:.3f} (height matched to the 0° picture)')
        f = img[:, :, 3] > 0.5
        widths = f.sum(1)
        ys = np.where(f.any(1))[0]
        mid = ys[0] + (ys[-1] - ys[0]) // 2
        xs = np.where(f[mid])[0]
        cx = (xs[0] + xs[-1]) / 2  # body centre line
        near_cy = ys[-1] - depth / 2  # near cell's floor centre: feet on its front edge
        cells = [near_cy, near_cy - depth, near_cy - 2 * depth]  # near -> far
        if deg == 0:
            # head nearest. Crown: first row (from the top) in the lower part where the outline is wider than the body (ears)
            lower = np.arange(len(widths)) > mid
            crown = np.where(lower & (widths > 1.15 * args.body_width * cell))[0][0]
            b_tail = cells[1] - depth / 2  # floor boundary between body (cell 1) and tail (cell 2)
            pics['head_000'] = window(img, cx, cells[0], rows=(crown, len(widths)))
            pics['body_000'] = window(img, cx, cells[1], rows=(int(b_tail), crown))
            pics['tail_000'] = window(img, cx, cells[2], rows=(0, int(b_tail)))
            report.append(f'0°: dog {ys[-1] - ys[0]} px tall = {(ys[-1] - ys[0]) / depth:.2f} cell depths (3 cells + body height + curl); crown row {crown}, far end over the tail cell\'s back edge by {(cells[2] - depth / 2 - ys[0]) / depth:.2f} cells')
        else:
            b1 = cells[0] - depth / 2  # tail (near) / body
            b2 = cells[1] - depth / 2  # body / head (far)
            pics['tail_180'] = window(img, cx, cells[0], rows=(int(b1), len(widths)))
            pics['body_180'] = window(img, cx, cells[1], rows=(int(b2), int(b1)))
            pics['head_180'] = window(img, cx, cells[2], rows=(0, int(b2)))
            report.append(f'180°: dog {ys[-1] - ys[0]} px tall = {(ys[-1] - ys[0]) / depth:.2f} cell depths; head end over the head cell\'s back edge by {(cells[2] - depth / 2 - ys[0]) / depth:.2f} cells')

    # ---- 90°: rump (without the curl) to the nose = 3 cells + NOSE_OVER
    img = src[90]
    f = img[:, :, 3] > 0.5
    ys = np.where(f.any(1))[0]
    y_mid = ys[0] + (ys[-1] - ys[0]) * 0.6  # below the curl, above the legs
    xs_mid = np.where(f[int(y_mid)])[0]
    rump, nose = xs_mid[0], np.where(f.any(0))[0][-1]
    img = resize(img, (3 + NOSE_OVER) * cell / (nose - rump))
    f = img[:, :, 3] > 0.5
    ys = np.where(f.any(1))[0]
    y_mid = int(ys[0] + (ys[-1] - ys[0]) * 0.6)
    rump = np.where(f[y_mid])[0][0]
    heights = f.sum(0)
    body_h = np.median(heights[rump + int(0.8 * cell):rump + int(1.8 * cell)])
    # back of the ear: first column (from the rump) in the front half that is clearly taller than the body
    front = np.arange(len(heights)) > rump + 1.5 * cell
    ear = np.where(front & (heights > 1.12 * body_h))[0][0]
    tail_cx = rump + cell / 2
    cells = [tail_cx, tail_cx + cell, tail_cx + 2 * cell]  # tail, body, head
    cy = ys[-1] - FEET_FORWARD * depth
    b_tb = cells[0] + cell / 2
    pics['tail_090'] = window(img, cells[0], cy, cols=(0, int(b_tb)))
    pics['body_090'] = window(img, cells[1], cy, cols=(int(b_tb), ear))
    pics['head_090'] = window(img, cells[2], cy, cols=(ear, img.shape[1]))
    report.append(f'90°: body height {body_h / cell:.2f} cell, ear back at {(ear - (cells[2] - cell / 2)) / cell:+.2f} cells from the head cell\'s back edge, nose over the front edge by {(np.where(f.any(0))[0][-1] - (cells[2] + cell / 2)) / cell:.2f} cells')

    for key, frame in pics.items():
        f = frame[:, :, 3] > 0.5
        ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
        Image.fromarray(to8(frame)).save(os.path.join(out_dir, f'dachshund_{key}.png'))
        print(f'dachshund_{key}.png: x{xs[0]}-{xs[-1]} y{ys[0]}-{ys[-1]}')
    for line in report:
        print(line)

    manifest = {
        'species': 'dachshund',
        'note': 'candidate: whole-body pictures (received-v3, one per heading, 58° camera) split per cell by tools/dachshund_full_import.py; 270 mirrors 90, diagonals use the nearest',
        'frame': {'size': SIZE, 'cellPx': CELL, 'anchor': list(ANCHOR)},
        'scale': args.scale,
        'tuck': 0,
        'parts': {part: {'drawn': {str(d): f'dachshund_{part}_{d:03d}.png' for d in (0, 90, 180)}} for part in ('head', 'body', 'tail')},
    }
    # corner pieces (received-v3/dachshund_elbow_{up_right,down_right}.png): the body bent 90° in one cell, arms toward
    # the top / bottom and the right of the screen; keyed and scaled like the straight pictures (arm = body width)
    elbows = {}
    for key, name in (('upRight', 'up_right'), ('downRight', 'down_right')):
        path = os.path.join(root, 'received-v3', f'dachshund_elbow_{name}.png')
        if not os.path.exists(path):
            continue
        img = key_green(np.array(Image.open(path).convert('RGB')))
        f = img[:, :, 3] > 0.5
        ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
        # the vertical arm's width = the body width (columns of the rows away from the horizontal arm)
        vert_rows = range(ys[0], ys[0] + (ys[-1] - ys[0]) // 4) if name == 'up_right' else range(ys[-1] - (ys[-1] - ys[0]) // 4, ys[-1])
        arm_w = np.median([f[y].sum() for y in vert_rows if f[y].any()])
        img = resize(img, args.body_width * cell / arm_w)
        f = img[:, :, 3] > 0.5
        ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
        # the corner cell: the vertical arm's end on the cell's back / front edge, the horizontal arm's end on the right edge
        vx = np.where(f[ys[0] + 5 if name == 'up_right' else ys[-1] - 5])[0]
        cx = (vx[0] + vx[-1]) / 2 + 0  # vertical arm's centre line -> cell centre x
        cy = (ys[0] + depth / 2) if name == 'up_right' else (ys[-1] - depth / 2)
        elbows[key] = f'dachshund_elbow_{name}.png'
        frame = window(img, cx, cy)
        Image.fromarray(to8(frame)).save(os.path.join(out_dir, elbows[key]))
        print(f'{elbows[key]}: arm width {arm_w:.0f} px -> {args.body_width} cell, horizontal arm reaches x {(xs[-1] - cx) / cell:+.2f} cells from the cell centre')
    if len(elbows) == 2:
        manifest['joints'] = elbows
    with open(os.path.join(out_dir, 'dachshund.sprites.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    with open(os.path.join(out_dir, 'extend.json'), 'w') as fh:
        fh.write('{}\n')

    # preview: reassembled at game geometry, far cards first (90°: head, body, tail as the game creates them)
    views = {
        '000': [('tail_000', 0, -2 * depth), ('body_000', 0, -depth), ('head_000', 0, 0)],
        '180': [('head_180', 0, -2 * depth), ('body_180', 0, -depth), ('tail_180', 0, 0)],
        '090': [('head_090', cell, 0), ('body_090', 0, 0), ('tail_090', -cell, 0)],
    }
    tiles = []
    for order in views.values():
        canvas = np.zeros((SIZE + 2 * int(2 * depth) + 100, SIZE + 2 * int(cell) + 100, 4), float)
        for key, dx, dy in order:
            img = pics[key]
            al = img[:, :, 3:4]
            x0, y0 = int(canvas.shape[1] / 2 - SIZE / 2 + dx), int(canvas.shape[0] / 2 - SIZE / 2 + dy)
            sl = canvas[y0:y0 + SIZE, x0:x0 + SIZE]
            sl[:, :, :3] = img[:, :, :3] * al + sl[:, :, :3] * (1 - al)
            sl[:, :, 3:4] = np.maximum(sl[:, :, 3:4], al)
        ys, xs = np.where(canvas[:, :, 3] > 0.05)
        tiles.append(Image.fromarray(to8(canvas)).crop((xs.min() - 20, ys.min() - 20, xs.max() + 20, ys.max() + 20)))
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
