"""Crocodile head sprites (5 headings, 2D art drawn to assets/crocodile/SPEC.md): guide, checks, comparison sheets, test overlay.

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/head_check.py guide
      writes assets/crocodile/guide_head_58deg.png, the 58° framing template to draw over
  python3 experiments/2-5d-crocodile/tools/head_check.py check [--src DIR] [--out DIR] [--overlay DIR]
      checks the 5 PNGs in DIR (default assets/crocodile/head), writes comparison sheets to --out (default out-head/)
      and a sprite folder for the head test server to --overlay (default head-test-public/): a copy of public/sprites
      whose crocodile_head.png strip is built from the new images (8 headings, the 3 left-facing ones mirrored).
      public/sprites itself is never written.

2D only: images are scaled, mirrored, composited and measured; nothing is modelled or rendered in 3D.
"""
import argparse
import json
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ASSETS = os.path.join(ROOT, "assets", "crocodile")
SIZE = 1024
CELL_W = 512
PITCH = math.radians(58)
CELL_H = CELL_W * math.sin(PITCH)  # 434
ANCHOR = (512, 640)
HEADINGS = [0, 45, 90, 135, 180]
# prototype strip format (public/sprites/crocodile.json): 32 frames of 300 px, 150 px per cell, floor centre at (150, 196)
STRIP_FRAMES, STRIP_FRAME, STRIP_PPU, STRIP_ANCHOR = 32, 300, 150, (150, 196)
CONCEPT_CUT = os.path.join(ROOT, "art-check", "concept_sheet3_crocodile_cut.png")
CHICK = os.path.join(ROOT, "public", "sprites", "chick", "chick_front.png")
CHICK_W = 1.02  # chick front view width in cells, as the prototype draws it


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def cell_quad(cx, cy, scale=1.0):
    hw, hh = CELL_W / 2 * scale, CELL_H / 2 * scale
    return [(cx - hw, cy - hh), (cx + hw, cy - hh), (cx + hw, cy + hh), (cx - hw, cy + hh)]


def guide():
    img = Image.new("RGBA", (SIZE, SIZE), (238, 234, 226, 255))
    d = ImageDraw.Draw(img)
    for gx in (-1, 0, 1):
        for gy in (-1, 0, 1):
            d.polygon(cell_quad(ANCHOR[0] + gx * CELL_W, ANCHOR[1] + gy * CELL_H), outline=(200, 190, 175, 255), width=2)
    d.polygon(cell_quad(*ANCHOR), outline=(60, 60, 60, 255), width=4)
    # body block guide at 0°: 0.9 cell footprint, 0.6 cell high (screen offsets only, drawn as flat outlines)
    fw, fh = 0.45 * CELL_W, 0.45 * CELL_H
    lift = 0.6 * CELL_W * math.cos(PITCH)
    x0, x1, yb, yf = ANCHOR[0] - fw, ANCHOR[0] + fw, ANCHOR[1] - fh, ANCHOR[1] + fh
    for pts in ([(x0, yf), (x1, yf), (x1, yf - lift), (x0, yf - lift)], [(x0, yf - lift), (x1, yf - lift), (x1, yb - lift), (x0, yb - lift)]):
        d.line(pts + [pts[0]], fill=(40, 140, 60, 255), width=3)
    d.ellipse([ANCHOR[0] - 9, ANCHOR[1] - 9, ANCHOR[0] + 9, ANCHOR[1] + 9], fill=(220, 40, 40, 255))
    d.text((ANCHOR[0] + 14, ANCHOR[1] + 4), "바닥 중심 (512, 640)", fill=(200, 30, 30, 255), font=font(24))
    # heading arrows on the floor
    for h in HEADINGS:
        a = math.radians(h)
        tip = (ANCHOR[0] + math.sin(a) * 0.62 * CELL_W, ANCHOR[1] + math.cos(a) * 0.62 * CELL_H)
        d.line([ANCHOR, tip], fill=(30, 90, 200, 255), width=3)
        d.text((tip[0] + 6, tip[1] - 14), f"{h}°", fill=(30, 90, 200, 255), font=font(26))
    lines = ["악어 머리 밑그림 · 58° 직교 시점 · 칸 1개 = 512 × 434 px", "검은 칸: 머리가 서는 칸   초록: 몸 덩어리 목표 (폭 0.9칸, 높이 0.6칸, 0° 기준)",
             "파랑: 각도 (0° 화면 아래, 90° 오른쪽, 180° 위)   밑그림은 지우고 투명 배경으로 저장"]
    for i, t in enumerate(lines):
        d.text((24, 24 + i * 34), t, fill=(40, 40, 40, 255), font=font(24))
    path = os.path.join(ASSETS, "guide_head_58deg.png")
    img.save(path)
    print("wrote", path)


