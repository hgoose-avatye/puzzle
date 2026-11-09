"""Head + body joint, two ways, at game size (48 px per cell): butt joint vs the body tucked a little under the head.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/overlap_compare.py
2D compositing only (sprites scaled and stacked on a flat 58° board); nothing in the prototype or the assets changes.

  A  butt joint: blocks one cell apart along the run track (as the game places them), drawn back to front by screen depth
  B  overlap d: every block after the head is pulled d cells towards the block in front of it along the same track,
     and the animal is drawn tail, body, head, so the head always covers the joint

Track: the game's rounded run path (corner radius 0.3 cell, game/smooth.ts), re-implemented here for the turn frames.
Limits: only body 0° exists, so the turn is shown while the body still faces 0° (8 headings: under 22.5°), and the
straight run up the screen uses body 0° as 180° (the block is the same front and back). The tail is the temporary block.
Writes out-body/overlap-compare.png (48 px per cell on a 3x screen, shown 2x) and out-body/overlap-compare-1x.png.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body_check  # noqa: E402  (reuses its framing of the received body)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ASSETS = os.path.join(ROOT, "assets", "crocodile")
OUT = os.path.join(ROOT, "out-body")
SIN = math.sin(math.radians(58))
CORNER = 0.3
BOARD_A, BOARD_B, LINE, ARROW = (239, 226, 198), (230, 214, 181), (190, 168, 132), (246, 193, 75)


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


# ---------------------------------------------------------------- run track (same maths as game/smooth.ts)

def smooth(path, radius=CORNER):
    pts = [path[0]]
    for i in range(1, len(path) - 1):
        a, p, b = path[i - 1], path[i], path[i + 1]
        ix, iy = np.sign(p[0] - a[0]), np.sign(p[1] - a[1])
        ox, oy = np.sign(b[0] - p[0]), np.sign(b[1] - p[1])
        if ix * ox + iy * oy != 0:
            pts.append(p)
            continue
        r = radius
        entry = (p[0] - ix * r, p[1] - iy * r)
        exit_ = (p[0] + ox * r, p[1] + oy * r)
        c = (entry[0] + ox * r, entry[1] + oy * r)
        a0 = math.atan2(entry[1] - c[1], entry[0] - c[0])
        delta = math.atan2(exit_[1] - c[1], exit_[0] - c[0]) - a0
        delta = math.atan2(math.sin(delta), math.cos(delta))
        for k in range(11):
            t = a0 + delta * k / 10
            pts.append((c[0] + math.cos(t) * r, c[1] + math.sin(t) * r))
    pts.append(path[-1])
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return pts, cum


def at(track, u):
    pts, cum = track
    u = max(0.0, min(cum[-1], u))
    i = max(0, min(len(pts) - 2, int(np.searchsorted(cum, u, side="right")) - 1))
    a, b = pts[i], pts[i + 1]
    seg = cum[i + 1] - cum[i] or 1
    t = (u - cum[i]) / seg
    deg = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.0 if deg > 359.999 else deg  # -0.0 % 360 is 360


# ---------------------------------------------------------------- sprites

def load_sprites():
    head = {}
    for h in (0, 45, 90, 135, 180):
        head[h] = Image.open(os.path.join(ASSETS, "head-approved", f"crocodile_head_{h:03d}.png")).convert("RGBA")
    for h, src in ((225, 135), (270, 90), (315, 45)):
        head[h] = ImageOps.mirror(head[src])
    body0, _ = body_check.framed_body(head[0])
    tail_strip = Image.open(os.path.join(ROOT, "public", "sprites", "crocodile_tail.png")).convert("RGBA")
    return head, body0, tail_strip


def sprite_for(part, heading, sprites):
    """Image, its pixels per cell and its floor centre; None when that heading has no drawing yet."""
    head, body0, tail_strip = sprites
    h8 = round(heading / 45) % 8 * 45
    if part == "head":
        return head[h8], 512, (512, 640)
    if part == "body":
        return (body0, 512, (512, 640)) if h8 in (0, 180) else None
    k = h8 // 45 * 4  # temporary tail strip: 32 frames of 300 px, 150 px per cell, floor centre (150, 196)
    return tail_strip.crop((k * 300, 0, k * 300 + 300, 300)), 150, (150, 196)


# ---------------------------------------------------------------- scenes and drawing

def blocks(track, s_head, overlap):
    """Head, body, tail positions: block i sits i cells behind the head, less `overlap` per joint in mode B."""
    out = []
    for i, part in enumerate(("head", "body", "tail")):
        x, y, a = at(track, s_head - i * (1 - overlap))
        out.append((part, x, y, a))
    return out


def render(scene_blocks, mode_b, sprites, cell, view, arrows):
    """Draw a 5 x 5 cell window centred on `view` (grid x, y) at `cell` px per cell."""
    w, h = round(cell * 5), round(cell * 5 * SIN) + round(cell * 0.9)
    img = Image.new("RGBA", (w, h), (120, 180, 90, 255))
    d = ImageDraw.Draw(img)
    ox, oy = view[0] - 2.5, view[1] - 2.5
    top = round(cell * 0.75)

    def to_px(gx, gy):
        return (gx - ox) * cell, top + (gy - oy) * cell * SIN

    for gy in range(int(oy) - 1, int(oy) + 7):
        for gx in range(int(ox) - 1, int(ox) + 7):
            x0, y0 = to_px(gx - 0.5, gy - 0.5)
            x1, y1 = to_px(gx + 0.5, gy + 0.5)
            d.rectangle([x0, y0, x1, y1], fill=ARROW if (gx, gy) in arrows else (BOARD_A if (gx + gy) % 2 else BOARD_B), outline=LINE)
    missing = []
    order = list(reversed(scene_blocks)) if mode_b else sorted(scene_blocks, key=lambda b: b[2])
    for part, x, y, a in order:
        sp = sprite_for(part, a, sprites)
        if sp is None:
            missing.append(f"{part} {round(a)}°")
            continue
        im, ppc, anc = sp
        k = cell / ppc
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        px, py = to_px(x, y)
        img.alpha_composite(small, (round(px - anc[0] * k), round(py - anc[1] * k)))
    return img, missing


def scenes():
    # straight down the screen (heading 0°): tail (2,0) -> body (2,1) -> head (2,2), running on to (2,7)
    down = smooth([(2, y) for y in range(0, 8)])
    # straight up (180°): tail (2,6) -> body (2,5) -> head (2,4)
    upw = smooth([(2, y) for y in range(6, -2, -1)])
    # down, then an arrow at (2,4) turns it right: tail (2,1), body (2,2), head (2,3), arrow (2,4), on to (6,4)
    turn = smooth([(2, 1), (2, 2), (2, 3), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4)])
    turn_arrows = {(2, 4)}
    s0 = 2.0  # head on its own cell at the start (tail at arc 0)
    out = [
        ("직선 · 아래로", down, s0, (2, 1.4), set()),
        ("직선 · 위로 (몸통 0° 대용)", upw, s0, (2, 4.6), set()),
    ]
    # turn frames: the head mid-bend (about 45°) and just after it (90°), body still facing down (under 22.5°)
    for name, want in (("90° 꺾기 · 머리 약 45°", 45), ("90° 꺾기 · 머리 90°", 90)):
        s = s0
        while s < 6:
            if at(turn, s)[2] >= want - 0.5 and at(turn, s - 1 + 0.15)[2] < 22.5:
                break
            s += 0.01
        out.append((name, turn, s, (2.6, 3.0), turn_arrows))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    sprites = load_sprites()
    # C: the same tuck as B 0.15 but drawn by screen depth (nearer block on top), for runs away from the camera
    modes = [("A 그대로 연결", False, 0.0), ("B 겹침 0.10칸", True, 0.10), ("B 겹침 0.15칸", True, 0.15), ("C 겹침 0.15칸·앞뒤순", False, 0.15)]
    for dpr, name in ((3, "overlap-compare.png"), (1, "overlap-compare-1x.png")):
        cell = 48 * dpr
        show = 2 if dpr == 3 else 6  # same physical size for both sheets
        rows = []
        notes = set()
        for title, track, s, view, arrows in scenes():
            tiles = []
            for _, b, ov in modes:
                img, missing = render(blocks(track, s, ov), b, sprites, cell, view, arrows)
                notes.update(missing)
                tiles.append(img.resize((round(img.width * show / dpr), round(img.height * show / dpr)), Image.NEAREST if dpr == 1 else Image.LANCZOS))
            rows.append((title, tiles))
        tw, th = rows[0][1][0].size
        sheet = Image.new("RGB", (190 + len(modes) * (tw + 12), 60 + len(rows) * (th + 12) + 30), (245, 243, 240))
        d = ImageDraw.Draw(sheet)
        d.text((10, 10), f"머리+몸통 이음새 비교 · 칸 48px · {dpr}x 화면 · 꼬리는 임시 블록", fill=(30, 30, 30), font=font(20))
        for j, (m, _, _) in enumerate(modes):
            d.text((190 + j * (tw + 12), 36), m, fill=(30, 30, 30), font=font(18))
        for i, (title, tiles) in enumerate(rows):
            y = 60 + i * (th + 12)
            d.text((10, y + th // 2 - 10), title, fill=(30, 30, 30), font=font(16))
            for j, t in enumerate(tiles):
                sheet.paste(t.convert("RGB"), (190 + j * (tw + 12), y))
        if notes:
            d.text((10, sheet.height - 26), "그림 없음으로 빠진 블록: " + ", ".join(sorted(notes)), fill=(200, 30, 30), font=font(15))
        sheet.save(os.path.join(OUT, name))
        print("wrote", name, "missing:", sorted(notes) or "none")


if __name__ == "__main__":
    main()
