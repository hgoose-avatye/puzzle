"""Register 2.5D sprites for any species: check received pictures, then (only on an explicit approve) freeze them.

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/import_species.py check   <species> --cells N [--root DIR]
  python3 experiments/2-5d-crocodile/tools/import_species.py approve <species> --cells N [--root DIR] [--scale 1.2]

Layout under ROOT (default experiments/2-5d-crocodile/assets):
  <species>/received/<species>_<part>_<angle>.png   pictures as delivered (never modified)
  <species>/approved/<species>_<part>_<angle>.png   frozen copies, read-only, SHA256SUMS   (approve only)
  <species>/<species>.sprites.json                  manifest                                (approve only)

Parts: 1 cell single; 2 cells head, tail; 3+ cells head, body, tail. Angles 000/045/090/135/180 (the rest are mirrored;
a body block that is its own front-back mirror also reuses 180 = 0). Minimum per part: 000, 090, 180 (body: 000, 090).

check   reads only: format (1024x1024 RGBA, transparent corners), framing (the standard frame: one cell 512 px, floor
        centre (512, 640); the lowest opaque pixel must lie between the floor centre and a quarter cell past the cell's
        front edge, the block's middle within 0.12 cell of x = 512), missing minimum headings, which of the 8 headings
        resolve and how (drawn / mirrored / front-back / nearest), and for a body the 90° left-right symmetry that
        front-back reuse needs. Exit 0 only when nothing fails. Nothing is copied or written.
approve runs the same checks and refuses on any failure, then copies received pictures not yet approved into approved/
        (read-only), appends SHA256SUMS and adds them to the manifest; an approved picture is never replaced.
--anchor PART_ANGLE=X,Y  a picture's own floor centre (checked against it, written to the manifest); repeatable.
--partial                allow missing minimum headings (e.g. approve 0° first, the rest later).
No species name, size or count is built in.
"""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import stat
import sys

import numpy as np
from PIL import Image

SIZE, CELL, ANCHOR = 1024, 512, (512, 640)
CELL_H = CELL * math.sin(math.radians(58))
ANGLES = [0, 45, 90, 135, 180]
HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315]
DEFAULT_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets"))
NAME = re.compile(r"^(?P<sp>[a-z][a-z0-9-]*)_(?P<part>single|head|body|tail)_(?P<ang>\d{3})\.png$")


def parts_for(cells):
    if cells <= 1:
        return ["single"]
    return ["head"] + ["body"] * (cells - 2) + ["tail"]


def minimum(part):
    return [0, 90] if part == "body" else [0, 90, 180]


def check_picture(path, anchor=ANCHOR):
    """Problems with one picture (empty list = fine); `anchor` is its floor centre (default the standard one)."""
    problems = []
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:  # unreadable file
        return [f"읽을 수 없음: {e}"]
    if im.format != "PNG":
        problems.append(f"PNG 아님 ({im.format})")
    if im.size != (SIZE, SIZE):
        problems.append(f"크기 {im.size[0]}x{im.size[1]} (1024x1024 필요)")
    if im.mode != "RGBA":
        problems.append(f"투명 채널 없음 ({im.mode})")
        return problems
    a = np.asarray(im)[..., 3]
    if max(a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]) > 0:
        problems.append("네 귀퉁이가 투명하지 않음 (배경이 남아 있음)")
    m = a > 128
    if not m.any():
        return problems + ["그림이 비어 있음"]
    if im.size != (SIZE, SIZE):
        return problems
    ys, xs = np.nonzero(m)
    lowest, front = ys.max(), anchor[1] + CELL_H / 2
    if not anchor[1] < lowest <= front + 0.25 * CELL_H:
        problems.append(f"기준점: 가장 낮은 점 y={lowest} (허용 {anchor[1] + 1}~{round(front + 0.25 * CELL_H)}), 바닥 중심 ({anchor[0]}, {anchor[1]})에 서 있지 않음")
    mid = (xs.min() + xs.max()) / 2
    if abs(mid - anchor[0]) > 0.12 * CELL:
        problems.append(f"기준점: 가로 중심 x={mid:.0f} ({anchor[0]}에서 {abs(mid - anchor[0]):.0f}px 벗어남)")
    width = (xs.max() - xs.min()) / CELL
    if not 0.4 <= width <= 1.4:
        problems.append(f"배율: 폭 {width:.2f}칸 (칸 512px 기준 0.4~1.4칸 밖)")
    return problems


