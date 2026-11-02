"""Cut the chick's facings out of a delivered sheet into the SPRITES.md frame, as candidates (the sheet is not modified).

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/chick_import.py [--sheet PNG] [--order 0,270,180,90] [--out DIR]

The sheet shows the chick on a flat grey ground, one facing per column (left to right in --order, game headings:
0° toward the camera, 90° right, 180° away, 270° left). Each chick is keyed by colour saturation (the ground and the
labels are grey), its edge un-blended from the ground colour, scaled so the 0° chick with its wings is WIDTH_CELLS wide
(the old cut-outs' rule), and put in a 1024×1024 frame with its body centre at x = 512 and the feet FEET_FORWARD cells
in front of the floor centre (512, 640), as the old cut-outs' anchors were defined. Writes <out>/chick_<heading>.png for
every column and <out>/chick.sprites.json drawing 0°, 180° and 270° (90° is the mirror of 270°, as in the chick
manifest). The game draws these with ?art=candidate.
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

SIZE, CELL, ANCHOR = 1024, 512, (512, 640)
CELL_H = CELL * math.sin(math.radians(58))
WIDTH_CELLS = 1.02  # the old front cut-out: whole chick (with wings) per cell
FEET_FORWARD = 0.3  # cells, the old cut-outs' anchor rule (feet in front of the centre)
SAT_CORE = 0.35  # saturation that is surely chick (yellow, orange, pink)
SAT_EDGE = (0.15, 0.40)  # ramp for the soft edge pixels blended with the grey ground
WHITE_EDGE = (209, 215)  # lowest channel: ground ~203-210 → 0, eye white (214-228) → 1
WARM_EDGE = (8, 16)  # r - b: ground 0-6 → 0, eye white 25-32 → 1
DARK_EDGE = (120, 80)  # highest channel: ground → 0, pupil → 1
HERE = os.path.dirname(os.path.abspath(__file__))


def saturation(rgb):
    mx, mn = rgb.max(2), rgb.min(2)
    return (mx - mn) / np.maximum(mx, 1)


def hue_yellow(rgb):
    """Pixels whose hue is the body yellow (not the orange beak, feet and tail)."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = 60 * (g - b) / np.maximum(r - b, 1)  # valid where r is the largest channel (yellow / orange)
    return (r >= g) & (g >= b) & (hue > 40)


def find_chicks(sheet):
    """Bounding boxes of the chicks on the sheet (the largest saturated blobs), left to right."""
    core = ndimage.binary_fill_holes(saturation(sheet[:, :, :3].astype(float)) > SAT_CORE)
    lab, n = ndimage.label(core)
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    big = [i + 1 for i in np.argsort(sizes)[::-1] if sizes[i] > 0.2 * sizes.max()]
    boxes = []
    for i in big:
        ys, xs = np.where(lab == i)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # the top row only (a sheet may show the old pictures below it for comparison)
    top = min(boxes, key=lambda b: b[1])
    row = [b for b in boxes if abs((b[1] + b[3]) - (top[1] + top[3])) < (top[3] - top[1])]
    return sorted(row)


def cut(sheet, box, margin=24):
    """One chick as RGBA float (alpha 0..1): alpha from saturation (body), brightness (eye whites) and darkness (pupils)
    next to the body, edge colours un-blended from the ground colour."""
    x0, y0, x1, y1 = box
    a = sheet[max(0, y0 - margin):y1 + margin, max(0, x0 - margin):x1 + margin].astype(float)
    rgb = a[:, :, :3]
    sat = saturation(rgb)
    body = sat > SAT_CORE
    # the eyes bulge past the yellow silhouette in the side views: white and dark pixels near the body belong to it
    near = ndimage.binary_dilation(body, iterations=30)
    # eye white: brighter than the ground and warm (r > b), the ground is neutral grey
    warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2] - WARM_EDGE[0]) / (WARM_EDGE[1] - WARM_EDGE[0]), 0, 1)
    white = np.clip((rgb.min(2) - WHITE_EDGE[0]) / (WHITE_EDGE[1] - WHITE_EDGE[0]), 0, 1) * warm * near
    dark = np.clip((DARK_EDGE[0] - rgb.max(2)) / (DARK_EDGE[0] - DARK_EDGE[1]), 0, 1) * near
    core = ndimage.binary_fill_holes(body | (white >= 1) | (dark >= 1))
    ground = np.median(rgb[(sat < 0.08) & ~near], axis=0)
    soft = np.clip((sat - SAT_EDGE[0]) / (SAT_EDGE[1] - SAT_EDGE[0]), 0, 1)
    soft = np.maximum.reduce([soft, white, dark]) * ndimage.binary_dilation(core, iterations=3)
    alpha = np.where(core, 1.0, soft)
    k = np.maximum(alpha, 1e-3)[:, :, None]
    unblended = np.clip((rgb - (1 - k) * ground) / k, 0, 255)
    colour = np.where(core[:, :, None], rgb, unblended)
    return np.dstack([colour, alpha]), core


