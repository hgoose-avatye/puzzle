# 배치 2 — 2칸 5종 머리 0° 요청문 (2026-11-01)

대상: 소 cow, 돼지 pig, 여우 fox, 호랑이 tiger, 허스키 husky. 각 종은 **머리 블록 + 꼬리 블록** 두 칸입니다.
이번 단계는 머리 0° 다섯 장입니다. 모두 함께 승인한 뒤, 나머지 25장(머리 90·180, 꼬리 0·90·180)을 한꺼번에 만듭니다.

## 1. 2칸 동물 구조 (머리만 따로 디자인하지 않기 위해)

콘셉트 시트-1의 4컷은 한 마리를 정면, 옆(두 칸 전체), 뒤(꼬리 블록), 뒤(꼬리)로 보여 줍니다. 그 한 마리를 두 칸으로 나눈 것이 게임의 블록입니다.

| 블록 | 들어가는 것 | 이음면 |
|---|---|---|
| 머리 (앞 칸) | 얼굴, 귀·뿔, 앞다리 2개, 몸 앞쪽 절반의 무늬 | **뒷면**: 장식 없는 평평한 쿠션 면 |
| 꼬리 (뒤 칸) | 몸 뒤쪽 절반의 무늬, 뒷다리 2개, 꼬리 | **앞면**: 장식 없는 평평한 쿠션 면 |

- 두 블록은 같은 폭·높이·모서리, 같은 몸 색입니다. 무늬(소 얼룩, 호랑이 줄무늬, 허스키 배 색)는 머리 뒷면에서 꼬리 앞면으로 이어지게 합니다.
- 꼬리 블록에는 얼굴이 없습니다.
- 게임 배율 1.2와 기준점 보정은 매니페스트가 맡습니다. 그림은 표준 틀(1024, 칸 512px, 바닥 중심 512·640)에 맞춥니다.

## 2. 받을 곳

`experiments/2-5d-crocodile/assets/<종>/received/<종>_head_000.png`
(cow, pig, fox, tiger, husky) — 이 대화에 보내 주시면 제가 넣습니다.

## 3. 첨부할 것

1. 그 종의 콘셉트: `assets/<종>/reference/concept_sheet1_<종>_4views.png`
2. 밑그림: `assets/crocodile/guide_head_58deg.png`
3. 화풍 기준: `assets/penguin/approved/penguin_single_000.png` (최근 승인본, 같은 생성 결과로 일관성 유지)

## 4. 공통 요청문 (종별 줄만 바꿔 넣기)

> HEAD block of a cute [SPECIES], matching the attached concept image (its first, front view) exactly, in the same clay-toy family as the attached penguin: a soft, puffy cushion cube with large rounded edges, matte clay with a gentle sheen, big glossy round eyes.
> This is the FRONT block of a two-block animal: [SPECIES FEATURES]. Two short stubby front legs at the front. The back face of this block (where the second block attaches) is a plain flat cushion face; no tail on this block.
> Camera: orthographic, looking down at the floor at 58°, no yaw. View 0°: facing the camera, toward the bottom of the image.
> One soft key light from the top front, left-right symmetric; same light and scale as the attached penguin. No cast shadow on the ground.
> 1024×1024 PNG, transparent background. One floor cell is 512 px wide, the floor centre at pixel (512, 640) (follow the attached guide); the block is about 0.92 cell wide. One view only.

## 5. 종별 특징 (콘셉트 시트-1 기준)

| 종 | [SPECIES FEATURES] 에 넣을 문장 |
|---|---|
| 소 cow | white body with large black patches, two short brown horns, small black ears, a big pink snout with two nostrils, brown rings around the eyes |
| 돼지 pig | all pink, two pointed pink ears, a big round pink snout with two nostrils, rosy cheeks |
| 여우 fox | bright orange, white cheeks, muzzle and chest, two big pointed ears with white insides, a small dark nose |
| 호랑이 tiger | yellow-orange with dark brown stripes on the head and back, two round ears with dark tips, a cream-white muzzle, a small dark nose |
| 허스키 husky | dark grey top with a white face mask and white muzzle, two pointed grey ears with white insides, a small black nose, rosy cheeks |

48px에서 서로 구별되는 점: 소(흰+검은 얼룩, 뿔), 돼지(전부 분홍, 큰 코), 여우(주황+흰 얼굴, 큰 귀), 호랑이(노랑+줄무늬), 허스키(회색+흰 가면).
여우·호랑이는 색이 가까우니 호랑이의 줄무늬와 여우의 흰 얼굴을 분명하게 그려야 합니다.

## 6. 0° 승인 후 (25장 한꺼번에)

- 머리 90°·180°
- 꼬리 0°·90°·180°

꼬리 요청문은 1절 표의 "꼬리" 행으로 만듭니다. 콘셉트의 3·4번째 컷(뒷모습, 꼬리)을 참고합니다.

## 7. 최종 첨부 목록 (머리 0°, 2026-11-01)

