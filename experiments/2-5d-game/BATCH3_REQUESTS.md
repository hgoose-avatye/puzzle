# 배치 3 — 3칸 뱀·애벌레·닥스훈트 (2026-11-02)

각 종은 **머리 + 몸통 + 꼬리** 세 칸입니다(악어 방식). 몸통은 앞뒤 대칭이라 0°·45°·90°만 그리면 됩니다.
이번 단계는 **머리 0° 세 장**입니다. 함께 승인한 뒤 나머지 방향을 한꺼번에 만듭니다.

## 1. 3칸 구조

| 블록 | 들어가는 것 | 이음면 |
|---|---|---|
| 머리 (앞 칸) | 얼굴, 귀·더듬이, 앞다리(닥스훈트·애벌레) | 뒷면: 장식 없는 평평한 쿠션 면 |
| 몸통 (가운데 칸) | 몸 무늬만. 얼굴·꼬리 없음, 앞뒤 대칭 | 앞뒤 모두 평평한 쿠션 면 |
| 꼬리 (뒤 칸) | 꼬리, 뒷다리(닥스훈트·애벌레) | 앞면: 평평한 쿠션 면 |

세 블록 모두 폭·높이·모서리·몸 색이 같고, 무늬는 이음면을 넘어 이어집니다.

## 2. 참고 이미지 (`experiments/2-5d-crocodile/assets/<종>/reference/`)

| 종 | 첨부 | 비고 |
|---|---|---|
| 닥스훈트 | `concept_sheet1_dachshund_4views.png`, `concept_sheet2_dachshund.png`, `concept_sheet3_dachshund.png` | 최종 콘셉트 있음. `artref09_dachshund_3cell.png`는 3칸 구조 참고용 |
| 뱀 | `artref09_snake_3cell.png` | 최종 콘셉트 없음. 블록 스타일 그림에서 특징만 가져와 점토 쿠션 스타일로 새로 그림 |
| 애벌레 | `artref09_caterpillar_3cell.png` | 위와 같음 |

모든 요청에 함께 첨부: 밑그림 `crocodile/guide_head_58deg.png`, 화풍 기준 `fox/approved/fox_head_000.png`(최근 승인 머리), 3칸 머리 기준 `crocodile/head-approved/crocodile_head_000.png`.

## 3. 공통 요청문 — head 0°

> HEAD block of a cute [SPECIES], in the same clay-toy family as the attached approved fox head: a soft, puffy cushion cube with large rounded edges, matte clay with a gentle sheen, big glossy round eyes. [SPECIES DESIGN]
> This is the FRONT block of a three-block animal (head, body, tail, like the attached crocodile head). The back face of this block, where the body block attaches, is a plain flat cushion face.
> Camera: orthographic, looking down at the floor at 58°, no yaw. View 0°: facing the camera, toward the bottom of the image.
> One soft key light from the top front, left-right symmetric; same light and scale as the attached fox head. No cast shadow on the ground.
> 1024×1024 PNG with a TRANSPARENT background (no black or white backdrop). One floor cell is 512 px wide, the floor centre at pixel (512, 640) (follow the attached guide); the block is about 0.9 cell wide. One view only.

| 종 | [SPECIES DESIGN] |
|---|---|
| 닥스훈트 | Match the attached dachshund concept exactly: warm brown body, cream muzzle and chest, long floppy brown ears hanging at both sides, small black nose, a blue collar. Two short stubby front legs with cream paws. |
| 뱀 | Green body with a pale yellow-green belly band along the bottom, a few lighter yellow-green diamond spots on the top, a small red forked tongue poking out under the mouth, small nostrils. No legs, no ears: the block rests directly on the floor. |
| 애벌레 | Pink body with lighter pink round spots, a round red nose, two short antennae on top ending in small red balls. Two short stubby pink legs at the front. |

48px에서 구별되는 점: 닥스훈트(갈색 + 늘어진 귀 + 파란 목걸이), 뱀(초록 + 빨간 혀, 다리 없음), 애벌레(분홍 반점 + 더듬이). 뱀은 악어(초록)와 헷갈리지 않게 주둥이 없이 둥근 머리와 혀로 구별합니다.

