"""Body 90° candidates joined to the approved head and body 0°/45°, at 48 px per cell.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/body90_check.py
For each candidate received-body/received_body_090_<a|b>.png (placed with the approved body 0° transform, no resize of
its own; 270° is it mirrored): a straight run right and left, and the down->right and down->left turns sampled while the
body goes 0° -> 45° -> 90°. Columns: butt joint, and the provisional 0.10-cell tuck drawn by screen depth.
Writes out-body/body90-<a|b>.png (3x, shown 2x) and out-body/body90-compare-1x.png (both candidates, tuck, 1x).
The tail is the temporary block.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body45_check as b45  # noqa: E402
import overlap_compare as oc  # noqa: E402

ASSETS, OUT = oc.ASSETS, oc.OUT


def font(size):
    return ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", size)


def with_body90(candidate):
    head, body, tail = b45.load()
    body = dict(body)
    body[45] = Image.open(os.path.join(ASSETS, "body-approved", "crocodile_body_045.png")).convert("RGBA")
    body[315] = ImageOps.mirror(body[45])
    k, ox, oy = b45.body_frame()
    raw = Image.open(os.path.join(ASSETS, "received-body", f"received_body_090_{candidate}.png")).convert("RGBA")
    raw = raw.resize((round(raw.width * k), round(raw.height * k)), Image.LANCZOS)
    b90 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    b90.alpha_composite(raw, (round(ox), round(oy)))
    body[90], body[270] = b90, ImageOps.mirror(b90)
    return head, body, tail


def straight(heading, sign):
    def make(ov):
        return [(p, 3 - sign * i * (1 - ov), 3.0, heading) for i, p in enumerate(("head", "body", "tail"))]
    return make


def turn_frames():
    out = []
    for name, path, arrows, view in (
        ("아래→오른쪽", [(2, 1), (2, 2), (2, 3), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4)], {(2, 4)}, (3.0, 3.6)),
        ("아래→왼쪽", [(4, 1), (4, 2), (4, 3), (4, 4), (3, 4), (2, 4), (1, 4), (0, 4)], {(4, 4)}, (3.0, 3.6)),
    ):
        track = oc.smooth(path)
        for want in (25, 45, 70, 90):
            s = 2.0
            while s < 6.5 and min(oc.at(track, s - 1)[2], 360 - oc.at(track, s - 1)[2]) < want - 0.6:
                s += 0.005
            out.append((f"{name} · 몸통 약 {want}°", b45.along(track, s), view, arrows))
    return out


def scenes():
    return [("직선 · 오른쪽", straight(90.0, 1), (2.4, 3.0), set()), ("직선 · 왼쪽 (반전)", straight(270.0, -1), (3.6, 3.0), set())] + turn_frames()


def sheet(modes, dpr, title):
    cell, show = 48 * dpr, (2 if dpr == 3 else 6)
    rows, notes = [], set()
    for name, make, view, arrows in scenes():
        tiles = []
        for _, sprites, order, ov in modes:
            img, missing = b45.render(make(ov), order, sprites, cell, view, arrows)
            notes.update(missing)
            tiles.append(img.resize((round(img.width * show / dpr), round(img.height * show / dpr)), Image.NEAREST if dpr == 1 else Image.LANCZOS))
        rows.append((name, tiles))
    tw, th = rows[0][1][0].size
    out = Image.new("RGB", (210 + len(modes) * (tw + 12), 60 + len(rows) * (th + 12) + 30), (245, 243, 240))
    d = ImageDraw.Draw(out)
    d.text((10, 10), title, fill=(30, 30, 30), font=font(20))
    for j, (m, _, _, _) in enumerate(modes):
        d.text((210 + j * (tw + 12), 36), m, fill=(30, 30, 30), font=font(18))
    for i, (name, tiles) in enumerate(rows):
        y = 60 + i * (th + 12)
        d.text((10, y + th // 2 - 10), name, fill=(30, 30, 30), font=font(15))
        for j, t in enumerate(tiles):
            out.paste(t.convert("RGB"), (210 + j * (tw + 12), y))
    if notes:
        d.text((10, out.height - 26), "그림이 없어 빠진 블록: " + ", ".join(sorted(notes)), fill=(200, 30, 30), font=font(15))
    return out, notes


def main():
    cands = {c: with_body90(c) for c in "ab"}
    for c, sp in cands.items():
        img, notes = sheet([("그대로 연결", sp, "depth", 0.0), ("0.10칸 · 앞뒤순", sp, "depth", 0.10)], 3,
                           f"몸통 90° 후보 {c.upper()} + 승인 머리·몸통 0°/45° · 칸 48px · 3x · 꼬리는 임시 블록")
        img.save(os.path.join(OUT, f"body90-{c}.png"))
        print(f"body90-{c}.png missing:", sorted(notes) or "none")
    img, notes = sheet([("후보 A · 0.10칸", cands["a"], "depth", 0.10), ("후보 B · 0.10칸", cands["b"], "depth", 0.10)], 1,
                       "몸통 90° 후보 A vs B · 0.10칸 · 앞뒤순 · 칸 48px · 1x")
    img.save(os.path.join(OUT, "body90-compare-1x.png"))
    print("body90-compare-1x.png missing:", sorted(notes) or "none")


if __name__ == "__main__":
    main()
