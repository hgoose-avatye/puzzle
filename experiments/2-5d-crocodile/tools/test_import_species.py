"""Tests for import_species.py on throw-away data in a temporary folder (copies of approved art + synthetic files).

Run (from the repo root): python3 experiments/2-5d-crocodile/tools/test_import_species.py
Never touches the real assets folder.
"""
import io
import json
import os
import shutil
import sys
import tempfile
from contextlib import redirect_stdout

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_species as tool  # noqa: E402

CROC = os.path.join(tool.DEFAULT_ROOT, "crocodile")
results = []


def run(argv):
    out = io.StringIO()
    code = 0
    with redirect_stdout(out):
        try:
            tool.main(argv)
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else 1
            if not isinstance(e.code, int) and e.code:
                print(e.code)
    return code, out.getvalue()


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))


def put(root, species, name, src=None, img=None):
    d = os.path.join(root, species, "received")
    os.makedirs(d, exist_ok=True)
    if src:
        shutil.copy(src, os.path.join(d, name))
    else:
        img.save(os.path.join(d, name))


def approved(part, ang):
    return os.path.join(CROC, f"{part}-approved", f"crocodile_{part}_{ang:03d}.png")


with tempfile.TemporaryDirectory() as root:
    # 3 cells, minimum set, from copies of the approved crocodile (already in the standard frame)
    for part, angs in (("head", (0, 90, 180)), ("body", (0, 90)), ("tail", (0, 90, 180))):
        for a in angs:
            put(root, "testcroc", f"testcroc_{part}_{a:03d}.png", src=approved(part, a))
    code, out = run(["check", "testcroc", "--cells", "3", "--root", root])
    check("3칸 최소 세트 검사 통과", code == 0, out)
    check("몸통 앞뒤 대칭 감지", "앞뒤 대칭 재사용" in out, out)
    check("check는 아무것도 쓰지 않음", not os.path.exists(os.path.join(root, "testcroc", "approved")) and not os.path.exists(os.path.join(root, "testcroc", "testcroc.sprites.json")))
    code, out = run(["approve", "testcroc", "--cells", "3", "--root", root])
    man = os.path.join(root, "testcroc", "testcroc.sprites.json")
    check("approve: 승인 폴더·매니페스트 생성", code == 0 and os.path.exists(man), out)
    m = json.load(open(man))
    check("매니페스트: scale 1.2, 부품 3개, 몸통 frontBack", m["scale"] == 1.2 and list(m["parts"]) == ["head", "body", "tail"] and m["parts"]["body"].get("frontBack") is True, json.dumps(m)[:300])
    sums = open(os.path.join(root, "testcroc", "approved", "SHA256SUMS")).read().strip().splitlines()
    check("체크섬 8줄 기록", len(sums) == 8, str(len(sums)))
    ro = all(not os.access(os.path.join(root, "testcroc", "approved", f), os.W_OK) for f in os.listdir(os.path.join(root, "testcroc", "approved")))
    check("승인본 읽기 전용", ro)
    before = open(man).read()
    code, out = run(["approve", "testcroc", "--cells", "3", "--root", root])
    check("두 번째 approve는 아무것도 바꾸지 않음", "새로 승인할 그림 없음" in out and open(man).read() == before, out)
    os.remove(os.path.join(root, "testcroc", "received", "testcroc_head_000.png"))
    shutil.copy(approved("head", 45), os.path.join(root, "testcroc", "received", "testcroc_head_000.png"))
    code, out = run(["approve", "testcroc", "--cells", "3", "--root", root])
    check("승인본과 다른 같은 이름 파일은 거부 (덮어쓰기 방지)", code != 0 and "덮어쓰지 않음" in out and open(man).read() == before, out)
    os.remove(os.path.join(root, "testcroc", "received", "testcroc_head_000.png"))
    shutil.copy(approved("head", 0), os.path.join(root, "testcroc", "received", "testcroc_head_000.png"))
    check("받은 원본은 그대로", sorted(os.listdir(os.path.join(root, "testcroc", "received"))) == sorted(f"testcroc_{p}_{a:03d}.png" for p, aa in (("head", (0, 90, 180)), ("body", (0, 90)), ("tail", (0, 90, 180))) for a in aa))

    # 2 cells: head + tail from approved copies, all 5 angles for the head
    for a in (0, 45, 90, 135, 180):
        put(root, "testtwo", f"testtwo_head_{a:03d}.png", src=approved("head", a))
    for a in (0, 90, 180):
        put(root, "testtwo", f"testtwo_tail_{a:03d}.png", src=approved("tail", a))
    code, out = run(["check", "testtwo", "--cells", "2", "--root", root])
    check("2칸 머리·꼬리 검사 통과", code == 0 and "head:" in out and "tail:" in out, out)
    check("2칸: 머리 대각선 그림 사용, 꼬리는 가장 가까운 그림 안내", "head: 그린 방향 000, 045, 090, 135, 180" in out and "tail: 대각선 없음" in out, out)

    # 1 cell: a synthetic standard-frame picture (a coloured block standing on the floor centre)
    def block(dx=0, dy=0, size=(1024, 1024), mode="RGBA", corner=False):
        im = Image.new(mode, size, (0, 0, 0, 0) if mode == "RGBA" else (255, 255, 255))
        a = np.array(im)
        a[420 + dy:820 + dy, 300 + dx:724 + dx] = (200, 90, 40, 255) if mode == "RGBA" else (200, 90, 40)
        if corner:
            a[0:4, 0:4] = (255, 255, 255, 255)
        return Image.fromarray(a, mode)

    for a in (0, 90, 180):
        put(root, "testone", f"testone_single_{a:03d}.png", img=block())
    code, out = run(["check", "testone", "--cells", "1", "--root", root])
    check("1칸 통짜 검사 통과 (반전으로 270° 채움)", code == 0 and "270° 좌우 반전 (90°)" in out, out)

    # failures
    put(root, "badfmt", "badfmt_single_000.png", img=block(mode="RGB"))
    put(root, "badfmt", "badfmt_single_090.png", img=block(size=(800, 800)))
    put(root, "badfmt", "badfmt_single_180.png", img=block(corner=True))
    code, out = run(["check", "badfmt", "--cells", "1", "--root", root])
    check("형식 오류 3종 감지 (투명 없음·크기·배경)", code != 0 and "투명 채널 없음" in out and "크기 800x800" in out and "귀퉁이" in out, out)

    put(root, "missing", "missing_single_000.png", img=block())
    code, out = run(["check", "missing", "--cells", "1", "--root", root])
    check("빠진 방향 감지", code != 0 and "최소 방향 빠짐 090, 180" in out, out)

    put(root, "badanchor", "badanchor_single_000.png", img=block(dy=-300))
    put(root, "badanchor", "badanchor_single_090.png", img=block(dx=200))
    put(root, "badanchor", "badanchor_single_180.png", img=block())
    code, out = run(["check", "badanchor", "--cells", "1", "--root", root])
    check("잘못된 기준점 감지 (떠 있음·옆으로 치우침)", code != 0 and "가장 낮은 점" in out and "가로 중심" in out, out)

    code, out = run(["approve", "badanchor", "--cells", "1", "--root", root])
    check("검사 실패면 approve 거부, 아무것도 안 만듦", code != 0 and not os.path.exists(os.path.join(root, "badanchor", "approved")), out)

    put(root, "badname", "badname_front.png", img=block())
    code, out = run(["check", "badname", "--cells", "1", "--root", root])
    check("파일 이름 규칙 위반 감지", code != 0 and "이름 규칙" in out, out)

    # per-picture anchor + partial approve, then the rest added later
    put(root, "testanc", "testanc_single_000.png", img=block(dy=-182))  # feet at y=637, like the received penguin
    code, out = run(["check", "testanc", "--cells", "1", "--root", root, "--partial"])
    check("기준점 옵션 없으면 위로 뜬 그림은 실패", code != 0 and "가장 낮은 점" in out, out)
    code, out = run(["approve", "testanc", "--cells", "1", "--root", root, "--partial", "--anchor", "single_000=512,509"])
    m = json.load(open(os.path.join(root, "testanc", "testanc.sprites.json")))
    check("부분 승인 + 그림별 기준점이 매니페스트에", code == 0 and m["parts"]["single"]["drawn"]["0"] == {"file": "approved/testanc_single_000.png", "anchor": [512, 509]}, out + json.dumps(m))
    put(root, "testanc", "testanc_single_090.png", img=block())
    put(root, "testanc", "testanc_single_180.png", img=block())
    code, out = run(["approve", "testanc", "--cells", "1", "--root", root, "--anchor", "single_000=512,509"])
    m = json.load(open(os.path.join(root, "testanc", "testanc.sprites.json")))
    sums = open(os.path.join(root, "testanc", "approved", "SHA256SUMS")).read().strip().splitlines()
    check("나중 방향 추가 승인: 0° 유지, 90·180 추가, 체크섬 3줄", code == 0 and sorted(m["parts"]["single"]["drawn"]) == ["0", "180", "90"] and m["parts"]["single"]["drawn"]["0"]["anchor"] == [512, 509] and len(sums) == 3, out)

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
