# 배치 1 — 펭귄·앵무새 0° 요청문 (2026-11-01)

## 받을 곳

| 종 | 파일 (정확히 이 이름) |
|---|---|
| 펭귄 | `experiments/2-5d-crocodile/assets/penguin/received/penguin_single_000.png` |
| 앵무새 | `experiments/2-5d-crocodile/assets/parrot/received/parrot_single_000.png` |

받은 뒤 검사: `python3 experiments/2-5d-crocodile/tools/import_species.py check penguin --cells 1` (앵무새도 같음). 지금은 90°·180°가 없어서 "최소 방향 빠짐"으로 실패하는 게 정상이고, 0° 검사 결과만 봅니다.

## 첨부할 것 (두 요청 공통)

1. 밑그림: `experiments/2-5d-crocodile/assets/crocodile/guide_head_58deg.png`
2. 화풍·조명·배율 기준: `experiments/2-5d-crocodile/assets/crocodile/head-approved/crocodile_head_000.png`
3. 종별 콘셉트:
   - 앵무새: `experiments/2-5d-crocodile/assets/parrot/reference/concept_sheet2_parrot_front.png`, `concept_sheet1_parrot_4views.png`
   - 펭귄: **최종 콘셉트 시트에 없습니다.** 승인된 병아리·앵무새 콘셉트와 같은 화풍으로 새로 디자인해야 합니다. 디자인 특징은 기존 게임의 펭귄을 따릅니다.

## 펭귄 0°

> A cute PENGUIN, a single one-cell block of the same clay-toy family as the attached crocodile and parrot concept: a soft, puffy cushion cube with large rounded edges, matte clay material with a gentle sheen.
> Dark slate-blue body (#5A6380) with a big white face patch and white belly on the front; two large glossy round eyes (white, dark brown pupil, big highlight) in the white face; a small orange wedge beak; small orange flat feet poking out at the front; short dark flippers on both sides; a little tuft of three dark feathers on top of the head.
> It must read as a penguin at 48 px: dark body, white face, orange beak and feet. It must look clearly different from a parrot (no red, no curved beak, no colourful wings).
> Camera: orthographic, looking down at the floor at 58°, no yaw (floor grid lines horizontal and vertical). View 0°: the penguin faces the camera, toward the bottom of the image.
> Light: one soft key light from the top front, left-right symmetric; same light and scale as the attached crocodile head. No cast shadow on the ground.
> 1024×1024 PNG, transparent background. One floor cell is 512 px wide; the floor centre of the cell is at pixel (512, 640) (follow the attached guide). The block is about 0.92 cell wide and stays inside its cell. One view only.

## 앵무새 0°

> A cute PARROT, a single one-cell block matching the attached parrot concept images exactly, in the same clay-toy family as the attached crocodile: a soft, puffy red cushion cube (#E83A1C) with large rounded edges, matte clay material with a gentle sheen.
> Two large glossy round eyes (white, dark green-brown iris, big highlight) with a pale orange-yellow face patch around them; a curved yellow-orange hooked beak in the middle; small rainbow wings on both sides (blue, green, yellow feathers); a small red rounded tuft on top; small yellow feet at the front.
> It must read as a parrot at 48 px: red body, curved beak, colourful wings. It must look clearly different from a penguin (no white belly, no dark body).
> Camera: orthographic, looking down at the floor at 58°, no yaw (floor grid lines horizontal and vertical). View 0°: the parrot faces the camera, toward the bottom of the image.
> Light: one soft key light from the top front, left-right symmetric; same light and scale as the attached crocodile head. No cast shadow on the ground.
> 1024×1024 PNG, transparent background. One floor cell is 512 px wide; the floor centre of the cell is at pixel (512, 640) (follow the attached guide). The block is about 0.92 cell wide and stays inside its cell. One view only.

## 0° 승인 후 (90°·180° 네 장 한꺼번에)

승인된 0°를 첨부하고, 위 요청문의 View 줄만 바꿉니다.
- **90°:** "View 90°: the same [penguin/parrot] turned on the floor to face RIGHT; we see its left side (camera does not move)."
- **180°:** "View 180°: the same [penguin/parrot] turned to face AWAY from the camera, up the image; we see its back."

파일: `penguin_single_090.png`, `penguin_single_180.png`, `parrot_single_090.png`, `parrot_single_180.png`

## 0° 승인 (2026-11-01)

- 승인: `assets/penguin/approved/penguin_single_000.png`, `assets/parrot/approved/parrot_single_000.png` (읽기 전용, SHA256SUMS)
- 매니페스트: `assets/<종>/<종>.sprites.json` — 0°만 그림별 기준점 (512, 509), `scale: 1.2`
- 발이 바닥 중심 높이(y≈638)에 그려져 와서 매니페스트로 보정했습니다. 90°·180°의 기준점은 받은 뒤 방향별로 정합니다.

## 90°·180° 네 장 요청문 (복사해서 사용)

각 요청에 첨부할 것: 그 동물의 승인 0° 그림, 밑그림 `guide_head_58deg.png`.

### penguin_single_090.png
> The SAME penguin as the attached approved image (same shape, colours, clay material, size and light), turned on the floor so it faces RIGHT. The camera does not move: orthographic, looking down at the floor at 58°, no yaw. We see the penguin's left side: dark body, the white face and belly seen from the side, the orange beak pointing right, one flipper toward us, orange feet pointing right, the head tuft. Same top-front, left-right symmetric light; no cast shadow on the ground. 1024×1024 PNG, transparent background, the penguin's feet at the same height and the same size as in the attached image, centred left to right. One view only.

### penguin_single_180.png
> The SAME penguin as the attached approved image (same shape, colours, clay material, size and light), turned on the floor to face AWAY from the camera, up the image. The camera does not move: orthographic, looking down at the floor at 58°, no yaw. We see its back: plain dark back and top, the head tuft, the flippers on both sides, a small tail at the bottom of the back; no face, no white belly visible. Same top-front, left-right symmetric light; no cast shadow on the ground. 1024×1024 PNG, transparent background, feet at the same height and the same size as in the attached image, centred left to right. One view only.

### parrot_single_090.png
> The SAME parrot as the attached approved image (same red cushion cube, colours, clay material, size and light), turned on the floor so it faces RIGHT. The camera does not move: orthographic, looking down at the floor at 58°, no yaw. We see the parrot's left side: the curved yellow beak pointing right, one eye with its pale face patch, the rainbow wing (blue, green, yellow) on the side toward us, the red tuft on top, yellow feet pointing right. Same top-front, left-right symmetric light; no cast shadow on the ground. 1024×1024 PNG, transparent background, feet at the same height and the same size as in the attached image, centred left to right. One view only.

### parrot_single_180.png
> The SAME parrot as the attached approved image (same red cushion cube, colours, clay material, size and light), turned on the floor to face AWAY from the camera, up the image. The camera does not move: orthographic, looking down at the floor at 58°, no yaw. We see its back: plain red back, the red tuft on top, both rainbow wings folded on the back, a short colourful tail at the bottom; no face or beak visible. Same top-front, left-right symmetric light; no cast shadow on the ground. 1024×1024 PNG, transparent background, feet at the same height and the same size as in the attached image, centred left to right. One view only.

**받을 곳:** `experiments/2-5d-crocodile/assets/penguin/received/`, `.../parrot/received/`에 위 파일명으로. 이 대화에 보내 주시면 제가 넣습니다.
