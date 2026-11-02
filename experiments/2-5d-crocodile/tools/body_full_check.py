"""Approved head + approved body over all 8 headings: an overlay for the unchanged prototype and 2D turn animations.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/body_full_check.py
Body headings from the approved 0° / 45° / 90° with the block's symmetries: mirror left-right (315 = mirror 45,
270 = mirror 90) and front-back (180 = 0, 225 = 45, 135 = mirror 45), the latter not yet confirmed by a drawn 180°.

  body-test-public/      copy of public/ whose head and body strips come from the approved art, for
                         HEAD_TEST_PUBLIC=... node tools/head-test-shots.mjs (the prototype as is: butt joint)
  out-body/anim-*.gif    2D compositing along the game's track at real speed (7.5 cells/s, 30 fps), with the
                         provisional 0.10-cell tuck and screen-depth order: down->right turn, stairs, straight up,
                         up->right turn (uses body 135° and 180°). The tail is the temporary block.
"""
import os
import shutil
import sys

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body45_check as b45  # noqa: E402
import overlap_compare as oc  # noqa: E402

ROOT, ASSETS, OUT = oc.ROOT, oc.ASSETS, oc.OUT
STRIP_FRAMES, STRIP_FRAME, STRIP_PPU, STRIP_ANCHOR = 32, 300, 150, (150, 196)
TUCK = 0.10
STEP = 7.5 / 30  # cells per frame at the game's run speed


def eight():
    head = {h: Image.open(os.path.join(ASSETS, "head-approved", f"crocodile_head_{h:03d}.png")).convert("RGBA") for h in (0, 45, 90, 135, 180)}
    for h, src in ((225, 135), (270, 90), (315, 45)):
        head[h] = ImageOps.mirror(head[src])
    b = {h: Image.open(os.path.join(ASSETS, "body-approved", f"crocodile_body_{h:03d}.png")).convert("RGBA") for h in (0, 45, 90)}
    body = {0: b[0], 45: b[45], 90: b[90], 135: ImageOps.mirror(b[45]), 180: b[0], 225: b[45], 270: ImageOps.mirror(b[90]), 315: ImageOps.mirror(b[45])}
    return head, body


def strip(images):
    k = STRIP_PPU / 512
    dy = round(STRIP_ANCHOR[1] - 640 * k)
    out = Image.new("RGBA", (STRIP_FRAME * STRIP_FRAMES, STRIP_FRAME), (0, 0, 0, 0))
    for f in range(STRIP_FRAMES):
        src = images[(round(f * 360 / STRIP_FRAMES / 45) * 45) % 360].resize((round(1024 * k), round(1024 * k)), Image.LANCZOS)
        out.alpha_composite(src, (f * STRIP_FRAME, dy))
    return out


def overlay(head, body):
    dest = os.path.join(ROOT, "body-test-public")
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(os.path.join(ROOT, "public"), dest)
    strip(head).save(os.path.join(dest, "sprites", "crocodile_head.png"), optimize=True)
    strip(body).save(os.path.join(dest, "sprites", "crocodile_body.png"), optimize=True)
    print("overlay", dest)


def animate(name, path, arrows, view, head, body, tail):
    track = oc.smooth(path)
    sp = (head, body, tail)
    end = track[1][-1] - 0.5
    frames = []
    s = 2.0
    while s - 2 * (1 - TUCK) < end:
        img, _ = b45.render([(p, *oc.at(track, s - i * (1 - TUCK))) for i, p in enumerate(("head", "body", "tail"))], "depth", sp, 144, view, arrows)
        frames.append(img.resize((img.width * 2 // 3, img.height * 2 // 3), Image.LANCZOS).convert("RGB").quantize(colors=160, dither=Image.Dither.NONE))
        s += STEP
    frames = [frames[0]] * 10 + frames + [frames[-1]] * 10
    frames[0].save(os.path.join(OUT, f"anim-{name}.gif"), save_all=True, append_images=frames[1:], duration=33, loop=0, optimize=True)
    print(f"anim-{name}.gif", len(frames), "frames")


def main():
    head, body = eight()
    overlay(head, body)
    tail = Image.open(os.path.join(ROOT, "public", "sprites", "crocodile_tail.png")).convert("RGBA")
    scenes = [
        ("turn-down-right", [(2, 1), (2, 2), (2, 3), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4), (7, 4)], {(2, 4)}, (3.0, 3.4)),
        ("stairs", [(0, 5), (1, 5), (2, 5), (3, 5), (3, 4), (2, 4), (2, 3), (2, 2), (2, 1), (2, 0)], {(3, 5), (3, 4), (2, 4)}, (2.0, 3.0)),
        ("straight-up", [(2, 6), (2, 5), (2, 4), (2, 3), (2, 2), (2, 1), (2, 0), (2, -1)], set(), (2.0, 3.0)),
        ("turn-up-right", [(2, 6), (2, 5), (2, 4), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3)], {(2, 3)}, (3.0, 3.6)),
    ]
    for name, path, arrows, view in scenes:
        animate(name, path, arrows, view, head, body, tail)


if __name__ == "__main__":
    main()
