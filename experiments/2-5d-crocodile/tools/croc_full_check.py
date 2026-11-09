"""Whole crocodile (approved head, body, tail) in every direction and turn, at game size, with a pop / size check.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/croc_full_check.py
Runs along the game's track at real speed (7.5 cells/s, 30 fps) with the provisional 0.10-cell tuck and screen-depth
order. Tail: only 0° is drawn (approved B); other tail headings fall back to the temporary block and are counted.
For every block and frame it measures the sprite's opaque area; a jump of more than POP between consecutive frames
is reported as an image pop. Writes out-full/<scene>.gif (48 px per cell, 3x screen shown at 1x) and
out-full/strips-48px.png (8 frames per scene at 48 px, 1x screen).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body45_check as b45  # noqa: E402
import body_full_check as bf  # noqa: E402
import overlap_compare as oc  # noqa: E402

ROOT, ASSETS = oc.ROOT, oc.ASSETS
OUT = os.path.join(ROOT, "out-full")
TUCK, STEP, POP = 0.10, 7.5 / 30, 0.25

SCENES = [
    ("down", [(2, y) for y in range(-1, 9)], set()),
    ("up", [(2, y) for y in range(8, -2, -1)], set()),
    ("right", [(x, 3) for x in range(-1, 8)], set()),
    ("left", [(x, 3) for x in range(7, -2, -1)], set()),
    ("down-right", [(2, 0), (2, 1), (2, 2), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3)], {(2, 3)}),
    ("down-left", [(4, 0), (4, 1), (4, 2), (4, 3), (3, 3), (2, 3), (1, 3), (0, 3), (-1, 3)], {(4, 3)}),
    ("up-right", [(2, 6), (2, 5), (2, 4), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3)], {(2, 3)}),
    ("right-up", [(0, 5), (1, 5), (2, 5), (3, 5), (3, 4), (3, 3), (3, 2), (3, 1), (3, 0), (3, -1)], {(3, 5)}),
    ("stairs", [(0, 5), (1, 5), (2, 5), (3, 5), (3, 4), (2, 4), (2, 3), (2, 2), (2, 1), (2, 0), (2, -1)], {(3, 5), (3, 4), (2, 4)}),
]


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def sprites():
    head, body = bf.eight()
    tails = {0: Image.open(os.path.join(ASSETS, "tail-approved", "crocodile_tail_000.png")).convert("RGBA")}
    framed = os.path.join(ASSETS, "received-tail", "framed")
    for h in (45, 90, 135, 180):
        p = os.path.join(framed, f"crocodile_tail_{h:03d}.png")
        if os.path.exists(p):
            tails[h] = Image.open(p).convert("RGBA")
    for h, src in ((225, 135), (270, 90), (315, 45)):
        if src in tails:
            tails[h] = ImageOps.mirror(tails[src])
    temp = Image.open(os.path.join(ROOT, "public", "sprites", "crocodile_tail.png")).convert("RGBA")
    area = {}

    def sprite(part, heading, _sp):
        h8 = round(heading / 45) % 8 * 45
        if part == "tail":
            if h8 in tails:
                return tails[h8], 512, (512, 640)
            k = h8 // 45 * 4  # no drawing for this heading yet: the temporary block
            return temp.crop((k * 300, 0, k * 300 + 300, 300)), 150, (150, 196)
        return {"head": head, "body": body}[part][h8], 512, (512, 640)

    def opaque(part, heading):
        """Opaque area of the sprite in square cells, cached per (part, heading)."""
        key = (part, round(heading / 45) % 8 * 45)
        if key not in area:
            im, ppc, _ = sprite(part, heading, None)
            area[key] = float((np.asarray(im)[..., 3] > 128).sum()) / ppc ** 2
        return area[key]

    return sprite, opaque


def view_of(path, arrows):
    """Centre the window on the bend (the arrows) so the turn is in frame; straight runs on the path's middle."""
    pts = list(arrows) or path
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def main():
    os.makedirs(OUT, exist_ok=True)
    sprite, opaque = sprites()
    b45.sprite = sprite  # this run's sprites; body45_check.py itself is not changed
    strips, pops, temp_frames, total = [], [], 0, 0
    for name, path, arrows in SCENES:
        track = oc.smooth(path)
        view = view_of(path, arrows)
        gif, keep, prev = [], [], None
        s = 2.0
        while s - 2 * (1 - TUCK) < track[1][-1] - 0.3:
            blocks = [(p, *oc.at(track, s - i * (1 - TUCK))) for i, p in enumerate(("head", "body", "tail"))]
            areas = [opaque(p, a) for p, _, _, a in blocks]
            if prev:
                for (p, *_), a0, a1 in zip(blocks, prev, areas):
                    if abs(a1 - a0) / max(a0, 1e-6) > POP:
                        pops.append(f"{name} {p} {a0:.2f}->{a1:.2f}")
            prev = areas
            total += 1
            temp_frames += sprite("tail", blocks[2][3], None)[1] != 512
            img3, _ = b45.render(blocks, "depth", None, 144, view, arrows)
            gif.append(img3.resize((img3.width // 3, img3.height // 3), Image.LANCZOS).convert("RGB").quantize(colors=160, dither=Image.Dither.NONE))
            keep.append(blocks)
            s += STEP
        gif = [gif[0]] * 10 + gif + [gif[-1]] * 10
        gif[0].save(os.path.join(OUT, f"{name}.gif"), save_all=True, append_images=gif[1:], duration=33, loop=0, optimize=True)
        picks = [keep[round(i * (len(keep) - 1) / 7)] for i in range(8)]
        strips.append((name, [b45.render(b, "depth", None, 48, view, arrows)[0] for b in picks]))
    tw, th = strips[0][1][0].size
    zoom = 2
    sheet = Image.new("RGB", (120 + 8 * (tw * zoom + 6), 40 + len(strips) * (th * zoom + 8)), (245, 243, 240))
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), "악어 전체 · 칸 48px · 1x 화면 (2배 확대 표시) · 0.10칸 겹침 · 깊이순 · 꼬리 0° 외 방향은 임시 블록", fill=(30, 30, 30), font=font(18))
    for r, (name, tiles) in enumerate(strips):
        y = 40 + r * (th * zoom + 8)
        d.text((10, y + th), name, fill=(30, 30, 30), font=font(18))
        for i, t in enumerate(tiles):
            sheet.paste(t.resize((tw * zoom, th * zoom), Image.NEAREST).convert("RGB"), (120 + i * (tw * zoom + 6), y))
    sheet.save(os.path.join(OUT, "strips-48px.png"))
    print(f"frames {total}, tail on a temporary heading in {temp_frames} ({temp_frames / total:.0%})")
    print(f"image pops (opaque area change > {POP:.0%} between frames): {len(pops)}")
    for p in pops:
        print("  ", p)


if __name__ == "__main__":
    main()