def mirror_symmetry(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 128
    ys, xs = np.nonzero(a)
    shift = int(round(xs.min() + xs.max() - (SIZE - 1)))
    b = np.roll(a[:, ::-1], shift, axis=1)
    return float((a & b).sum() / max(1, (a | b).sum()))


def resolve(drawn, front_back):
    """heading -> how it is shown, mirroring src/sprites.ts spriteFor + nearestSprite."""
    out = {}
    for h in HEADINGS:
        tries = [(h, "그림"), ((360 - h) % 360, "좌우 반전")]
        if front_back:
            t = (h + 180) % 360
            tries += [(t, "앞뒤 대칭"), ((360 - t) % 360, "앞뒤 대칭+반전")]
        hit = next((how + (f" ({src}°)" if src != h else "") for src, how in tries if src in drawn), None)
        if hit is None:
            best = min(drawn, key=lambda d: abs((h - d + 540) % 360 - 180)) if drawn else None
            hit = f"가장 가까운 {best}°" if best is not None else "없음"
        out[h] = hit
    return out


def scan(root, species, cells, anchors=None, partial=False):
    """Everything check reports, as data: (failures, warnings, per-part info)."""
    received = os.path.join(root, species, "received")
    failures, warnings, info = [], [], {}
    if not os.path.isdir(received):
        return [f"받은 그림 폴더 없음: {received}"], warnings, info
    files = {}
    for f in sorted(os.listdir(received)):
        if not f.endswith(".png"):
            continue
        m = NAME.match(f)
        if not m:
            failures.append(f"파일 이름 규칙 위반: {f} (<종>_<single|head|body|tail>_<000|045|090|135|180>.png)")
            continue
        if m["sp"] != species:
            failures.append(f"다른 종 이름: {f}")
            continue
        ang = int(m["ang"])
        if ang not in ANGLES:
            failures.append(f"각도 {ang}는 그리지 않음 (225·270·315는 반전으로 만듦): {f}")
            continue
        files[(m["part"], ang)] = os.path.join(received, f)
    wanted = list(dict.fromkeys(parts_for(cells)))
    for part, ang in files:
        if part not in wanted:
            failures.append(f"{cells}칸 동물에 없는 부품: {part}_{ang:03d}")
    for part in wanted:
        drawn = sorted(a for (p, a) in files if p == part)
        missing = [a for a in minimum(part) if a not in drawn]
        if missing and not partial:
            failures.append(f"{part}: 최소 방향 빠짐 {', '.join(f'{a:03d}' for a in missing)}")
        for a in drawn:
            for p in check_picture(files[(part, a)], (anchors or {}).get((part, a), ANCHOR)):
                failures.append(f"{part}_{a:03d}: {p}")
        front_back = False
        if part == "body" and 90 in drawn and not check_picture(files[(part, 90)]):
            sym = mirror_symmetry(files[(part, 90)])
            front_back = sym >= 0.95
            if not front_back:
                warnings.append(f"body 90° 좌우 대칭 {sym:.3f} (< 0.95): 앞뒤 재사용 안 함, 180°도 그려야 8방향이 정확함")
        nearest = [h for h, how in resolve(drawn, front_back).items() if how.startswith("가장 가까운")]
        if nearest and not missing:
            warnings.append(f"{part}: 대각선 없음, {len(nearest)}방향은 가장 가까운 그림 사용 (꺾일 때 90° 단위로 바뀜)")
        if missing and partial:
            warnings.append(f"{part}: 아직 없는 최소 방향 {', '.join(f'{a:03d}' for a in missing)} (부분 승인)")
        info[part] = {"drawn": drawn, "frontBack": front_back, "resolve": resolve(drawn, front_back), "files": {a: files[(part, a)] for a in drawn}}
    return failures, warnings, info


def report(species, cells, failures, warnings, info):
    print(f"[{species}] {cells}칸 · 부품 {', '.join(info) or '-'}")
    for part, d in info.items():
        print(f"  {part}: 그린 방향 {', '.join(f'{a:03d}' for a in d['drawn']) or '-'}" + (" · 앞뒤 대칭 재사용" if d["frontBack"] else ""))
        print("    8방향: " + " | ".join(f"{h}° {how}" for h, how in d["resolve"].items()))
    for w in warnings:
        print("  주의:", w)
    for f in failures:
        print("  실패:", f)
    print("  결과:", "통과" if not failures else f"실패 {len(failures)}건")


def approve(root, species, cells, scale, info, anchors):
    """Copy received pictures that are not approved yet into approved/ (read-only) and update SHA256SUMS and the
    manifest. An existing approved picture is never replaced: a differing received file with the same name refuses."""
    dest = os.path.join(root, species, "approved")
    manifest = os.path.join(root, species, f"{species}.sprites.json")
    os.makedirs(dest, exist_ok=True)
    sha = lambda f: hashlib.sha256(open(f, "rb").read()).hexdigest()
    m = json.load(open(manifest)) if os.path.exists(manifest) else {"species": species, "frame": {"size": SIZE, "cellPx": CELL, "anchor": list(ANCHOR)}, "scale": scale, "parts": {}}
    added = []
    for part, d in info.items():
        entry = m["parts"].setdefault(part, {"drawn": {}})
        if d["frontBack"]:
            entry["frontBack"] = True
        for a, src in d["files"].items():
            name = os.path.basename(src)
            out = os.path.join(dest, name)
            if os.path.exists(out):
                if sha(out) != sha(src):
                    sys.exit(f"이미 승인된 {name}과 받은 파일이 다름: 덮어쓰지 않음")
                continue
            shutil.copy2(src, out)
            os.chmod(out, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            anchor = (anchors or {}).get((part, a))
            entry["drawn"][str(a)] = {"file": f"approved/{name}", "anchor": list(anchor)} if anchor else f"approved/{name}"
            added.append(name)
    if not added:
        print("새로 승인할 그림 없음 (이미 모두 승인됨)")
        return
    sums = os.path.join(dest, "SHA256SUMS")
    if os.path.exists(sums):
        os.chmod(sums, stat.S_IRUSR | stat.S_IWUSR)
    with open(sums, "a") as fh:
        fh.write("".join(f"{sha(os.path.join(dest, n))}  {n}\n" for n in added))
    os.chmod(sums, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    with open(manifest, "w") as fh:
        json.dump(m, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"승인 고정: {', '.join(added)} → {dest} (읽기 전용, SHA256SUMS 추가) · 매니페스트 {manifest}")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["check", "approve"])
    ap.add_argument("species")
    ap.add_argument("--cells", type=int, required=True)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--scale", type=float, default=1.2)
    ap.add_argument("--anchor", action="append", default=[], metavar="PART_ANGLE=X,Y",
                    help="floor centre of one picture when it is not (512, 640), e.g. single_000=512,509 (repeatable)")
    ap.add_argument("--partial", action="store_true", help="allow missing minimum headings (approve what is there)")
    args = ap.parse_args(argv)
    anchors = {}
    for spec in args.anchor:
        key, xy = spec.split("=")
        part, ang = key.rsplit("_", 1)
        x, y = (int(v) for v in xy.split(","))
        anchors[(part, int(ang))] = (x, y)
    if not NAME.match(f"{args.species}_single_000.png"):
        sys.exit("종 이름은 영문 소문자 (speciesFor와 같은 이름, 예: penguin)")
    failures, warnings, info = scan(args.root, args.species, args.cells, anchors, args.partial)
    report(args.species, args.cells, failures, warnings, info)
    if failures:
        sys.exit(1)
    if args.mode == "approve":
        approve(args.root, args.species, args.cells, args.scale, info, anchors)


if __name__ == "__main__":
    main()