| 종 | 콘셉트 첨부 | 받을 파일 |
|---|---|---|
| 소 | `cow/reference/concept_sheet1_cow_4views.png`, `concept_sheet3_cow.png`, `concept_sheet3_cow_side.png` | `cow/received/cow_head_000.png` |
| 돼지 | `pig/reference/concept_sheet1_pig_4views.png`, `concept_sheet3_pig.png` | `pig/received/pig_head_000.png` |
| 여우 | `fox/reference/concept_sheet1_fox_4views.png` | `fox/received/fox_head_000.png` |
| 호랑이 | `tiger/reference/concept_sheet1_tiger_4views.png` | `tiger/received/tiger_head_000.png` |
| 허스키 | `husky/reference/concept_sheet1_husky_4views.png`, `concept_sheet3_husky_game.png` | `husky/received/husky_head_000.png` |

(경로는 `experiments/2-5d-crocodile/assets/` 아래) 모든 요청에 밑그림 `crocodile/guide_head_58deg.png`과 화풍 기준 `penguin/approved/penguin_single_000.png`도 첨부합니다.
받은 그림은 사용자 승인 전까지 `received/`에만 두고 등록하지 않습니다.

## 8. 머리 0° 승인 (2026-11-01)

| 종 | 정규화 배율 (1254 원본 → 1024 틀) | 기준점 (그림별) |
|---|---|---|
| cow | ×1.10 | (512, 510) |
| pig | ×1.18 | (512, 510) |
| fox | ×1.08 | (512, 510) |
| tiger | ×1.06 | (512, 510) |
| husky | ×1.11 | (512, 510) |

- 다섯 종 모두 폭 0.90칸(승인 펭귄과 같음), 발 y=640, 기준점은 발에서 0.3칸 뒤(-130px)입니다.
- 원본은 `delivered/`에 그대로 두었습니다. 정규화 기록은 `assets/<종>/normalize.json`에 있습니다.
- 배율은 시작점일 뿐이고, 나머지 그림은 블록 폭·높이를 실측해서 맞춥니다.
- 꼬리가 아직 없는 종은 게임에서 3D로 표시됩니다. 모든 부품이 갖춰진 종만 카드로 그립니다.

## 9. 옆모습 10장 요청문 (head_090, tail_090)

**첨부:** 그 종의 승인 `approved/<종>_head_000.png`, 콘셉트 4컷 `reference/concept_sheet1_<종>_4views.png`, 밑그림.
같은 대화에서 head_090 → tail_090 순서로 만들면 두 블록의 크기·색이 맞기 쉽습니다.

### 공통 — head_090
> The HEAD block of the attached [SPECIES] (same character, colours, clay material, size and light as the attached approved front view), turned on the floor so it faces RIGHT; the camera does not move (orthographic, 58° down, no yaw). Side view like the second picture of the attached concept, but ONLY the front block: face, ear and front leg on the right, the block's back face on the left is a plain flat cushion face where the second block attaches (no tail, no body behind it). Block about 0.9 floor cell long left to right and the same height as the front view. [SPECIES 90° DETAILS] Same top-front symmetric light; no cast shadow. 1024×1024 PNG, transparent background, feet on the same line and the same size as the attached front view. One view only.

### 공통 — tail_090
> The TAIL block (rear half) of the same [SPECIES], seen from the side, facing RIGHT; it attaches behind the head block of the attached head 90° image and must continue it exactly: same height, same width of the joint face, same colours and markings carried across the joint. The front face on the right is a plain flat cushion face (where the head block attaches); no face, no eyes. One hind leg at the back bottom, [SPECIES TAIL]. Block about 0.9 floor cell long. Same camera (orthographic, 58° down, no yaw), same light, transparent background, 1024×1024, feet on the same line as the head 90° image. One view only.

| 종 | [SPECIES 90° DETAILS] | [SPECIES TAIL] |
|---|---|---|
| cow | one brown horn and black ear, pink snout at the right end, black patches on the side | black patches continuing from the head, a thin white tail with a black tuft rising from the back |
| pig | one pointed pink ear, big round snout at the right end | a small curly pink tail on the back |
| fox | one big pointed ear, white muzzle pointing right, white chest | a big bushy orange tail with a white tip curving up from the back |
| tiger | one round ear, cream muzzle at the right, brown stripes on the side | brown stripes continuing across the joint, a striped tail rising from the back |
| husky | one pointed grey ear, white mask and muzzle at the right | white belly line continuing, a fluffy grey tail with a white tip curled over the back |

**받을 파일:** `<종>_head_090.png`, `<종>_tail_090.png` × 5종 → 이 대화에 보내 주시면 `delivered/`에 보존 후 정규화합니다.

## 10. 연결부 기준과 검증

**기준 (실측):** 두 블록의 높이·윗선 차이는 칸의 5% 이내로 맞춥니다. 이음면 쪽 외곽선 높이와 색·무늬도 이어지고, 발 기준점이 같아야 합니다.

**검증 순서:**
1. `import_species.py check <종> --cells 2 --partial`
2. 머리 90°와 꼬리 90°를 1칸 간격(겹침 0)으로 붙인 48px 옆모습 시트 (5종)
3. 실제 게임에서 그 종이 나오는 레벨을 Classic 3D와 나란히 캡처

