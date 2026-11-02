# Classic 3D / Illustrated 2.5D 이중 렌더링 (설계안, 2026-11-01)

코드베이스는 하나입니다. **동물을 그리는 방식만** 모드에 따라 바뀝니다.

## 1. 공유하는 것 (두 모드 같음)

| 영역 | 코드 |
|---|---|
| 레벨 180개, 생성기, 난이도 곡선 | `src/curve`, `src/generator` |
| 규칙: 이동·충돌·탈출·하트·폭탄 | `src/core`, `src/game` (`flow`, `traffic`, `smooth`) |
| 동물 종 판별 | `game/animals.ts` `speciesFor` |
| 이동 연출: 트랙 위치·달리기·문 통과·흔들림·배지 | `game/animals.ts` `PieceView` |
| 판·카메라·장애물·배경·효과·UI·사운드 | `game/stage.ts`, `scenery`, `plaza`, `fx`, `main.ts`, `index.html` |
| 저장·진행 상태 | `localStorage` 키들 (모드와 무관하게 한 벌) |
| 입력·터치 판정 | `game/main.ts` `pick` (블록 그룹에 레이캐스트, 카드에도 그대로 맞음) |

## 2. 달라지는 것

| 모드 | 동물 블록 하나 |
|---|---|
| Classic 3D | `game/blocks.ts` `buildAnimal` (3D 블록 모델) |
| Illustrated 2.5D | `spriteCards.ts` `buildAnimal`: 매니페스트가 있는 종은 카메라를 향한 이미지 카드 |

두 `buildAnimal`은 같은 모양의 블록(root > animated > 내용)을 돌려줍니다. 그래서 `PieceView`와 나머지 코드는 어떤 모드인지 모릅니다.

## 3. 모드 선택

- 개발 단계: `?render=3d` / `?render=25d`
- 지금 실험에서는 진입점 설정(`experiments/2-5d-game/vite.config.ts`)이 `game/animals.ts`의 `./blocks` 연결 하나만 바꿉니다. 게임 파일은 그대로입니다.
- 실제 게임에 넣을 때는 `game/animals.ts`가 모드에 따라 두 `buildAnimal` 중 하나를 고르는 몇 줄로 바뀝니다. 모드는 설정 하나이고, 진행 상태는 따로 두지 않습니다.

## 4. 2.5D 그림이 없는 종

- **개발 중:** 3D 모델로 임시 표시하고, 빠진 종을 알립니다.
  - 콘솔 출력
  - `window.__cards.missingSpecies()`
- **출시 전:** 빠진 종이 0이어야 2.5D 모드를 켭니다. 빠진 종이 있으면 빌드 검사가 실패하게 하는 방안을 제안합니다.

## 5. 카드 크기

- 매니페스트에 종별 `scale`(선택)을 둡니다.
- 비교용으로 `?cardScale=`가 그 값에 곱해집니다.
- 발 기준점은 바닥에 고정한 채 위·옆으로 커집니다.
- 비교: `out-scale/scale-390x844.png`, `scale-360x640.png` (×1.0 / ×1.2 / ×1.4)