**받을 파일:** `<종>/received/<종>_head_000.png` — 이 대화에 보내 주시면 원본은 `delivered/`에 두고, 정규화한 사본만 `received/`에 넣습니다. 승인 전에는 approved에 등록하지 않습니다.

## 4. 나머지 방향 (0° 승인 후) — 배치 2에서 얻은 기준

- 낱장 1024 투명 PNG를 우선 받습니다. 시트로 받으면 배경이 투명이어야 하고, 조각마다 크기가 같아야 합니다.
- 옆모습(90°): 머리에는 **앞다리**, 꼬리에는 뒷다리를 그립니다(뱀은 다리 없음). 세 블록의 몸통 높이와 윗선을 맞춥니다. 같은 대화에서 머리 → 몸통 → 꼬리 순서로 만듭니다.
- 0°·180°: 뒤 블록이 앞 블록 위로 통째로 드러나지 않도록 보정합니다. 정면 그림은 윗면이 거의 보이지 않기 때문입니다. 보정은 매니페스트의 `offset`으로 하고, 렌더러가 회전 중에 서서히 줄입니다(배치 2 12절).
- 검증은 세 가지를 따로 봅니다. ① 부품 위치 튐 ② 부품 사이 배경 틈 ③ 방향별 PNG 전환에 따른 실루엣 변화. ③은 45~50px에서 허용 가능하면 추가 다듬기 없이 진행합니다.

## 5. 받은 시트와 결정 (2026-11-02)

- 받은 것: 3종 × 머리·몸통·꼬리 × 0°·90°·180° = 27조각 시트 1장. 원본은 `assets/_batch3/delivered_sheet_all.png`, 잘라낸 조각은 `<종>/delivered/*_cut.png`에 있습니다.
- 정규화 (`received/`):
  - 흰 배경, 라벨, 바닥 그림자를 지웠습니다.
  - 몸통 0° 폭을 0.88칸으로 맞췄고(×2.9~3.2), 발은 y=640에 두었습니다.
  - **시트의 90° 열은 왼쪽을 향해 그려져 있어서 좌우를 뒤집었습니다.**
- 디자인 확정:
  - 뱀: 녹색·크림색
  - 애벌레: 노란 머리, 초록 몸통, 노란 반점, 주황 더듬이 (최종 12종 통합 콘셉트를 따름. 계획서의 분홍 디자인은 폐기)
  - 닥스훈트: 갈색 몸통, 진한 갈색 윗면 허용. 다리는 머리 앞다리 2개, 몸통 0개, 꼬리 뒷다리 2개로 총 4개
- 0°·180° 연결: 배치 2와 같은 `offset` 방식(35%)을 씁니다. 값은 `_batch3/offsets_35.json`에 있습니다. 3칸이라 맨 뒤 블록의 보정이 0.9~1.24칸입니다.

### 닥스훈트 몸통 기준점 (anchor y=560)

- 몸통 0°·90°·180°의 anchor y는 510이 아니라 **560**입니다.
- 이 값은 실제 다리 위치가 아닙니다. **다리가 없는 몸통을 머리와 꼬리의 몸통선(다리 위)에 맞춰 놓기 위한 부품별 배치 기준점**입니다. 몸통 그림의 바닥은 다리 높이(약 50px)만큼 바닥 위에 떠서 그려집니다.
- 세 방향 모두 같은 값이라 회전 중에도 위치가 튀지 않습니다. 0°·180°의 정지 결과를 유지하려고 offset을 같은 양만큼 늘렸습니다(몸통 0°는 80→130, 180°는 169→219).
- 효과 (90° 이음부 실측): 몸통–꼬리 윗선 차이 7.8%→2.0%, 바닥선 차이 11.5%→1.8%.
- 뱀과 애벌레의 몸통은 510 그대로입니다. 뱀은 다리가 없고, 애벌레 몸통은 자기 다리가 있기 때문입니다.