def load(src):
    imgs, problems = {}, []
    for h in HEADINGS:
        p = os.path.join(src, f"crocodile_head_{h:03d}.png")
        if not os.path.exists(p):
            problems.append(f"{h:03d}: 파일 없음 ({p})")
            continue
        im = Image.open(p)
        if im.size != (SIZE, SIZE):
            problems.append(f"{h:03d}: 크기 {im.size} (1024×1024 필요)")
        if im.mode != "RGBA":
            problems.append(f"{h:03d}: 투명 채널 없음 ({im.mode})")
        im = im.convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS) if im.size != (SIZE, SIZE) else im.convert("RGBA")
        a = np.asarray(im)[..., 3]
        if max(a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]) > 0:
            problems.append(f"{h:03d}: 네 귀퉁이가 투명하지 않음 (배경이 남아 있음)")
        imgs[h] = im
    return imgs, problems


def measure(im):
    rgba = np.asarray(im).astype(float)
    a = rgba[..., 3] / 255
    m = a > 0.5
    ys, xs = np.nonzero(m)
    lum = (0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2]) * m
    left, right = lum[:, :ANCHOR[0]].sum() / max(1, m[:, :ANCHOR[0]].sum()), lum[:, ANCHOR[0]:].sum() / max(1, m[:, ANCHOR[0]:].sum())
    mirror_iou = (m & m[:, ::-1]).sum() / max(1, (m | m[:, ::-1]).sum())
    return {
        "bbox": (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
        "width_cells": round((xs.max() - xs.min()) / CELL_W, 2),
        "bottom_y": int(ys.max()), "centre_x": round(float(xs.mean()), 1),
        "lr_light": round(float((left - right) / max(1e-6, (left + right) / 2)), 3),
        "mirror_shape": round(float(mirror_iou), 3),
    }


def all_headings(imgs):
    """8 headings: the 5 drawn ones plus 225/270/315 mirrored from 135/90/45 about the floor centre."""
    out = dict(imgs)
    for h, src in ((225, 135), (270, 90), (315, 45)):
        if src in imgs:
            out[h] = ImageOps.mirror(imgs[src])  # x -> 1024 - x keeps x = 512 (the anchor) in place
    return out


def tile_on_guide(im, label):
    g = Image.open(os.path.join(ASSETS, "guide_head_58deg.png")).convert("RGBA")
    g.putalpha(110)
    base = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    base.alpha_composite(g)
    base.alpha_composite(im)
    base = base.resize((340, 340), Image.LANCZOS)
    t = Image.new("RGB", (340, 380), (245, 243, 240))
    t.paste(base.convert("RGB"), (0, 40))
    ImageDraw.Draw(t).text((8, 8), label, fill=(30, 30, 30), font=font(20))
    return t


def game_size(im, cell_px, dpr):
    """The head as the board draws it: one cell = cell_px CSS px, on a dpr screen."""
    k = cell_px * dpr / CELL_W
    return im.resize((round(SIZE * k), round(SIZE * k)), Image.LANCZOS)


def sheets(imgs, out):
    os.makedirs(out, exist_ok=True)
    eight = all_headings(imgs)
    order = [0, 45, 90, 135, 180, 225, 270, 315]
    tiles = [tile_on_guide(eight[h], f"{h}°" + (" (반전)" if h > 180 else "")) for h in order if h in eight]
    sheet = Image.new("RGB", (4 * 350, 2 * 390), (245, 243, 240))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 4) * 350, (i // 4) * 390))
    sheet.save(os.path.join(out, "head-alignment.png"))

    # game size: 45 / 48 / 50 px per cell, at 1x and 3x screens, next to the concept crocodile and the chick
    board = (226, 214, 181)
    rows = []
    for cell_px in (45, 48, 50):
        for dpr in (1, 3):
            row = Image.new("RGB", (1500, 120), board)
            d = ImageDraw.Draw(row)
            d.text((8, 8), f"칸 {cell_px}px · {dpr}x", fill=(40, 40, 40), font=font(18))
            x = 130
            for h in order:
                if h not in eight:
                    continue
                s = game_size(eight[h], cell_px, dpr)
                bb = s.getbbox()
                if bb:
                    s = s.crop(bb)
                view = s.resize((round(s.width * 3 / dpr), round(s.height * 3 / dpr)), Image.NEAREST)
                if view.height > 112:
                    view = view.resize((round(view.width * 112 / view.height), 112), Image.NEAREST)
                row.paste(view, (x, 4), view)
                x += view.width + 12
            for path, w_cells in ((CONCEPT_CUT, 1.0), (CHICK, CHICK_W)):
                if os.path.exists(path):
                    c = Image.open(path).convert("RGBA")
                    w = round(cell_px * dpr * w_cells)
                    c = c.resize((w, round(c.height * w / c.width)), Image.LANCZOS)
                    view = c.resize((round(c.width * 3 / dpr), round(c.height * 3 / dpr)), Image.NEAREST)
                    row.paste(view, (x + 10, 4), view)
                    x += view.width + 22
            rows.append(row)
    gs = Image.new("RGB", (1500, 120 * len(rows)), board)
    for i, r in enumerate(rows):
        gs.paste(r, (0, i * 120))
    gs.save(os.path.join(out, "head-game-size.png"))


def overlay(imgs, dest):
    """A copy of public/ whose head strip comes from the new images, nearest of 8 headings in every frame."""
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(os.path.join(ROOT, "public"), dest)
    eight = all_headings(imgs)
    k = STRIP_PPU / CELL_W
    dy = round(STRIP_ANCHOR[1] - ANCHOR[1] * k)
    strip = Image.new("RGBA", (STRIP_FRAME * STRIP_FRAMES, STRIP_FRAME), (0, 0, 0, 0))
    for f in range(STRIP_FRAMES):
        h = (round(f * 360 / STRIP_FRAMES / 45) * 45) % 360
        src = eight[h].resize((round(SIZE * k), round(SIZE * k)), Image.LANCZOS)
        strip.alpha_composite(src, (f * STRIP_FRAME, dy))
    strip.save(os.path.join(dest, "sprites", "crocodile_head.png"), optimize=True)
    with open(os.path.join(dest, "sprites", "HEAD_SOURCE.txt"), "w") as fh:
        fh.write("crocodile_head.png built by tools/head_check.py from 5 drawn headings (+3 mirrored)\n")
    print("overlay", dest)


def import_received(src, dest, flip=()):
    """Received art in another canvas size, without a known floor centre: one shared scale for all 5 (the 0° body fills
    0.92 cell), floor centre estimated per image from its horizontal middle and its lowest point (the feet), which sits
    about 0.42 cell (straight headings) or 0.55 cell (diagonals) in front of the centre on screen. Originals are kept."""
    os.makedirs(dest, exist_ok=True)
    srcs = {h: Image.open(os.path.join(src, f"received_head_{h:03d}.png")).convert("RGBA") for h in HEADINGS}
    # a heading drawn facing the mirrored way (e.g. "45°" facing down-left, which is 315°) is mirrored back
    for h in flip:
        srcs[h] = ImageOps.mirror(srcs[h])
        print(f"{h:3d}° mirrored on import (drawn facing the other side)")
    m0 = np.asarray(srcs[0])[..., 3] > 128
    xs0 = np.nonzero(m0.any(0))[0]
    scale = 0.92 * CELL_W / (xs0.max() - xs0.min())
    for h, im in srcs.items():
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        m = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(m)
        cx = (xs.min() + xs.max()) / 2 if h in (0, 180) else float(xs[ys > ys.max() - 0.35 * CELL_H].mean())
        fy = ys.max() - (0.42 if h % 90 == 0 else 0.55) * CELL_H
        out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        out.alpha_composite(im, (round(ANCHOR[0] - cx), round(ANCHOR[1] - fy)))
        out.save(os.path.join(dest, f"crocodile_head_{h:03d}.png"))
        print(f"{h:3d}° imported: scale {scale:.3f}, floor centre estimated at source ({cx / scale:.0f}, {fy / scale:.0f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["guide", "check", "import"])
    ap.add_argument("--received", default=os.path.join(ASSETS, "received"))
    ap.add_argument("--flip", default="", help="comma-separated headings to mirror on import, e.g. 45")
    ap.add_argument("--src", default=os.path.join(ASSETS, "head"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out-head"))
    ap.add_argument("--overlay", default=os.path.join(ROOT, "head-test-public"))
    args = ap.parse_args()
    if args.mode == "guide":
        guide()
        return
    if args.mode == "import":
        import_received(args.received, args.src, [int(h) for h in args.flip.split(",") if h])
        return
    imgs, problems = load(args.src)
    report = {h: measure(im) for h, im in imgs.items()}
    for h, r in report.items():
        print(f"{h:3d}°", json.dumps(r, ensure_ascii=False))
    # standing on its own cell: the lowest point on screen moves with the heading (legs, snout), but stays between the
    # floor centre and a quarter cell past the cell's front edge; 0° / 180° lit and shaped symmetrically for mirroring
    front = ANCHOR[1] + CELL_H / 2
    for h, r in report.items():
        if not ANCHOR[1] < r["bottom_y"] <= front + 0.25 * CELL_H:
            problems.append(f"{h:03d}: 가장 낮은 점 y={r['bottom_y']} (허용 {ANCHOR[1]}~{round(front + 0.25 * CELL_H)}): 칸 위에 서 있지 않음")
    if len(report) == 5:
        for h in (0, 180):
            if abs(report[h]["lr_light"]) > 0.06:
                problems.append(f"{h}°: 좌우 밝기 차이 {report[h]['lr_light']:+.0%} → 반전하면 조명이 튐")
            if report[h]["mirror_shape"] < 0.9:
                problems.append(f"{h}°: 좌우 모양 대칭 {report[h]['mirror_shape']} (0.9 미만)")
            if abs(report[h]["centre_x"] - ANCHOR[0]) > 0.08 * CELL_W:
                problems.append(f"{h}°: 가로 중심 {report[h]['centre_x']}이 바닥 중심(512)에서 벗어남")
    print("문제 없음" if not problems else "\n".join("문제: " + p for p in problems))
    if imgs:
        sheets(imgs, args.out)
        print("sheets", args.out)
    if len(imgs) == 5:
        overlay(imgs, args.overlay)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
