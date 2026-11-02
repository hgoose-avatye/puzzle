"""Three review sheets for the crocodile head (run after head_check.py check and tools/head-test-shots.mjs).

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/head_review.py [--pending 90,135]
  out-head/review-1-alignment.png  the 5 headings in one row on the same floor, with the floor line and each image's
                                   lowest point, top and eye line marked, so size, height and contact can be compared
  out-head/review-2-game-size.png  the 5 headings at 45 / 48 / 50 px per cell, on 1x and 3x screens
  out-head/review-3-board.png      the head on the board: waiting, mid 90° turn, mid stairs
--pending marks headings still waiting for a corrected drawing.
"""
import argparse
import glob
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
HEAD = os.path.join(ROOT, "assets", "crocodile", "head")
OUT = os.path.join(ROOT, "out-head")
HEADINGS = [0, 45, 90, 135, 180]
CELL_W, CELL_H, ANCHOR = 512, 512 * math.sin(math.radians(58)), (512, 640)
BOARD = (226, 214, 181)


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def heads():
    return {h: Image.open(os.path.join(HEAD, f"crocodile_head_{h:03d}.png")).convert("RGBA") for h in HEADINGS}


def eye_line(im):
    """Mean y of the eye whites (bright, unsaturated pixels), or None when no eye shows (180°)."""
    a = np.asarray(im).astype(int)
    white = (a[..., 3] > 200) & (a[..., :3].min(-1) > 215)
    ys = np.nonzero(white)[0]
    return int(ys.mean()) if len(ys) > 40 else None


def label(h, pending):
    return f"{h}°" + (" · 수정 전 (비늘판 4개)" if h in pending else "")


def alignment(imgs, pending):
    k = 0.5  # 1024 -> 512 per tile
    tw, top_crop, th = 380, 180, 380
    sheet = Image.new("RGB", (tw * 5 + 40, th + 140), (245, 243, 240))
    d = ImageDraw.Draw(sheet)
    d.text((16, 10), "머리 5방향 정렬 · 같은 배율 · 빨강: 바닥 중심선  주황: 칸 앞 경계  파랑 눈금: 이미지마다 가장 낮은 점 / 맨 위 / 눈 높이", fill=(30, 30, 30), font=font(20))
    y0 = 60
    floor_y = y0 + (ANCHOR[1] - top_crop) * k
    front_y = y0 + (ANCHOR[1] + CELL_H / 2 - top_crop) * k
    for i, h in enumerate(HEADINGS):
        im = imgs[h]
        x0 = 20 + i * tw
        tile = Image.new("RGBA", (tw, th), BOARD + (255,))
        td = ImageDraw.Draw(tile)
        cx = tw / 2
        # the cell under the head, as on the board
        hw, hh = CELL_W / 2 * k, CELL_H / 2 * k
        fy = (ANCHOR[1] - top_crop) * k
        td.polygon([(cx - hw, fy - hh), (cx + hw, fy - hh), (cx + hw, fy + hh), (cx - hw, fy + hh)], outline=(170, 150, 120, 255), width=2)
        small = im.resize((round(1024 * k), round(1024 * k)), Image.LANCZOS)
        tile.alpha_composite(small, (round(cx - ANCHOR[0] * k), round(-top_crop * k)))
        sheet.paste(tile.convert("RGB"), (x0, y0))
        a = np.asarray(im)[..., 3] > 128
        ys = np.nonzero(a)[0]
        marks = [("바닥", ys.max()), ("위", ys.min())]
        e = eye_line(im)
        if e:
            marks.append(("눈", e))
        for name, y in marks:
            sy = y0 + (y - top_crop) * k
            d.line([(x0 + tw - 46, sy), (x0 + tw - 6, sy)], fill=(40, 90, 210), width=3)
            d.text((x0 + tw - 44, sy - 22), name, fill=(40, 90, 210), font=font(15))
        d.text((x0 + 8, y0 + th + 8), label(h, pending), fill=(200, 30, 30) if h in pending else (30, 30, 30), font=font(22))
        xs = np.nonzero(a.any(0))[0]
        info = f"폭 {(xs.max() - xs.min()) / CELL_W:.2f}칸 · 높이 {(ys.max() - ys.min()) / CELL_W:.2f}칸" + (f" · 눈 y {e}" if e else "")
        d.text((x0 + 8, y0 + th + 40), info, fill=(80, 80, 80), font=font(16))
    for y, col in ((floor_y, (220, 50, 50)), (front_y, (230, 140, 30))):
        for x in range(20, 20 + 5 * tw, 14):
            d.line([(x, y), (x + 7, y)], fill=col, width=2)
    sheet.save(os.path.join(OUT, "review-1-alignment.png"))


