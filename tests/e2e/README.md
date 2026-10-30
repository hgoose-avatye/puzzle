# 브라우저 검증 (실제 게임 화면)

```bash
npm run test:e2e
```

게임의 Vite 서버를 직접 띄우고, 헤드리스 Chrome으로 [p0-checks.mjs](p0-checks.mjs)(규칙·입력·이동 37개)와 [flow-checks.mjs](flow-checks.mjs)(메인 화면 → 플레이 → 성공·실패 → 다음·다시·처음으로 15개)를 돌린 뒤 서버와 브라우저를 모두 닫습니다.
`npm test`(vitest)에는 들어 있지 않습니다. 약 45초 걸립니다.

## 필요한 것

- Node.js와 `npm install`(개발 의존성 `puppeteer-core`를 씁니다. 브라우저는 내려받지 않습니다)
- 설치된 Chrome 또는 Chromium. 다음 순서로 찾습니다: 환경 변수 `CHROME_PATH`, macOS 기본 위치, `/usr/bin/google-chrome(-stable)`, `/usr/bin/chromium(-browser)`, Windows 기본 위치
- 따로 켜 둔 개발 서버는 필요 없습니다. 이미 `npm run dev:game`(5200)이 켜져 있어도 겹치지 않습니다

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `CHROME_PATH` | 자동 탐색 | Chrome 실행 파일 경로 |
| `E2E_PORT` | 5299 | 게임 서버 포트. 사용 중이면 다음 빈 포트를 씁니다 |
| `E2E_TIMEOUT_MS` | 300000 | 전체 실행 제한 시간. 넘으면 정리하고 종료 코드 2 |
| `E2E_SHOTS` | 없음 | 폴더 경로를 주면 폭탄 경고 막대 스크린샷(`bomb-bar-at-1.png`)을 저장합니다 |
| `CI` | 없음 | 값이 있으면 Chrome에 `--no-sandbox --disable-dev-shm-usage`를 붙입니다(컨테이너용) |

## 결과 읽기

- 줄마다 `PASS`, `FAIL`, `SKIP`, `INFO`가 붙고, 끝에 `52 PASS · 0 FAIL · 0 SKIP`처럼 합계와 실패 목록을 출력합니다.
- `SKIP`: 그 실행에서는 판정할 수 없었던 검사입니다. 예를 들어 R1 터치 두 번 탭은 두 탭이 페이지에 400ms 넘게 벌어져 도착하면 SKIP입니다. 실패로 치지 않지만 계속 나오면 원인을 봐야 합니다.
- 한 장면이 예외로 멈추면 `(scenario crashed)` FAIL 하나로 기록하고 다음 장면으로 넘어갑니다.

| 종료 코드 | 뜻 |
|---|---|
| 0 | 모두 통과(SKIP 허용) |
| 1 | 검사 하나 이상 실패 |
| 2 | 시작하지 못함(Chrome 없음 등), 제한 시간 초과, Ctrl+C·SIGTERM으로 중단 |

## 정리

정상 종료, 실패, 시간 초과, Ctrl+C·SIGTERM 어느 경우에도 브라우저를 먼저 닫고 서버를 닫은 뒤 끝납니다.
`kill -9`처럼 강제로 죽이면 정리할 기회가 없으니 그때는 `lsof -iTCP:5299`와 Chrome 프로세스를 직접 확인하세요.

## CI

어느 CI에서든 Node, Chrome, `npm ci`가 있으면 `CI=1 npm run test:e2e`로 돌릴 수 있게 만들었습니다. CI 서비스 설정 파일은 아직 추가하지 않았습니다.

## 테스트 전용 진입 경로는 개발 서버에서만

- 이 검사와 실기기 체크리스트가 쓰는 진입 경로(`?demo=cross`·`?demo=bomb` 같은 `?demo=…`, `?level=N`, `?dev`, `?raw`, `?theme`, `?stage`)와 `window.__game`·`window.__runSpeed`는 **Vite 개발 서버에서만** 동작합니다(`import.meta.env.DEV`).
- 배포 빌드(`npm run build:game`)에서는 주소의 파라미터를 무시하고 저장된 진행 레벨로 시작합니다. 훅도 번들에서 빠집니다.
- 그래서 이 검사는 배포 빌드가 아니라 개발 서버를 대상으로 돌립니다.
- 확인한 방법:
  1. `npm run build:game` 후 `game/dist/assets/*.js`에서 `__game`, `__runSpeed`가 0건임을 확인했습니다.
  2. `vite preview`로 `?demo=bomb`, `?level=124`, `?dev&demo=cross&raw`를 열어, 모두 레벨 1이 열리고 훅이 없으며 "다음" 버튼이 숨겨져 있음을 확인했습니다.

## 검사를 고칠 때

- 게임 상태는 [game/main.ts](../../game/main.ts) 맨 끝의 테스트용 훅 `window.__game`으로 읽습니다.
- 검사가 기대하는 동작은 [docs/rules.md](../../docs/rules.md)에 있습니다. 규칙을 바꾸면 명세, 이 검사, [flow.test.ts](../../src/game/flow.test.ts)를 함께 고칩니다.
- 시간에 따라 흔들리는 검사는 판정할 수 없을 때 SKIP으로 처리하고, 시간과 무관한 검사를 따로 둡니다(R1 참고).
