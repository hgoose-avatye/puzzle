# 악어 꼬리 스프라이트 사양

3칸 악어의 마지막 칸입니다. 승인된 머리(`head-approved/`)와 몸통(`body-approved/`) 뒤에 붙습니다.
시점·배율·조명·바닥 중심·파일 형식은 머리 사양(`SPEC.md`)과 같습니다. 이 문서는 꼬리에서 달라지는 점만 적습니다.
**지금 단계는 0° 한 장입니다.** 0°를 머리·몸통과 이어 붙여 확인한 뒤 나머지 방향으로 넘어갑니다.

## 1. 모양

- **앞면 (몸통과 붙는 면):** 승인된 몸통의 뒷면과 **같은 폭(0.92칸)·높이·모서리 둥글기**의 평평한 쿠션 면
- **실루엣:** 앞에서 뒤로 갈수록 폭과 높이가 **조금씩** 줄어드는 쿠션형 블록. 뒤쪽 끝 폭은 앞의 약 60~70%
- **꼬리 끝:** 짧고 둥근 악어 꼬리 끝. 뾰족하거나 길게 뻗지 않습니다.
- **비늘판:**
  - 몸통과 같은 크기·색·간격의 네모 비늘판 2열로 시작해서, 뒤로 가며 작아지거나 1열로 줄어듭니다.
  - 첫 줄은 몸통 비늘판 줄과 한 줄로 이어지게 합니다.
- **배 띠:** 몸통과 같은 높이·두께의 연두색 띠가 꼬리 끝까지 이어집니다.
- **뒷다리:** 앞쪽 절반 양옆 아래에 짧고 뭉툭한 다리 2개. 머리 앞다리와 같은 모양·크기
  - 지금 게임의 3칸 악어는 머리 칸에 앞다리, 꼬리 칸에 뒷다리가 있습니다.
  - 빼려면 결정해 주세요.
- **넣지 않는 것:** 얼굴, 눈, 주둥이, 볼 무늬

## 2. 1칸 점유와 연결 기준점

게임 규칙은 그대로입니다. 꼬리는 바닥 칸 하나를 차지하고, 그림만 바뀝니다.

| 기준 | 값 (1024 캔버스, 칸 1개 = 512px) |
|---|---|
| 꼬리 칸 바닥 중심 | (512, 640). 모든 방향 공통 |
| 앞면(몸통 쪽) 위치 | 바닥 중심에서 나아가는 방향으로 약 0.49칸 |
| 꼬리 끝 위치 | 바닥 중심에서 뒤로 0.5칸 이내. 칸 밖으로 0.1칸 이상 나가지 않게 |
| 몸통과의 간격 | 블록 중심 사이 1칸. 그릴 때 0.10칸 겹침(잠정) 적용 |

- 0°에서는 앞면이 화면 아래(카메라 쪽), 꼬리 끝이 화면 위를 향합니다.
- 뒤로 짧게 줄어드는 모양이라, 0°에서는 앞면과 윗면이 주로 보이고 꼬리 끝은 위쪽에 짧게 보입니다.

## 3. 방향별 이미지

| 각도 | 파일명 | 만드는 방법 |
|---|---|---|
| 0° | `received-tail/received_tail_000.png` | 그림 (이번 단계) |
| 45° · 90° · 135° · 180° | `received-tail/received_tail_045.png` 등 | 0° 승인 후 그림 |
| 225° · 270° · 315° | | 135° · 90° · 45° 좌우 반전 |

- 꼬리는 앞(이음면)과 뒤(꼬리 끝)가 달라서 몸통처럼 앞뒤 재사용을 할 수 없습니다. 그래서 0°~180° 5장이 필요합니다.
- 한 장에 한 방향, PNG, 1024×1024, 투명 배경, 바닥 그림자 없음

## 4. 0° 요청문 (GPT용)

승인된 머리 0°, 몸통 0°·90°, 밑그림 `guide_head_58deg.png`를 첨부하세요.

> TAIL block (the last block) of the same clay-toy crocodile as the attached approved head and body images: same green, same soft clay material, same 58° top-down orthographic camera with no yaw, same top-front symmetric light, same scale.
> Its front face, where it joins the body, is a plain flat cushion face exactly as wide and as tall as the attached body block, with the same rounded edges. From there the cushion-shaped block gently narrows and lowers toward the back, ending in a short, rounded crocodile tail tip (about 60–70% of the front width; not pointed, not long). The whole block stays inside one floor cell.
> Scute plates on top: start with 2 columns of the same size, colour and spacing as on the body, getting smaller toward the tip.
> The lime-green belly band runs at the same height and thickness as on the body, all the way to the tip.
> Two short stubby hind legs under the sides of the front half, the same shape and size as the front legs of the attached head.
> No face, no eyes, no snout, no cheek spots.
> View 0°: the front face (body side) toward the camera at the bottom of the image, the tail tip pointing away, up the screen.
> Transparent background, one view only, 1024×1024, the floor centre of its cell at pixel (512, 640), one cell 512 px wide (follow the attached guide). No ground shadow.

## 5. 받은 뒤 확인하는 것

- 몸통 0°와 같은 변환으로 놓고 앞면 폭·높이·배 띠 높이·비늘판 크기를 몸통과 비교합니다.
- 머리+몸통+꼬리를 직선으로 이어 48px(3x·1x)에서 확인합니다. 0.10칸 겹침, 화면 깊이 순서입니다.
- 승인되면 나머지 4방향을 요청합니다.
