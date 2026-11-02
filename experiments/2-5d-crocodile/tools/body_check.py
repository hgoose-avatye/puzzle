"""Crocodile middle body 0° against the approved head (BODY_SPEC.md §5): size checks and a joined preview.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/body_check.py
Reads assets/crocodile/received-body/received_body_000.png and the read-only head-approved/ images; writes
out-body/body0-side-by-side.png (body next to head 0° and 180°, same scale and floor line) and out-body/body0-joined.png
(head 0° in front, body one cell behind it, as a straight crocodile heading down the screen), at full size and at
48 px per cell. A body not in the 1024 / 512 px-per-cell / floor (512, 640) frame is scaled to the head's 0° width and
stood on the head's floor line; that placement is then an estimate, and the report says so.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ASSETS = os.path.join(ROOT, "assets", "crocodile")
OUT = os.path.join(ROOT, "out-body")
SIZE, CELL_W, ANCHOR = 1024, 512, (512, 640)
CELL_H = CELL_W * math.sin(math.radians(58))
BOARD = (226, 214, 181)


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def bounds(im):
    m = np.asarray(im)[..., 3] > 128
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max(), ys.max()


def framed_body(head0):
    im = Image.open(os.path.join(ASSETS, "received-body", "received_body_000.png")).convert("RGBA")
    if im.size == (SIZE, SIZE):
        return im, False
    # not in the spec frame: match the head's 0° width, centre on x = 512, and line the belly up with the head's belly:
    # the head stands on legs and the body has none, so compare the bottom of the middle column (between the legs)
    hx0, _, hx1, _ = bounds(head0)
    bx0, by0, bx1, by1 = bounds(im)
    k = (hx1 - hx0) / (bx1 - bx0)
    piece = im.crop((bx0, by0, bx1 + 1, by1 + 1))
    piece = piece.resize((round(piece.width * k), round(piece.height * k)), Image.LANCZOS)
    head_belly = belly_bottom(head0, ANCHOR[0])
    body_belly = belly_bottom(piece, piece.width // 2)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.alpha_composite(piece, (round(ANCHOR[0] - piece.width / 2), round(head_belly - body_belly)))
    return out, True


def belly_bottom(im, x):
    """Lowest opaque pixel in a narrow column around x (the belly between the legs)."""
    a = np.asarray(im)[..., 3] > 128
    col = a[:, max(0, x - 6):x + 7].any(1)
    return int(np.nonzero(col)[0].max())


def tile(im, title, w=420, top=150):
    t = Image.new("RGBA", (w, 520), BOARD + (255,))
    small = im.resize((512, 512), Image.LANCZOS)
    t.alpha_composite(small, (round(w / 2 - 256), -top // 2))
    d = ImageDraw.Draw(t)
    d.line([(0, (ANCHOR[1] - top) // 2), (w, (ANCHOR[1] - top) // 2)], fill=(220, 60, 60, 255), width=1)
    d.text((8, 8), title, fill=(30, 30, 30, 255), font=font(20))
    return t


def main():
    os.makedirs(OUT, exist_ok=True)
    head0 = Image.open(os.path.join(ASSETS, "head-approved", "crocodile_head_000.png")).convert("RGBA")
    head180 = Image.open(os.path.join(ASSETS, "head-approved", "crocodile_head_180.png")).convert("RGBA")
    body, estimated = framed_body(head0)
    rows = []
    for name, im in (("머리 0°", head0), ("몸통 0°", body), ("머리 180° (뒷면)", head180)):
        x0, y0, x1, y1 = bounds(im)
        rows.append(f"{name}: 폭 {(x1 - x0) / CELL_W:.2f}칸, 화면 높이 {(y1 - y0) / CELL_W:.2f}칸, 맨 위 y {y0}, 가장 낮은 점 y {y1}")
    print("\n".join(rows))
    if estimated:
        print("몸통이 사양 틀(1024, 바닥 중심 512·640) 밖이라 머리 0° 폭과 바닥선에 맞춰 놓았습니다 (추정 배치)")

    sheet = Image.new("RGB", (3 * 430 + 10, 600), (245, 243, 240))
    for i, (im, t) in enumerate(((head0, "머리 0° (승인)"), (body, "몸통 0°" + (" (배치 추정)" if estimated else "")), (head180, "머리 180° (승인)"))):
        sheet.paste(tile(im, t).convert("RGB"), (10 + i * 430, 10))
    d = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows):
        d.text((14, 536 + i * 20), r, fill=(60, 60, 60), font=font(15))
    sheet.save(os.path.join(OUT, "body0-side-by-side.png"))

    # straight crocodile heading down the screen: body one cell behind (up the screen), head in front, drawn back to front
    canvas = Image.new("RGBA", (SIZE, SIZE + round(CELL_H)), BOARD + (255,))
    d = ImageDraw.Draw(canvas)
    for row in range(-2, 2):
        cy = ANCHOR[1] + round(CELL_H) + row * CELL_H
        d.rectangle([ANCHOR[0] - CELL_W / 2, cy - CELL_H / 2, ANCHOR[0] + CELL_W / 2, cy + CELL_H / 2], outline=(170, 150, 120, 255), width=3)
    canvas.alpha_composite(body, (0, 0))
    canvas.alpha_composite(head0, (0, round(CELL_H)))
    canvas = canvas.crop((150, 120, SIZE - 150, SIZE + round(CELL_H) - 80))
    big = canvas.resize((canvas.width // 2, canvas.height // 2), Image.LANCZOS)
    k = 48 * 3 / CELL_W  # 48 px per cell on a 3x screen
    small = canvas.resize((round(canvas.width * k), round(canvas.height * k)), Image.LANCZOS)
    small = small.resize((small.width * 2 // 3 * 2, small.height * 2 // 3 * 2), Image.NEAREST)
    out = Image.new("RGB", (big.width + small.width + 40, max(big.height, small.height) + 50), (245, 243, 240))
    out.paste(big.convert("RGB"), (10, 40))
    out.paste(small.convert("RGB"), (big.width + 30, 40))
    d = ImageDraw.Draw(out)
    d.text((10, 8), "머리+몸통 직선 연결 (아래로 나아감)", fill=(30, 30, 30), font=font(20))
    d.text((big.width + 30, 8), "같은 장면, 칸 48px · 3x", fill=(30, 30, 30), font=font(20))
    out.save(os.path.join(OUT, "body0-joined.png"))
    print("sheets in", OUT)


if __name__ == "__main__":
    main()