def game_size(imgs, pending):
    zoom = 4  # shown size: a 1x device pixel becomes 2x2, a 3x device pixel 2/3 — the same physical size for both
    rows = [(px, dpr) for px in (45, 48, 50) for dpr in (1, 3)]
    rh, cw, lw = 64 * zoom // 2 + 40, 60 * zoom // 2 + 70, 150
    sheet = Image.new("RGB", (lw + cw * 5 + 20, 80 + rh * len(rows)), BOARD)
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), "게임 크기 축소 비교 · 칸 1개 = 45 / 48 / 50px · 1x와 3x 화면 (같은 실제 크기로 확대해 표시)", fill=(30, 30, 30), font=font(20))
    for i, h in enumerate(HEADINGS):
        d.text((lw + i * cw + 6, 40), f"{h}°" + (" *" if h in pending else ""), fill=(200, 30, 30) if h in pending else (30, 30, 30), font=font(18))
    for r, (px, dpr) in enumerate(rows):
        y = 70 + r * rh
        d.text((10, y + rh // 2 - 12), f"{px}px · {dpr}x", fill=(30, 30, 30), font=font(20))
        for i, h in enumerate(HEADINGS):
            dev = imgs[h].resize((round(1024 * px * dpr / CELL_W), round(1024 * px * dpr / CELL_W)), Image.LANCZOS)
            dev = dev.crop(dev.getbbox())
            f = zoom / 2 / dpr
            view = dev.resize((max(1, round(dev.width * f)), max(1, round(dev.height * f))), Image.NEAREST)
            sheet.paste(view, (lw + i * cw + 6, y + 4), view)
    if pending:
        d.text((10, sheet.height - 24), "* 수정 전 이미지 (비늘판 4개)", fill=(200, 30, 30), font=font(16))
    sheet.save(os.path.join(OUT, "review-2-game-size.png"))


def board():
    def crop(path, box=(0, 300, 390, 640)):
        im = Image.open(path).convert("RGB")
        im = im.resize((390, round(im.height * 390 / im.width)), Image.LANCZOS)
        return im.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS)

    stairs = sorted(glob.glob(os.path.join(OUT, "frames", "stairs", "*.png")))
    panels = [
        (crop(os.path.join(OUT, "390x844-head-idle-right.png")), "대기 (오른쪽을 봄)"),
        (crop(os.path.join(OUT, "390x844-head-turned-body-turning.png")), "90° 꺾기 중 (머리 위, 몸통 회전 중)"),
        (crop(stairs[min(len(stairs) - 1, 19)]), "계단 꺾기 중 (탭 후 약 360ms)"),
    ]
    w, h = panels[0][0].size
    sheet = Image.new("RGB", (w * 3 + 40, h + 50), (245, 243, 240))
    d = ImageDraw.Draw(sheet)
    for i, (p, t) in enumerate(panels):
        sheet.paste(p, (i * (w + 20), 50))
        d.text((i * (w + 20) + 8, 12), t, fill=(30, 30, 30), font=font(22))
    sheet.save(os.path.join(OUT, "review-3-board.png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pending", default="", help="headings still waiting for a corrected drawing, e.g. 90,135")
    pending = {int(h) for h in ap.parse_args().pending.split(",") if h}
    imgs = heads()
    alignment(imgs, pending)
    game_size(imgs, pending)
    board()
    print("review sheets in", OUT)


if __name__ == "__main__":
    main()
