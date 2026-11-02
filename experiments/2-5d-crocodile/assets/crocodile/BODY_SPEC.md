# 악어 가운데 몸통 스프라이트 사양 (5방향)

승인된 머리(`head-approved/`, 2026-11-01 최종 승인)와 이어 붙일 가운데 몸통 블록입니다.
시점·배율·조명·바닥 중심·파일 형식은 머리 사양(`SPEC.md`)과 같습니다. 이 문서는 몸통에서 달라지는 점만 적습니다.

## 1. 파일

| 각도 | 파일명 | 블록이 나아가는 쪽 (머리가 있는 쪽) |
|---|---|---|
| 0° | `received-body/received_body_000.png` | 화면 아래 |
| 45° | `received-body/received_body_045.png` | 화면 오른쪽 아래 |
| 90° | `received-body/received_body_090.png` | 화면 오른쪽 |
| 135° | `received-body/received_body_135.png` | 화면 오른쪽 위 |
| 180° | `received-body/received_body_180.png` | 화면 위 |

- 225°·270°·315°는 135°·90°·45°를 좌우 반전합니다.
- PNG, 투명 배경, 바닥 그림자 없음
- 1024×1024, 칸 1개 = 512px, 바닥 중심 (512, 640) 권장 (`guide_head_58deg.png` 밑그림 사용)
  - 다른 크기로 와도 가져올 때 맞추지만, 그러면 바닥 중심이 추정값이 됩니다.
  - **한 장에 한 방향**으로 받는 게 가장 정확합니다.

## 2. 머리와 맞춰야 하는 것

**모양**
- **폭:** 0°에서 몸 폭 약 0.92칸 (머리 0°와 같음)
- **길이:** 나아가는 방향으로 **거의 1칸**(약 0.98칸). 게임에서 블록 중심 간격이 1칸이라, 직선일 때 앞뒤 블록과 틈 없이 맞닿아야 합니다.
- **높이:** 머리 몸 덩어리 윗면과 같은 높이 (머리의 눈·눈두덩은 빼고). 머리보다 높으면 안 됩니다.
- **앞면(머리 쪽)·뒷면(꼬리 쪽):** 장식 없는 평평한 쿠션 면. 승인된 머리 180°의 뒷면과 같은 크기·둥글기
- **옆면:** 살짝 부푼 쿠션 면. 모서리 둥글기는 머리와 같게

**색·무늬**
- **색과 질감:** 머리와 같은 초록, 같은 점토 질감, 같은 조명 (정면 위쪽, 좌우 대칭)
- **연두색 배 띠:** 머리 아래턱·배 띠와 **같은 높이와 두께**로 블록을 한 바퀴 두릅니다. 직선으로 놓였을 때 띠가 머리에서 꼬리까지 한 줄로 이어져 보여야 합니다.
- **비늘판:** 등 위에 **2×3 = 6개**. 머리와 같은 크기·색·간격
  - 2열이 블록 길이 방향으로 3줄입니다.
  - 열 간격을 머리와 맞춰, 위에서 볼 때 머리 비늘판 줄과 한 줄로 이어지게 합니다.

## 3. 넣지 않는 것

- **얼굴 요소 없음:** 눈, 눈두덩, 주둥이, 콧구멍, 이빨이 없습니다.
- **연두색 볼 무늬 없음:** 머리 양옆의 볼 무늬는 얼굴 표시라서 몸통에 있으면 앞뒤가 헷갈립니다.
- **다리 없음 (확정, 2026-11-01):** 게임의 3칸 악어는 다리가 머리 블록(앞다리)과 꼬리 블록(뒷다리)에만 있습니다.

`received-body/received_body_sheet_pre-spec.png`(다리·볼 무늬가 있는 시트)는 참고 자료로만 보존하고, 최종 몸통 에셋으로 쓰지 않습니다.

제작 순서: 몸통 0° → 머리와 연결 비교 → 나머지 4방향 → 몸통 승인 → 꼬리

## 4. 각도 정의

블록이 바닥 위에서 제자리 회전한다고 보고, 카메라는 고정입니다. 각도는 머리가 붙는 앞면이 향하는 쪽입니다.

몸통은 앞뒤가 거의 같아서 0°와 180°가 비슷하게 보일 수 있습니다. 그래도 비늘판 배치와 조명은 블록 방향을 따라 돌아야 합니다. 90°에서는 비늘판 3줄이 화면 가로 방향으로 놓입니다.

## 5. 나머지 방향 (몸통 0° 승인 후, 2026-11-01)

