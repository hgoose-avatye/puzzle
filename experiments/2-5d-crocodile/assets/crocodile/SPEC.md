# 악어 머리 스프라이트 사양 (5방향)

이 사양으로 그린 이미지는 2.5D 악어 프로토타입(`experiments/2-5d-crocodile/`)의 머리 블록으로 바로 씁니다.
게임판 위에서 블록 하나는 화면 폭 약 45~50px로 보입니다.

## 1. 파일

| 각도 | 파일명 | 머리(주둥이)가 향하는 쪽 |
|---|---|---|
| 0° | `head/crocodile_head_000.png` | 화면 아래 (카메라를 봄) |
| 45° | `head/crocodile_head_045.png` | 화면 오른쪽 아래 |
| 90° | `head/crocodile_head_090.png` | 화면 오른쪽 |
| 135° | `head/crocodile_head_135.png` | 화면 오른쪽 위 |
| 180° | `head/crocodile_head_180.png` | 화면 위 (뒤통수를 봄) |

나머지 3방향(225°, 270°, 315°)은 135°·90°·45°를 좌우 반전해서 씁니다. 그래서 **조명이 좌우 대칭**이어야 합니다(5절).

- PNG, RGBA, **1024 × 1024 px**, **투명 배경**
- 바닥 그림자 없음 (게임이 따로 그립니다)
- 잘라내지 말고 1024 캔버스 그대로 둡니다. 위치 기준(3절)이 모든 파일에서 같아야 하기 때문입니다.

## 2. 디자인 (최종 콘셉트 시트-2·3 기준)

- **덩어리:** 부드럽게 부푼 쿠션형 큐브. 큰 둥근 모서리, 면 가운데가 살짝 볼록
- **눈:** 머리 윗면 앞쪽에 크고 둥근 눈 2개. 흰자, 짙은 홍채, 큰 하이라이트. 눈두덩이 살짝 솟아 있음
- **주둥이:** 앞으로 둥글게 나온 주둥이. 콧구멍 2개
- **입:** 입선을 따라 흰 이빨이 양쪽에 2~3개씩 보임. 아래턱은 연두색
- **비늘판:** 머리 뒤쪽 윗면에 둥근 네모 비늘판 1줄(2개). 시트-1의 둥근 돌기는 쓰지 않음
- **다리:** 머리 블록 뒤쪽 양옆에 짧고 뭉툭한 앞다리
- **이음면:** 뒤쪽 면(몸통과 맞닿는 면)은 장식 없는 평평한 쿠션 면. 목이 뚫리거나 잘린 단면이 보이면 안 됨
- **재질:** 말랑한 점토 또는 부드러운 플라스틱. 은은한 반사, 눈만 강한 광택

**색 (시트-3에서 측정)**

| 부위 | 색 |
|---|---|
| 몸 기본 | #259F36 |
| 빛 받는 윗면 | #48C754 |
| 비늘판·그늘 | #0A6A1C |
| 배·아래턱 | #9BB16A |

## 3. 시점·배율·위치 (모든 파일 공통, 가장 중요)

`guide_head_58deg.png`를 밑그림으로 쓰세요.

- **카메라:** 바닥을 **58°** 내려다보는 직교(원근 없는) 시점. 좌우 회전 없음
  - 바닥 칸의 가로선은 화면 수평, 세로선은 화면 수직입니다.
  - 칸이 마름모로 보이면 안 됩니다. 병아리 시트의 58° 줄은 마름모라 그대로 쓸 수 없었습니다.
- **배율:** 바닥 칸 한 개 = 가로 **512px**, 세로 **434px** (512 × sin 58°)
- **위치 기준:** 머리 블록이 서 있는 칸의 바닥 중심 = **(512, 640) px**
- **크기:** 몸 덩어리는 칸 안에 들어오는 폭 약 0.9칸(약 460px), 높이 약 0.6칸
  - 주둥이는 앞쪽으로 0.15칸 정도까지만 칸 밖으로 나와도 됩니다.
  - 5방향 모두 **같은 캐릭터를 같은 크기로 돌려 놓은 것**이어야 합니다.

## 4. 각도 정의

캐릭터가 바닥 위에서 제자리 회전한다고 보고, 카메라는 고정입니다.
- 0°: 얼굴 정면이 카메라를 봅니다.
- 90°: 오른쪽 옆모습입니다.
- 180°: 뒤통수입니다.
- 45°·135°: 그 사이의 대각선입니다.

## 5. 조명

- 위쪽 정면에서 오는 부드러운 주광 1개. **좌우 대칭**이어야 반전한 3방향이 어색하지 않습니다.
- 약한 하늘색 반사광은 괜찮습니다.
- 5장 모두 **같은 조명**이어야 합니다. 방향마다 빛을 새로 잡으면 회전할 때 밝기가 튑니다.

## 6. 이미지 생성 요청문 예시 (GPT 이미지 생성용)

방향마다 따로 요청하면 캐릭터가 달라지기 쉽습니다. 먼저 0° 한 장으로 캐릭터를 확정한 뒤, 그 이미지를 첨부해서 나머지 방향을 요청하세요.

> Cute clay-toy crocodile HEAD block for a mobile puzzle game, matching the attached concept sheet style (square scute plates, NOT round bumps).
> A soft, puffy cushion-shaped cube with large rounded edges and slightly bulging faces; two big glossy round eyes on the top front with raised brows;
> a rounded snout sticking forward with two nostrils; small white teeth along the mouth line; lime-green lower jaw (#9BB16A);
> body green #259F36, lit top #48C754, scute plates #0A6A1C; one row of two rounded square scute plates on the back of the head; short stubby front legs at the back sides.
> The back face (where the body attaches) is a plain flat cushion face. Soft matte clay material, gentle sheen, eyes glossy.
> Camera: orthographic, looking down at the floor at 58 degrees, NO yaw (floor grid lines horizontal and vertical on screen).
> The head is rotated to face [0°: straight toward the camera / 45°: down-right / 90°: right / 135°: up-right / 180°: away from the camera].
> Single soft key light from the top front, left-right symmetric. No cast shadow on the ground. Transparent background, 1024×1024,
> the floor centre of its cell at pixel (512, 640), one floor cell 512 px wide. Same size and lighting as the attached 0° image.

## 7. 받은 뒤 확인하는 것

`python3 experiments/2-5d-crocodile/tools/head_check.py`가 자동으로 확인합니다.

**자동 확인**
- 파일 5개, 1024×1024, 투명 배경
- 위치 기준과 크기가 5장에서 일치하는지 (밑그림 칸 윤곽을 겹친 정렬 시트로 확인)
- 0°·180°의 좌우 밝기 대칭 (반전 가능 여부)

**결과물**
- 실제 게임 크기(45·48·50px)에서 콘셉트 시트-3 악어, 병아리와 나란히 놓은 비교 시트
- 반전한 225°·270°·315° 미리보기
- 프로토타입 8방향 회전에 넣은 시험 서버와 꺾임 GIF