## 11. 옆모습 결과와 결정 (2026-11-01)

- 받은 시트 두 장: v1 `_batch2/delivered_sheet_090_heads_tails.png`, v2 `_batch2/delivered_sheet_090_heads_tails_v2.png` (둘 다 원본 보존)
- 48px 비교: `batch2-side-48px.png`, `batch2-side-48px-v1-v2.png`
- **v1 채택.** v2는 블록이 길어 겹침이 0.25~0.37칸으로 늘었습니다(v1은 0.07~0.25칸). v2 정규화본은 `<종>/received_v2/`에 남아 있지만 쓰지 않습니다.
- v1 꼬리 90° 5장: 문제 없음 (발 y=640, 색·무늬 이어짐).
- v1 머리 90° 5장: 앞다리가 없고, 몸통 윗선이 꼬리보다 칸의 9~10% 높습니다(기준 5%). **사용자가 이 상태 그대로 채택했습니다.** 재요청하지 않습니다.
- 승인 등록 (2026-11-01): `<종>/approved/<종>_head_090.png`, `<종>_tail_090.png` × 5종, 기준점은 모두 (512, 510), `--partial`
- 남은 15장: 머리 180°, 꼬리 0°·180°. 승인된 v1 90°와 0°를 첨부해 만듭니다. 몸통 높이는 v1 꼬리 90°에 맞춥니다.

## 12. 0°·180° 연결 보정과 회전 튐 수정 (2026-11-02)

- 승인: 머리 180°, 꼬리 0°·180° 15장 (`approved/`, SHA256SUMS). 5종 모두 `scale: 1.2`, `tuck: 0`.
- 매니페스트에서 실제 발 위치(`anchor`, 모두 512·510)와 연결 보정(`offset`, 그림 px, y는 아래 방향)을 분리했습니다.
  보정은 `tail` 0°와 `head` 180°에만 있습니다. 값은 35% 정지 결과와 같습니다.

| 종 | tail 0° offset | head 180° offset |
|---|---|---|
| cow | 240 | 92 |
| pig | 283 | 131 |
| fox | 305 | 113 |
| tiger | 265 | 117 |
| husky | 305 | 96 |

- 렌더러(`spriteCards.ts`)는 offset × `offsetWeight`를 적용합니다. 그림 방향과 실제 연속 각도가 같으면 1이고, 다음 그림으로 바뀌는 각도(45°)에서는 smoothstep으로 0이 됩니다. 그래서 그림이 바뀌는 순간 위치가 튀지 않습니다. 그림 선택 규칙(`nearestSprite`)은 바꾸지 않았습니다.
- 검증: `tools/sprites.compare.ts`(5종, 0.1° 간격으로 360° 연속성 확인 + 정지 위치 + 그림 선택), 게임 캡처 `batch2-offset-before-after.png`, `batch2-offset-stills-before-after.png`.
- 등록 도구는 이미 승인된 그림의 항목을 다시 쓰지 않으므로 offset이 유지됩니다. 도구에 `--offset` 옵션을 추가하는 일은 별도 작업으로 남깁니다.

### 결과 구분과 알려진 한계 (Known Limitation)

| 항목 | 상태 |
|---|---|
| 부품 위치 튐 (꼬리 0°↔90° 0.56~0.71칸, 머리 180°↔90° 0.22~0.31칸) | **해결** (전환 각도에서 보정 0) |
| 부품 사이 배경 틈 | 회전 중에도 없음 |
| 정지 화면 35% 연결 보정 | 유지 |
| 테스트 | 게임 209/209, 스프라이트 40/40, 등록 도구 21/21 |
| **방향별 PNG 전환에 따른 실루엣 변화** | **남아 있음 — 알려진 한계** |

- 증상: 여우 꼬리 0°→90° 전환 장면(`out-batch2/fixed-fox-0-90-18`, `-19`)처럼, 머리와 꼬리가 서로 다른 방향의 그림을 쓰는 동안 몸통이 잠깐 접히거나 짧아 보입니다.
- 원인: 위치(anchor/offset) 문제가 아니라, 서로 다른 방향의 PNG로 바뀌면서 생기는 형태 차이입니다. 위치 튐과는 별개입니다.
- 판정: 실제 게임 크기(45~50px)에서는 허용 가능합니다. 이를 고치기 위한 이미지 재생성이나 새 애니메이션 시스템 개발은 하지 않습니다.
- 다시 검토하는 조건: 실제 모바일 플레이 테스트에서 시각적으로 심하게 거슬리거나, 플레이어가 동물이 차지한 칸을 잘못 이해하는 문제가 발견될 때만.
- 승인된 2칸 동물 PNG 30장(5종 × 6장)은 바꾸지 않습니다.

**배치 2 완료 (2026-11-02).** 배치 3부터는 다음 세 가지를 따로 검증합니다. ① 부품 위치 튐 ② 부품 사이 배경 틈 ③ 방향별 PNG 전환에 따른 실루엣 변화. ③은 45~50px에서 허용 가능하면 추가 다듬기 없이 진행합니다.
