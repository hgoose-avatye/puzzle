# 이 폴더의 이력

- **v2 (불합격, 2026-11-02)** — 부품 시트 4장(`received-v2/`)을 `tools/dachshund_import.py`로 잘라 끝단을 평면화·압출한 실험본.
  연결부가 반복적으로 끊기고 몸통이 직사각형으로 보여 불합격. 파일은 커밋 `9ecfba0`에만 남아 있고 이 폴더에는 없음.
  원인: 부품이 모두 양끝이 닫힌 독립 블록(둥근 캡슐·식빵, 블록별 둥근 등 무늬)이고 시트 간 카메라 고도가 달랐음.
- **v3 (후보, 사용자 승인 대기)** — 통짜 3장(`received-v3/dachshund_full_{000,090,180}.png`, 녹색 단색 배경)을
  `tools/dachshund_full_import.py`로 실제 게임 셀 투영 기준(칸 폭 512/1.2 px, 깊이 ×sin58°)에서 잘라 만든 현재 파일들.
  정지 상태에서는 세 카드가 원본을 픽셀 단위로 그대로 재구성함(`preview.png`). 회전 중에는 잘린 끝(평면 절단면)이
  이웃 카드가 코너로 옮겨 간 몇 프레임 동안 노출됨.

`?art=candidate`로만 표시되며 기본 에셋 승격 전까지 승인된 다른 동물과 무관합니다.

- **v4 (승인, 2026-11-02)** — v3 9장 + 코너 조각 2장(`received-v3/dachshund_elbow_sheet.png`)을 `approved/`로 승격하고
  기본 매니페스트가 이를 사용합니다(`joints`로 회전 중 코너 칸을 채움, `spriteCards.ts`). `received/`의 원래 부품 그림은
  보존만 되고 쓰이지 않습니다.

- **v4 보류 → 색 변형 (2026-11-02, 현재)** — 다른 다칸 동물과 회전 문법을 맞추기 위해 통짜 분할 + elbow(v4)는 보류하고
  `held-v4-full-body/`로 옮겼습니다(기본 매니페스트에서 제외, 기록용). 2.5D의 닥스훈트 자리는 **애벌레의 색 변형**
  (`tools/recolour_variant.py`, 초록 68–150° → +120° 파랑)으로 채웁니다: `variant/`(received 변형), `candidate/`(애벌레
  candidate 변형 + extend.json), `dachshund.sprites.json` = 애벌레 매니페스트 사본. Classic 3D·레벨·규칙은 그대로이며
  `speciesFor`는 여전히 "dachshund"를 돌려줍니다. 애벌레 2.5D가 승인되면 같은 명령으로 변형본을 다시 만들면 됩니다.
