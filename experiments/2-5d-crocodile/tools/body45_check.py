"""Body 45° (received, unscaled) joined to the approved head: a straight diagonal still and the turn frames where the
body passes 45°, at 48 px per cell, three ways (butt joint / 0.10 tuck with the head on top / 0.10 tuck in depth order).

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/body45_check.py
Body sprites used: 0° (approved), 45° (received original, placed with exactly the transform of the approved 0°, no
resize of its own) and 315° (45° mirrored left-right, as the head does). No front-back reuse (0°=180°, 45°=135°): that is
not confirmed, so frames needing body 90° / 135° / 180° are not drawn. Writes out-body/body45-joints.png (3x, shown 2x)
and out-body/body45-joints-1x.png. The tail is the temporary block.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body_check as bc  # noqa: E402
import overlap_compare as oc  # noqa: E402

ROOT = oc.ROOT
ASSETS = oc.ASSETS
OUT = oc.OUT
SIN = oc.SIN


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def body_frame():
    """Scale and offset that turned the received body 0° into the approved framed body 0°; applied unchanged to 45°."""
    head0 = Image.open(os.path.join(ASSETS, "head-approved", "crocodile_head_000.png")).convert("RGBA")
    src0 = Image.open(os.path.join(ASSETS, "received-body", "received_body_000.png")).convert("RGBA")
    hx0, _, hx1, _ = bc.bounds(head0)
    bx0, by0, bx1, by1 = bc.bounds(src0)
    k = (hx1 - hx0) / (bx1 - bx0)
    piece = src0.crop((bx0, by0, bx1 + 1, by1 + 1)).resize((round((bx1 - bx0 + 1) * k), round((by1 - by0 + 1) * k)), Image.LANCZOS)
    ox = round(512 - piece.width / 2) - bx0 * k
    oy = round(bc.belly_bottom(head0, 512) - bc.belly_bottom(piece, piece.width // 2)) - by0 * k
    return k, ox, oy


def load():
    head = {h: Image.open(os.path.join(ASSETS, "head-approved", f"crocodile_head_{h:03d}.png")).convert("RGBA") for h in (0, 45, 90, 135, 180)}
    for h, src in ((225, 135), (270, 90), (315, 45)):
        head[h] = ImageOps.mirror(head[src])
    k, ox, oy = body_frame()
    raw = Image.open(os.path.join(ASSETS, "received-body", "received_body_045.png")).convert("RGBA")
    raw = raw.resize((round(raw.width * k), round(raw.height * k)), Image.LANCZOS)
    b45 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    b45.alpha_composite(raw, (round(ox), round(oy)))
    body = {0: Image.open(os.path.join(ASSETS, "body-approved", "crocodile_body_000.png")).convert("RGBA"), 45: b45, 315: ImageOps.mirror(b45)}
    tail = Image.open(os.path.join(ROOT, "public", "sprites", "crocodile_tail.png")).convert("RGBA")
    return head, body, tail


def sprite(part, heading, sp):
    head, body, tail = sp
    h8 = round(heading / 45) % 8 * 45
    if part == "head":
        return head[h8], 512, (512, 640)
    if part == "body":
        return (body[h8], 512, (512, 640)) if h8 in body else None
    k = h8 // 45 * 4
    return tail.crop((k * 300, 0, k * 300 + 300, 300)), 150, (150, 196)


def render(blocks, order, sp, cell, view, arrows):
    w, h = round(cell * 4.4), round(cell * 4.4 * SIN) + round(cell * 0.9)
    img = Image.new("RGBA", (w, h), (120, 180, 90, 255))
    d = ImageDraw.Draw(img)
    ox, oy, top = view[0] - 2.2, view[1] - 2.2, round(cell * 0.75)

    def px(gx, gy):
        return (gx - ox) * cell, top + (gy - oy) * cell * SIN

    for gy in range(int(oy) - 1, int(oy) + 6):
        for gx in range(int(ox) - 1, int(ox) + 6):
            x0, y0 = px(gx - 0.5, gy - 0.5)
            x1, y1 = px(gx + 0.5, gy + 0.5)
            d.rectangle([x0, y0, x1, y1], fill=oc.ARROW if (gx, gy) in arrows else (oc.BOARD_A if (gx + gy) % 2 else oc.BOARD_B), outline=oc.LINE)
    missing = []
    seq = list(reversed(blocks)) if order == "head-top" else sorted(blocks, key=lambda b: b[2])
    for part, x, y, a in seq:
        s = sprite(part, a, sp)
        if s is None:
            missing.append(f"{part} {round(a)}°")
            continue
        im, ppc, anc = s
        k = cell / ppc
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        X, Y = px(x, y)
        img.alpha_composite(small, (round(X - anc[0] * k), round(Y - anc[1] * k)))
    return img, missing


def diagonal(ov):
    """Head at (3, 3) facing down-right; body and tail one block (less the tuck) behind it on the diagonal."""
    r = (1 - ov) / math.sqrt(2)
    return [(p, 3 - i * r, 3 - i * r, 45.0) for i, p in enumerate(("head", "body", "tail"))]


def along(track, s0):
    return lambda ov: [(p, *oc.at(track, s0 - i * (1 - ov))) for i, p in enumerate(("head", "body", "tail"))]


def scenes():
    out = [("45° 방향 직선 (정지 장면)", diagonal, (2.4, 2.3), set())]
    for name, path, arrows, view in (
        ("아래→오른쪽 꺾기", [(2, 1), (2, 2), (2, 3), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4)], {(2, 4)}, (2.8, 3.4)),
        ("아래→왼쪽 꺾기 (반전)", [(4, 1), (4, 2), (4, 3), (4, 4), (3, 4), (2, 4), (1, 4), (0, 4)], {(4, 4)}, (3.2, 3.4)),
    ):
        track = oc.smooth(path)
        # 58: the last arc heading (58.5°) still drawn with the 45° picture; past 67.5° the 90° body is needed (not yet drawn)
        for want in (30, 45, 58):
            # the body heading reaches `want` degrees away from straight down (to the right or to the left)
            # measured on the tucked body (s - 0.9), the furthest into the bend of the three ways, so that in every
            # column the body is still within the 45° picture's range
            s = 2.0
            while s < 6 and min(oc.at(track, s - 0.9)[2], 360 - oc.at(track, s - 0.9)[2]) < want:
                s += 0.005
            out.append((f"{name} · 몸통 약 {want}°", along(track, s), view, arrows))
    return out


def main():
    sp = load()
    modes = [("A 그대로 연결", "depth", 0.0), ("B 0.10칸 · 머리 위", "head-top", 0.10), ("C 0.10칸 · 앞뒤순", "depth", 0.10)]
    for dpr, name in ((3, "body45-joints.png"), (1, "body45-joints-1x.png")):
        cell, show = 48 * dpr, (2 if dpr == 3 else 6)
        rows, notes = [], set()
        for title, make, view, arrows in scenes():
            tiles = []
            for _, order, ov in modes:
                img, missing = render(make(ov), order, sp, cell, view, arrows)
                notes.update(missing)
                tiles.append(img.resize((round(img.width * show / dpr), round(img.height * show / dpr)), Image.NEAREST if dpr == 1 else Image.LANCZOS))
            rows.append((title, tiles))
        tw, th = rows[0][1][0].size
        sheet = Image.new("RGB", (230 + len(modes) * (tw + 12), 60 + len(rows) * (th + 12) + 30), (245, 243, 240))
        d = ImageDraw.Draw(sheet)
        d.text((10, 10), f"몸통 45°(받은 원본, 크기 보정 없음) + 승인 머리 · 칸 48px · {dpr}x · 꼬리는 임시 블록", fill=(30, 30, 30), font=font(20))
        for j, (m, _, _) in enumerate(modes):
            d.text((230 + j * (tw + 12), 36), m, fill=(30, 30, 30), font=font(18))
        for i, (title, tiles) in enumerate(rows):
            y = 60 + i * (th + 12)
            d.text((10, y + th // 2 - 10), title, fill=(30, 30, 30), font=font(15))
            for j, t in enumerate(tiles):
                sheet.paste(t.convert("RGB"), (230 + j * (tw + 12), y))
        if notes:
            d.text((10, sheet.height - 26), "그림이 없어 빠진 블록: " + ", ".join(sorted(notes)), fill=(200, 30, 30), font=font(15))
        sheet.save(os.path.join(OUT, name))
        print("wrote", name, "missing:", sorted(notes) or "none")


if __name__ == "__main__":
    main()
