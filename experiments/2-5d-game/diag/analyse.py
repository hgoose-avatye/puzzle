"""DIAGNOSIS ONLY. Reads out-diag/<species>-<mode>.json + -on.png / -off.png from diag/measure.mjs and reports, per card,
in cells of the projected board (cell width at that block):
  buried    how far the lowest opaque row of the picture (feet) lies below the lowest pixel that is really visible
            (frame with cards minus frame without; hidden by the plate, floor or anything in front)
  feet_dy   feet below the plate-top floor centre on screen (the manifests put the feet 0.3 cell in front of it)
  centre_dx visual centre (opaque bbox) left/right of the floor centre
  h, w      on-screen height / width of the opaque picture
  row       top / middle / bottom row of the board (camera distance changes)
  heading   track angle of the block vs the heading of the picture drawn
and for 2/3-cell animals heading right (90°): top line and bottom line of each part, and background gap columns
between parts. Run: python3 experiments/2-5d-game/diag/analyse.py  (writes out-diag/summary.json, prints tables)
"""
import glob
import json
import os
import re

import numpy as np
from PIL import Image

D = os.environ.get("DIAG_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out-diag")
DPR = 2
HEAD = {"0": 0, "90": 90, "180": 180, "270": 270}


def pic_heading(file):
    m = re.search(r"_(\d{3})\.png$", file)
    if m:
        return int(m.group(1))
    return {"chick_front.png": 0, "chick_back.png": 180, "chick_side_right.png": 270}.get(file)


def norm(a):
    return a % 360


def load(name):
    meta = json.load(open(os.path.join(D, name + ".json")))
    on = np.asarray(Image.open(os.path.join(D, name + "-on.png")).convert("RGB")).astype(int)
    off = np.asarray(Image.open(os.path.join(D, name + "-off.png")).convert("RGB")).astype(int)
    mask = np.abs(on - off).sum(2) > 45
    return meta, mask


