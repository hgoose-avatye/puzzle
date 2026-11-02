"""TEMPORARY block-crocodile sprites for the 2.5D movement test. Not concept art and not for judging looks.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/make_sprites.py
Draws the head, middle and tail block as flat-shaded boxes with PIL, seen from the game's camera (58° down, no yaw),
at 32 headings each, and writes one strip per part to public/sprites/crocodile_<part>.png plus crocodile.json.
The light is fixed in the world (not turning with the animal), so every heading is lit the same way.
Heading convention = the game's track angle: atan2(dx, dy) on the grid, 0 = facing down the screen, π/2 = right.
"""
import json
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "sprites")
FRAMES = 32
PPU = 150  # pixels per cell in the strip
FRAME = 300
ANCHOR = (150, 196)  # where the floor centre of the cell sits in each frame
SS = 3  # supersampling
PITCH = math.radians(58)
VIEW = (0.0, math.sin(PITCH), math.cos(PITCH))
LIGHT = (-0.45, 0.8, 0.4)

GREEN, DARK, BELLY, WHITE, PUPIL, TOOTH, NOSE = (82, 190, 92), (52, 150, 66), (214, 222, 104), (250, 250, 246), (30, 30, 34), (252, 246, 220), (40, 110, 52)

# boxes: (centre x, y, z), (size x, y, z), colour; local axes: x to the animal's side, y up, z forward (heading)
PARTS = {
    "head": [
        ((0, 0.10, 0.10), (0.84, 0.12, 0.78), BELLY),  # lower jaw
        ((0, 0.30, -0.10), (0.86, 0.42, 0.70), GREEN),  # skull
        ((0, 0.23, 0.36), (0.80, 0.26, 0.26), GREEN),  # snout
        ((-0.12, 0.365, 0.45), (0.07, 0.012, 0.06), NOSE), ((0.12, 0.365, 0.45), (0.07, 0.012, 0.06), NOSE),
        ((-0.38, 0.165, 0.40), (0.05, 0.06, 0.05), TOOTH), ((0.38, 0.165, 0.40), (0.05, 0.06, 0.05), TOOTH),
        ((-0.38, 0.165, 0.22), (0.05, 0.06, 0.05), TOOTH), ((0.38, 0.165, 0.22), (0.05, 0.06, 0.05), TOOTH),
        ((-0.2, 0.58, 0.08), (0.22, 0.18, 0.16), WHITE), ((0.2, 0.58, 0.08), (0.22, 0.18, 0.16), WHITE),  # eyes
        ((-0.2, 0.585, 0.165), (0.11, 0.11, 0.012), PUPIL), ((0.2, 0.585, 0.165), (0.11, 0.11, 0.012), PUPIL),
        ((-0.18, 0.54, -0.30), (0.22, 0.06, 0.18), DARK), ((0.18, 0.54, -0.30), (0.22, 0.06, 0.18), DARK),  # scutes
        ((-0.47, 0.08, -0.22), (0.16, 0.16, 0.22), DARK), ((0.47, 0.08, -0.22), (0.16, 0.16, 0.22), DARK),  # front legs
    ],
    "body": [
        ((0, 0.10, 0), (0.90, 0.12, 0.96), BELLY),
        ((0, 0.29, 0), (0.88, 0.40, 0.98), GREEN),
        ((-0.18, 0.52, 0.22), (0.22, 0.06, 0.28), DARK), ((0.18, 0.52, 0.22), (0.22, 0.06, 0.28), DARK),
        ((-0.18, 0.52, -0.22), (0.22, 0.06, 0.28), DARK), ((0.18, 0.52, -0.22), (0.22, 0.06, 0.28), DARK),
    ],
    "tail": [
        ((0, 0.10, 0.15), (0.86, 0.12, 0.68), BELLY),
        ((0, 0.27, 0.15), (0.84, 0.36, 0.70), GREEN),
        ((0, 0.22, -0.33), (0.60, 0.28, 0.30), GREEN),
        ((0, 0.17, -0.56), (0.32, 0.18, 0.22), GREEN),
        ((-0.15, 0.48, 0.18), (0.20, 0.06, 0.26), DARK), ((0.15, 0.48, 0.18), (0.20, 0.06, 0.26), DARK),
        ((0, 0.39, -0.33), (0.18, 0.05, 0.20), DARK),
        ((-0.45, 0.08, 0.26), (0.16, 0.16, 0.22), DARK), ((0.45, 0.08, 0.26), (0.16, 0.16, 0.22), DARK),  # hind legs
    ],
}


def norm(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


L = norm(LIGHT)


def turn(p, a):
    """Local (x, y, z) to world for heading a: local z (forward) goes to (sin a, 0, cos a)."""
    x, y, z = p
    return (x * math.cos(a) + z * math.sin(a), y, -x * math.sin(a) + z * math.cos(a))


def screen(p):
    x, y, z = p
    sx = ANCHOR[0] + x * PPU
    sy = ANCHOR[1] + (z * math.sin(PITCH) - y * math.cos(PITCH)) * PPU
    return sx * SS, sy * SS


def depth(p):
    return p[1] * VIEW[1] + p[2] * VIEW[2]


def box_faces(c, s, a):
    hx, hy, hz = (v / 2 for v in s)
    corners = {}
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                corners[(i, j, k)] = turn((c[0] + i * hx, c[1] + j * hy, c[2] + k * hz), a)
    faces = []
    for axis in range(3):
        for sign in (-1, 1):
            keys = [k for k in corners if k[axis] == sign]
            # order the 4 corners around the face
            others = [d for d in range(3) if d != axis]
            keys.sort(key=lambda k: math.atan2(k[others[1]], k[others[0]]))
            n_local = [0, 0, 0]
            n_local[axis] = sign
            faces.append(([corners[k] for k in keys], turn(tuple(n_local), a)))
    return faces


def render(part, a):
    img = Image.new("RGBA", (FRAME * SS, FRAME * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    boxes = sorted(PARTS[part], key=lambda b: depth(turn(b[0], a)))
    for c, s, col in boxes:
        faces = [f for f in box_faces(c, s, a) if sum(f[1][i] * VIEW[i] for i in range(3)) > 1e-6]
        faces.sort(key=lambda f: sum(depth(p) for p in f[0]))
        for pts, n in faces:
            lit = 0.58 + 0.42 * max(0.0, sum(n[i] * L[i] for i in range(3)))
            fill = tuple(min(255, int(ch * lit)) for ch in col) + (255,)
            edge = tuple(int(ch * 0.62) for ch in col) + (255,)
            d.polygon([screen(p) for p in pts], fill=fill, outline=edge, width=SS)
    return img.resize((FRAME, FRAME), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for part in PARTS:
        strip = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
        for k in range(FRAMES):
            strip.alpha_composite(render(part, 2 * math.pi * k / FRAMES), (k * FRAME, 0))
        strip.save(os.path.join(OUT, f"crocodile_{part}.png"), optimize=True)
        print(part, os.path.getsize(os.path.join(OUT, f"crocodile_{part}.png")) // 1024, "KB")
    with open(os.path.join(OUT, "crocodile.json"), "w") as f:
        json.dump({"frames": FRAMES, "frame": FRAME, "ppu": PPU, "anchor": ANCHOR, "temporary": True}, f, indent=1)


if __name__ == "__main__":
    main()
