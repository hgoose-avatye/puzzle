"""Split the received tail sheet (45°, 90°, 135°, 180°, left to right) into game-frame sprites next to the approved tail 0°.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/tail_import.py
The sheet is kept as received. On copies: the near-transparent neon fringe the generator left (alpha < 32) is cleared;
one scale for all four, from the 180° view's width = the approved tail 0° width (both show the block's full width);
floor centre estimated per view like the head import: horizontal middle of the piece, and the lowest point (feet)
FOOT_DEPTH cells in front of the floor centre on screen (straight views) or 1.3x that (diagonals), FOOT_DEPTH measured
on the approved tail 0°. Writes received-tail/framed/crocodile_tail_<h>.png (estimated placement, not approved art).
"""
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
TAIL = os.path.join(ROOT, "assets", "crocodile")
SHEET = os.path.join(TAIL, "received-tail", "received_tail_sheet_045_090_135_180.png")
OUT = os.path.join(TAIL, "received-tail", "framed")
CELL_H = 512 * math.sin(math.radians(58))
ANCHOR = (512, 640)
FRINGE = 32


def bounds(a):
    ys, xs = np.nonzero(a[..., 3] > 128)
    return xs.min(), ys.min(), xs.max(), ys.max()


def main():
    os.makedirs(OUT, exist_ok=True)
    tail0 = np.asarray(Image.open(os.path.join(TAIL, "tail-approved", "crocodile_tail_000.png")).convert("RGBA"))
    t0x0, _, t0x1, t0y1 = bounds(tail0)
    foot_depth = (t0y1 - ANCHOR[1]) / CELL_H

    sheet = np.asarray(Image.open(SHEET).convert("RGBA")).copy()
    sheet[sheet[..., 3] < FRINGE] = 0
    solid = sheet[..., 3] > 128
    lab, n = ndimage.label(ndimage.binary_closing(solid, iterations=4))
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = [i + 1 for i in np.argsort(sizes)[::-1][:4]]
    pieces = sorted((ndimage.find_objects(lab == i)[0] for i in keep), key=lambda s: s[1].start)
    crops = {h: sheet[s] for h, s in zip((45, 90, 135, 180), pieces)}
    x0, _, x1, _ = bounds(crops[180])
    k = (t0x1 - t0x0) / (x1 - x0)
    print(f"scale {k:.3f} (180° width = tail 0° width), foot depth {foot_depth:.3f} cell")
    for h, c in crops.items():
        im = Image.fromarray(c.astype(np.uint8), "RGBA")
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        a = np.asarray(im)
        bx0, _, bx1, by1 = bounds(a)
        fy = by1 - (foot_depth if h % 90 == 0 else foot_depth * 1.3) * CELL_H
        out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        out.alpha_composite(im, (round(ANCHOR[0] - (bx0 + bx1) / 2), round(ANCHOR[1] - fy)))
        out.save(os.path.join(OUT, f"crocodile_tail_{h:03d}.png"))
        fb = bounds(np.asarray(out))
        print(f"{h:3d}°: width {(fb[2] - fb[0]) / 512:.2f} cell, top y {fb[1]}, lowest y {fb[3]}")


if __name__ == "__main__":
    main()