def resize_rgba(img, scale):
    """Lanczos resize of a float RGBA (alpha 0..1) picture, premultiplied so the edge keeps its colour."""
    pre = np.dstack([img[:, :, :3] * img[:, :, 3:4], img[:, :, 3:4] * 255])
    w, h = round(img.shape[1] * scale), round(img.shape[0] * scale)
    out = np.array(Image.fromarray(pre.round().astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(float)
    alpha = out[:, :, 3] / 255
    rgb = np.clip(out[:, :, :3] / np.maximum(alpha, 1e-3)[:, :, None], 0, 255)
    return np.dstack([rgb, alpha])


def place(img, centre_x, feet_y):
    """The picture in the standard frame: body centre at x 512, feet FEET_FORWARD cells in front of the floor centre."""
    frame = np.zeros((SIZE, SIZE, 4), float)
    x = round(ANCHOR[0] - centre_x)
    y = round(ANCHOR[1] + FEET_FORWARD * CELL_H - feet_y)
    h, w = img.shape[:2]
    frame[y:y + h, x:x + w] = img
    frame[:, :, 3] *= 255
    return frame.round().astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', default=os.path.join(HERE, '..', 'public/sprites/chick/received/chick_4dir_sheet.png'))
    ap.add_argument('--order', default='0,270,180,90', help='game heading of each sheet column, left to right')
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'public/sprites/chick/candidate'))
    args = ap.parse_args()
    headings = [int(h) for h in args.order.split(',')]
    sheet = np.array(Image.open(args.sheet).convert('RGBA'))
    boxes = find_chicks(sheet)
    if len(boxes) != len(headings):
        raise SystemExit(f'found {len(boxes)} chicks on the sheet, --order names {len(headings)}')
    cuts = [cut(sheet, b) for b in boxes]
    front = cuts[headings.index(0)][1]
    scale = WIDTH_CELLS * CELL / np.ptp(np.where(front.any(0))[0])
    os.makedirs(args.out, exist_ok=True)
    pictures = {}
    for heading, (img, _) in zip(headings, cuts):
        big = resize_rgba(img, scale)
        core = big[:, :, 3] > 0.5
        body = hue_yellow(big[:, :, :3]) & core
        xs = np.where(body.any(0))[0]
        out = place(big, (xs[0] + xs[-1]) / 2, np.where(core.any(1))[0][-1] + 1)
        name = f'chick_{heading:03d}.png'
        Image.fromarray(out).save(os.path.join(args.out, name))
        pictures[heading] = out
        f = out[:, :, 3] > 127
        ys, xs = np.where(f.any(1))[0], np.where(f.any(0))[0]
        print(f'{name}: bbox x{xs[0]}-{xs[-1]} ({(xs[-1] - xs[0]) / CELL:.2f} cell) y{ys[0]}-{ys[-1]}  feet y {ys[-1]} (floor centre 640)')
    if 90 in pictures and 270 in pictures:
        m90, m270 = pictures[90][:, :, 3] > 127, pictures[270][:, :, 3][:, ::-1] > 127
        print(f'90° vs mirrored 270° silhouette overlap: {(m90 & m270).sum() / (m90 | m270).sum():.3f}')
    manifest = {
        'species': 'chick',
        'note': 'candidate: facings cut from received/chick_4dir_sheet.png into the SPRITES.md frame (tools/chick_import.py); 90 is the mirror of 270 as in the chick manifest, 45/135/225/315 use the nearest',
        'frame': {'size': SIZE, 'cellPx': CELL, 'anchor': list(ANCHOR)},
        'scale': 1.2,
        'parts': {'single': {'drawn': {str(h): f'chick_{h:03d}.png' for h in (0, 180, 270) if h in pictures}}},
    }
    with open(os.path.join(args.out, 'chick.sprites.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')


if __name__ == '__main__':
    main()
