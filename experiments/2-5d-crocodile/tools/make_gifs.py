"""Turn the frame folders from tools/shots.mjs into GIFs, cropped to the board.

Usage (from the repo root): python3 experiments/2-5d-crocodile/tools/make_gifs.py
Frames are 2 simulation steps (1/30 s) apart, so the GIFs play at real game speed (7.5 cells/s).
"""
import glob
import os

from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out")
CROP = (0, 60, 390, 600)  # the board area on the 390x844 screen


def main():
    for folder in sorted(glob.glob(os.path.join(OUT, "frames", "*"))):
        files = sorted(glob.glob(os.path.join(folder, "*.png")))
        if not files:
            continue
        frames = [Image.open(f).convert("RGB").crop(CROP) for f in files]
        frames = [f.resize((f.width * 3 // 4, f.height * 3 // 4), Image.LANCZOS).quantize(colors=128, dither=Image.Dither.NONE) for f in frames]
        name = os.path.join(OUT, os.path.basename(folder) + ".gif")
        frames[0].save(name, save_all=True, append_images=frames[1:], duration=33, loop=0, optimize=True)
        print(os.path.basename(name), len(frames), "frames", os.path.getsize(name) // 1024, "KB")


if __name__ == "__main__":
    main()