def card_rows(meta):
    ys = sorted({round(c["block"][1], 1) for c in meta["cards"] if c["index"] == 0})
    return {y: ("top", "middle", "bottom")[min(2, i * 3 // max(1, len(ys)))] for i, y in enumerate(ys)}


def analyse(name):
    meta, mask = load(name)
    H, W = mask.shape
    rows = card_rows(meta)
    out = []
    for c in meta["cards"]:
        x0, y0, x1, y1 = [v * DPR for v in c["bbox"]]
        cell = c["cellPx"] * DPR
        fx, fy = c["feet"][0] * DPR, c["feet"][1] * DPR
        ftx, fty = c["floorTop"][0] * DPR, c["floorTop"][1] * DPR
        # visible card pixels inside the card's own box (inset 15% left/right so neighbours do not count)
        ix0, ix1 = int(max(0, x0 + 0.15 * (x1 - x0))), int(min(W, x1 - 0.15 * (x1 - x0)))
        iy0, iy1 = int(max(0, y0 - 2)), int(min(H, y1 + 6))
        sub = mask[iy0:iy1, ix0:ix1]
        vis_bottom = iy0 + np.where(sub.any(1))[0].max() if sub.any() else None
        rec = {
            "species": c["species"], "part": c["part"], "file": c["file"], "row": rows.get(round(c["block"][1], 1), "?") if c["index"] == 0 else None,
            "deg": round(norm(c["deg"]), 1), "pic": pic_heading(c["file"]), "mirror": c["mirror"],
            "h": round((y1 - y0) / cell, 3), "w": round((x1 - x0) / cell, 3), "cell_px": round(cell / DPR, 1),
            "feet_dy": round((fy - fty) / cell, 3), "centre_dx": round(((x0 + x1) / 2 - ftx) / cell, 3),
            "buried": round((fy - vis_bottom) / cell, 3) if vis_bottom is not None else None,
            "y_screen": c["floorTop"][1], "block": c["block"], "index": c["index"],
        }
        out.append(rec)
    return meta, mask, out


def joints(meta, mask, recs):
    """2/3-cell animals heading right: per part top/bottom (cells) and empty columns between neighbouring parts."""
    res = []
    by_animal = {}
    for c, r in zip(meta["cards"], recs):
        by_animal.setdefault(c["id"], []).append((c, r))
    for aid, parts in by_animal.items():
        if len(parts) < 2 or abs(norm(parts[0][0]["deg"]) - 90) > 1:
            continue
        cell = parts[0][0]["cellPx"] * DPR
        tops, bottoms = [], []
        for c, r in parts:
            x0, y0, x1, y1 = [v * DPR for v in c["bbox"]]
            cx0, cx1 = int((x0 + x1) / 2 - 0.15 * cell), int((x0 + x1) / 2 + 0.15 * cell)
            sub = mask[int(y0) - 2:int(y1) + 4, cx0:cx1]
            ys = np.where(sub.any(1))[0]
            tops.append(round((int(y0) - 2 + ys.min()) / cell, 3) if len(ys) else None)
            bottoms.append(round((int(y0) - 2 + ys.max()) / cell, 3) if len(ys) else None)
        # background gaps: columns between the outermost part centres where no card pixel sits in the body band
        xs = [((c["bbox"][0] + c["bbox"][2]) / 2) * DPR for c, _ in parts]
        band_y0 = int(min(c["bbox"][1] for c, _ in parts) * DPR + 0.35 * cell)
        band_y1 = int(max(c["bbox"][3] for c, _ in parts) * DPR - 0.25 * cell)
        cols = mask[band_y0:band_y1, int(min(xs)):int(max(xs))].any(0)
        res.append({"id": aid, "species": parts[0][0]["species"], "parts": [c["part"] for c, _ in parts],
                    "top": tops, "bottom": bottoms, "gap_cols_px": int((~cols).sum() / DPR)})
    return res


def main():
    summary = {}
    for f in sorted(glob.glob(os.path.join(D, "*-[ABC].json"))):
        name = os.path.basename(f)[:-5]
        meta, mask, recs = analyse(name)
        summary[name] = {"cards": recs, "joints": joints(meta, mask, recs)}
    json.dump(summary, open(os.path.join(D, "summary.json"), "w"), indent=1)
    # compact table: per species and mode, single-cell / head cards by heading and row
    for name, s in summary.items():
        heads = [r for r in s["cards"] if r["index"] == 0]
        print(f"\n{name}")
        for r in sorted(heads, key=lambda r: (r["deg"], {"top": 0, "middle": 1, "bottom": 2}.get(r["row"], 3))):
            buried = "  n/a" if r["buried"] is None else f"{r['buried']:+.2f}"
            print(f"  {r['deg']:5.0f}° {r['row']:6} pic {r['pic']}{'m' if r['mirror'] else ' '} h {r['h']:.2f} w {r['w']:.2f} feet_dy {r['feet_dy']:+.2f} centre_dx {r['centre_dx']:+.2f} buried {buried} cell {r['cell_px']}")
        for j in s["joints"]:
            print(f"  joints {j['species']} {j['parts']} top {j['top']} bottom {j['bottom']} gap_px {j['gap_cols_px']}")


if __name__ == "__main__":
    main()


def animal_heights():
    """Per animal (head block heading) and mode: how far its drawn pixels reach above the head block's floor centre
    and below it, in cells, from the frame with and without it. Classic 3D (mode 3D) gives the reference silhouette."""
    rows = {}
    for f in sorted(glob.glob(os.path.join(D, "*-*.json"))):
        name = os.path.basename(f)[:-5]
        if name in ("summary",) or not re.search(r"-(A|B|C|3D)$", name):
            continue
        meta, mask = load(name)
        items = meta.get("blocks") or [dict(c, index=c["index"]) for c in meta["cards"]]
        by = {}
        for b in items:
            by.setdefault(b["id"], []).append(b)
        for aid, blocks in by.items():
            head = min(blocks, key=lambda b: b["index"])
            cell = head["cellPx"] * DPR
            xs = [b["floorTop"][0] * DPR for b in blocks]
            ys = [b["floorTop"][1] * DPR for b in blocks]
            x0, x1 = int(min(xs) - 0.75 * cell), int(max(xs) + 0.75 * cell)
            y0, y1 = int(min(ys) - 1.9 * cell), int(max(ys) + 0.9 * cell)
            sub = mask[max(0, y0):y1, max(0, x0):x1]
            if not sub.any():
                continue
            yy = np.where(sub.any(1))[0] + max(0, y0)
            deg = round(norm(head["deg"]))
            key = (meta["species"], deg)
            rows.setdefault(key, {}).setdefault(meta["mode"], []).append(((ys[0] - yy.min()) / cell, (yy.max() - ys[0]) / cell))
    print("\nabove / below the head floor centre (cells, mean over board rows)")
    for (sp, deg), modes in sorted(rows.items()):
        line = f"  {sp:10} {deg:3}°"
        for m in ("3D", "A", "B", "C"):
            if m in modes:
                a = np.mean([v[0] for v in modes[m]]); b = np.mean([v[1] for v in modes[m]])
                line += f" | {m} {a:4.2f}/{b:4.2f}"
        print(line)


if __name__ == "__main__" and os.environ.get("HEIGHTS"):
    animal_heights()