몸통 0°는 승인되어 `body-approved/`에 고정했습니다(읽기 전용, SHA256SUMS). 나머지 방향은 **승인된 몸통 0°와 똑같은 블록**을 돌린 모습이어야 합니다.
- 비늘판 크기와 배 띠 두께는 **몸통 0°**에 맞춥니다.
- 시점·조명·배율은 머리와 같습니다.

**새로 그려야 하는 것은 45°와 90° 두 장입니다.** 다리·볼 무늬·얼굴이 없는 몸통은 앞뒤도 좌우도 대칭(비늘판 2×3이 가운데 정렬, 조명 좌우 대칭)이라 나머지는 이미 있는 그림에서 나옵니다.

| 각도 | 만드는 방법 |
|---|---|
| 0° | 승인본 |
| 45° | **새로 그림** |
| 90° | **새로 그림** |
| 135° | 45°를 좌우 반전 (180° 돌린 블록 = 같은 모양) |
| 180° | 0°와 같음 |
| 225° | 45°와 같음 |
| 270° | 90° 좌우 반전 |
| 315° | 45° 좌우 반전 |

- 135°·180°도 받으면 위 가정이 맞는지 대조하는 데 씁니다. 필수는 아닙니다.
- 실제로 다르게 그려져 오면(예: 비늘판이 한쪽으로 치우침) 그 방향은 받은 그림을 씁니다.

**방향별 확인 포인트**
- **90° (옆모습):** 블록 길이가 화면 가로로 거의 1칸. 앞면(머리 쪽)이 오른쪽, 뒷면(꼬리 쪽)이 왼쪽. 두 면 모두 장식 없는 쿠션 면. 비늘판은 가로로 3개 × 앞뒤 2줄. 배 띠 높이는 머리 90°의 배 띠와 같은 높이
- **45°:** 앞면이 오른쪽 아래를 봄. 윗면·앞면·오른쪽 옆면 세 면이 보임
- **두 방향 공통:** 0°와 같은 몸 높이, 같은 모서리 둥글기, 같은 비늘판 크기

**요청문 (GPT용).** 승인된 몸통 0°, 머리 90°·45°, 밑그림을 첨부하세요.

> Same crocodile middle BODY block as the attached approved body 0° image, rotated on the floor; the camera does not move.
> Keep exactly: the same block shape and size, cushion edges, green clay material, lime belly band thickness, and the 6 scute plates (2 across × 3 along the block) of the same size as in the body 0° image; same 58° top-down orthographic camera, same top-front symmetric light, same scale as the attached head images.
> No face, no legs, no cheek spots; the front face (head side) and back face (tail side) are plain flat cushion faces of the same size.
> [90°: the front face points to the RIGHT of the screen; seen from the side, the block is almost one floor cell long left to right, belly band at the same height as on the attached head 90° image.]
> [45°: the front face points DOWN-RIGHT on the screen, like the attached head 45° image.]
> Transparent background, one view per image, 1024×1024, the floor centre of its cell at pixel (512, 640), one cell 512 px wide (follow the attached guide). No ground shadow.

**파일명:** `received-body/received_body_090.png`, `received-body/received_body_045.png` (선택: `_135`, `_180`)

**결정 (2026-11-01)**
- 몸통 0°·45° 승인, `body-approved/`에 고정 (읽기 전용, SHA256SUMS)
- 315°는 45°를 좌우 반전 (머리와 같은 방식)
- 앞뒤 대칭 재사용(0°↔180°, 45°↔135°)은 **아직 확정하지 않음**. 실제 180° 그림으로 연결면·명암을 확인한 뒤 정합니다.
- 겹침 거리: 0.10칸 (잠정)
- 그리는 순서: 고정하지 않고 화면 앞뒤(깊이) 기준
- 90°: 1차 요청분(`received_body_090_request.png`)은 정면으로 그려져 반려. 다시 받습니다.

## 6. 받은 뒤 확인하는 것

- 0°를 먼저 받아 **승인된 머리 0°·180°와 나란히** 놓고, 폭·높이·배 띠 높이·비늘판 크기를 비교합니다.
- 0° 승인 후 나머지 4장을 받아 5방향 정렬, 45~50px 축소 비교, 판 위 장면을 확인합니다.
  - 판 위 장면: 직선, 90° 꺾기, 계단 꺾기에서 머리+몸통을 확인합니다. 꼬리는 아직 임시 블록입니다.
- 게임의 이동 경로와 회전 타이밍은 바꾸지 않습니다. 그림만 바꿉니다.
