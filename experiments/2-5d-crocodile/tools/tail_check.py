"""Tail 0° candidates against the approved body (TAIL_SPEC.md §5): sizes, and head+body+tail in a straight line at 48 px.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/tail_check.py
Each candidate received-tail/received_tail_000_<x>.png is placed with exactly the approved body 0° transform (no resize
of its own), so sizes compare as drawn. Writes out-tail/tail0-sizes.png (body 0° next to each candidate on the same
floor line) and out-tail/tail0-joined.png (straight run down the screen: head, body, tail; butt joint and the
provisional 0.10-cell tuck, screen-depth order; 48 px per cell on 3x and 1x). Only 0° exists, so only this run.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body45_check as b45  # noqa: E402
import body_check as bc  # noqa: E402
import body_full_check as bf  # noqa: E402
import overlap_compare as oc  # noqa: E402

ROOT, ASSETS = oc.ROOT, oc.ASSETS
OUT = os.path.join(ROOT, "out-tail")
CELL = 512


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def framed(path):
    k, ox, oy = b45.body_frame()
    raw = Image.open(path).convert("RGBA")
    raw = raw.resize((round(raw.width * k), round(raw.height * k)), Image.LANCZOS)
    out = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    out.alpha_composite(raw, (round(ox), round(oy)))
    return out


def front_width(im):
    """Width of the block a little above its lowest point (the front face, above the legs)."""
    a = np.asarray(im)[..., 3] > 128
    ys = np.nonzero(a.any(1))[0]
    for y in range(ys.max() - 60, ys.min(), -1):
        xs = np.nonzero(a[y])[0]
        if len(xs) and xs.max() - xs.min() > 200:
            return (xs.max() - xs.min()) / CELL
    return 0


def report(name, im):
    x0, y0, x1, y1 = bc.bounds(im)
    return f"{name}: 화면 폭 {(x1 - x0) / CELL:.2f}칸 · 앞면 폭 {front_width(im):.2f}칸 · 화면 높이 {(y1 - y0) / CELL:.2f}칸 · 맨 위 y {y0} · 가장 낮은 점 y {y1}"


def main():
    os.makedirs(OUT, exist_ok=True)
    head, body = bf.eight()
    cands = {os.path.basename(p)[-5]: framed(p) for p in sorted(glob.glob(os.path.join(ASSETS, "received-tail", "received_tail_000_*.png")))}
    lines = [report("몸통 0° (승인)", body[0])] + [report(f"꼬리 0° 후보 {c.upper()}", im) for c, im in cands.items()]
    print("\n".join(lines))

    tiles = [("몸통 0° (승인)", body[0])] + [(f"꼬리 0° 후보 {c.upper()}", im) for c, im in cands.items()]
    sheet = Image.new("RGB", (len(tiles) * 430 + 10, 640), (245, 243, 240))
    d = ImageDraw.Draw(sheet)
    for i, (t, im) in enumerate(tiles):
        sheet.paste(bc.tile(im, t, top=60).convert("RGB"), (10 + i * 430, 10))
    for i, line in enumerate(lines):
        d.text((14, 540 + i * 22), line, fill=(60, 60, 60), font=font(15))
    sheet.save(os.path.join(OUT, "tail0-sizes.png"))

    # straight run down the screen: tail at the top, then body, head at the bottom; only tail 0° exists
    track = oc.smooth([(2, y) for y in range(0, 9)])
    rows = []
    for c, tail0 in cands.items():
        def sprite(part, heading, sp, tail0=tail0):
            if part == "tail":
                return tail0, 512, (512, 640)
            return {"head": head, "body": body}[part][round(heading / 45) % 8 * 45], 512, (512, 640)
        tiles = []
        for ov in (0.0, 0.10):
            for dpr in (3, 1):
                orig, b45.sprite = b45.sprite, sprite
                try:
                    img, _ = b45.render([(p, *oc.at(track, 3.0 - i * (1 - ov))) for i, p in enumerate(("head", "body", "tail"))], "depth", None, 48 * dpr, (2, 2.0), set())
                finally:
                    b45.sprite = orig
                show = 2  # same physical size: a 3x device pixel shown at 2/3, a 1x pixel at 2
                tiles.append((f"{'그대로 연결' if ov == 0 else '0.10칸 겹침'} · {dpr}x", img.resize((round(img.width * show / dpr), round(img.height * show / dpr)), Image.LANCZOS if dpr == 3 else Image.NEAREST)))
        rows.append((f"후보 {c.upper()}", tiles))
    tw, th = rows[0][1][0][1].size
    out = Image.new("RGB", (110 + 4 * (tw + 10), 50 + len(rows) * (th + 40)), (245, 243, 240))
    d = ImageDraw.Draw(out)
    d.text((10, 8), "머리+몸통+꼬리 직선 (아래로 나아감) · 칸 48px", fill=(30, 30, 30), font=font(20))
    for r, (name, tiles) in enumerate(rows):
        y = 70 + r * (th + 40)
        d.text((10, y + th // 2), name, fill=(30, 30, 30), font=font(20))
        for j, (t, im) in enumerate(tiles):
            d.text((110 + j * (tw + 10), y - 26), t, fill=(30, 30, 30), font=font(16))
            out.paste(im.convert("RGB"), (110 + j * (tw + 10), y))
    out.save(os.path.join(OUT, "tail0-joined.png"))
    print("sheets in", OUT)


if __name__ == "__main__":
    main()
