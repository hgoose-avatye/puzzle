# 퍼즐 코어·생성기 첫 결과물 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면과 무관한 TypeScript 코어(규칙, 시뮬레이션), 솔버와 난이도 지표, A 단계(직선 막대) 레벨 생성기, 확인용 뷰어, 광고 목업 인터페이스를 만든다.

**Architecture:** 규칙은 순수 함수로만 구성하고(화면, 타이머, 광고를 모름) 솔버, 생성기, 뷰어가 그 위에 얹힌다. 레벨은 역방향 배치로 만들어 풀이 가능성을 구조로 보장하고, 지표를 계산해 목표 구간에 든 후보만 채택한다.

**Tech Stack:** TypeScript, Vitest(테스트), Vite(뷰어 빌드). 설정 파일 외에 런타임 의존성은 없다.

**Spec:** [docs/superpowers/specs/2026-10-29-puzzle-core-generator-design.md](../specs/2026-10-29-puzzle-core-generator-design.md)

## Global Constraints

- 웹 기반 TypeScript. 코어는 화면, 타이머, 광고를 알지 못한다. (spec 3.5, 5.1)
- 평면 격자, **순수 제거형**: 조각을 탭하면 머리 방향으로 판 밖으로 나가 사라지고, 길에 다른 조각이 있으면 막힌다. 막힌 조각은 움직이지 않는다. (spec 3.1)
- 조각 = 격자 셀 목록. **`cells[0]`이 머리**이고 나가는 방향은 `cells[1]`에서 `cells[0]`으로 향하는 방향이다. (spec 5.2)
- A 단계: 직선 막대, 길이 2~5칸, 상하좌우 4방향. 대각선 없음. (spec 3.2, 5.5)
- 판 크기는 12×12 이하, 조각 수는 약 8~25개를 기준으로 한다. (spec 5.5, 시험으로 조정)
- 난이도 출발값: 라운드 수 초반 2~5, 후반 10~15. (spec 5.6)
- 광고 인터페이스: `showRewarded(placement): Promise<'completed'|'skipped'|'failed'>`, `showInterstitial(placement): Promise<void>`. (spec 5.7)
- 문(출구 표시)은 레벨 데이터에 저장하지 않고 조각에서 자동 계산한다. (spec 3.9)
- 범위 밖: B/C 단계 생성기, 곡선 기반 대량 생성, 부딪힘 변주, 고정 장애물, 최종 화면·이펙트·에셋. (spec 2, 6)

## Review Focus

설계 문서가 말하지 않았지만 사용자가 부딪힐 만한 입력이다. 각 줄의 테스트는 해당 태스크에 들어 있다.

1. 셀이 판 밖이거나 겹치거나 이어지지 않은 레벨, 길이 1짜리 조각 → 솔버가 죽지 않고 `validateLevel`이 이유를 돌려준다 (Task 2).
2. 서로 마주 보고 막은 두 조각처럼 풀 수 없는 레벨 → `solve`가 예외 없이 `solvable: false`와 갇힌 조각을 돌려준다 (Task 4).
3. 이미 나간 조각이나 없는 id를 탭 → 상태가 바뀌지 않고 `ignored` 이벤트를 돌려준다 (Task 3).
4. 불가능한 생성 조건(3×3 판에 조각 20개) → 무한 반복 없이 `null`을 돌려준다 (Task 5).
5. 조각이 0개인 빈 레벨 → 라운드 0으로 풀린 것으로 보고, 지표 계산에서 0으로 나누지 않는다 (Task 4).

## File Structure

```
package.json, tsconfig.json, vite.config.ts      # 설정 (Task 1)
src/core/types.ts        # Direction, Cell, Piece, Level
src/core/rng.ts          # 시드 난수
src/core/rules.ts        # 방향, 나가는 길, 막힘 판정, 레벨 검증
src/core/game.ts         # 탭 시뮬레이션 (불변 상태 + 이벤트)
src/solver/solver.ts     # 풀이 가능 판정, 라운드 분해
src/solver/metrics.ts    # 난이도 지표
src/generator/generate.ts# A 단계 역방향 배치, 목표 구간 채택
src/ads/AdService.ts     # 광고 인터페이스와 목업
viewer/index.html, viewer/main.ts, viewer/render.ts   # 확인용 뷰어
```
테스트는 소스 옆에 `*.test.ts`로 둔다.

---

### Task 1: 프로젝트 기반, 타입, 난수

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `src/core/types.ts`, `src/core/rng.ts`
- Test: `src/core/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Direction = 'up' | 'down' | 'left' | 'right'` (y는 아래로 증가하므로 `up`은 y-1)
  - `interface Cell { x: number; y: number }`
  - `interface Piece { id: number; cells: Cell[] }` (`cells[0]`이 머리)
  - `interface Level { width: number; height: number; pieces: Piece[] }`
  - `interface Rng { next(): number; int(min: number, max: number): number }` (`next`는 [0,1), `int`는 양끝 포함)
  - `createRng(seed: number): Rng`

- [ ] **Step 1: 브랜치와 도구 확인.** `git switch -c feat/puzzle-core`, `node -v`가 18 이상인지 확인.
- [ ] **Step 2: 설정 작성.** `npm init -y` 후 `npm i -D typescript vitest vite`. `package.json` 스크립트는 `test`(`vitest run`), `build`(`tsc --noEmit && vite build viewer`), `dev`(`vite viewer`). `tsconfig.json`은 `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`. `.gitignore`에 `node_modules`, `dist`.
- [ ] **Step 3: 실패하는 테스트 작성** (`rng.test.ts`)
  - 같은 시드로 만든 두 `Rng`의 `next()` 열 10개가 같다.
  - 다른 시드는 열이 다르다.
  - `int(2, 5)`를 1000번 뽑으면 모든 값이 2~5이고 2와 5가 모두 한 번 이상 나온다.
- [ ] **Step 4: 실패 확인.** Run: `npm test` / Expected: FAIL (`createRng` 없음)
- [ ] **Step 5: `types.ts`와 `rng.ts` 구현.** `createRng`는 mulberry32 계열 32비트 시드 생성기를 쓴다.
- [ ] **Step 6: 통과 확인.** Run: `npm test` / Expected: PASS
- [ ] **Step 7: 커밋.** `git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore src/core && git commit -m "chore: scaffold project, core types and seeded rng"`

---

### Task 2: 규칙 (방향, 나가는 길, 막힘, 검증)

**Files:**
- Create: `src/core/rules.ts`
- Test: `src/core/rules.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Direction`, `Cell`, `Piece`, `Level`.
- Produces:
  - `directionVector(d: Direction): Cell`
  - `headDirection(piece: Piece): Direction` (조각 길이가 2 미만이거나 `cells[0]`과 `cells[1]`이 인접하지 않으면 `Error` 발생)
  - `exitRay(level: Level, piece: Piece): Cell[]` (머리 다음 칸부터 판 안의 마지막 칸까지, 순서대로. 머리가 이미 가장자리를 향하면 빈 배열)
  - `exitCell(level: Level, piece: Piece): Cell` (머리와 `exitRay`를 이은 줄의 마지막 칸, 곧 문이 그려질 가장자리 칸)
  - `blockersOf(level: Level, piece: Piece, alive: ReadonlySet<number>): number[]` (`alive`에 있는 다른 조각 중 나가는 길의 칸을 차지한 id, 오름차순)
  - `canExit(level: Level, id: number, alive: ReadonlySet<number>): boolean`
  - `interface ValidateOptions { straightOnly?: boolean; minLength?: number; maxLength?: number }`
  - `validateLevel(level: Level, options?: ValidateOptions): string[]` (오류 메시지 목록, 정상이면 빈 배열)

- [ ] **Step 1: 실패하는 테스트 작성** (이름과 단언)
  - `headDirection` — 셀 `[(3,2),(2,2)]`는 `'right'`, `[(1,1),(1,2)]`는 `'up'`.
  - `exitRay` — 5×5 판에서 머리 (3,2) 방향 `right`면 `[(4,2)]`, 머리 (4,2) 방향 `right`면 `[]`.
  - `exitCell` — 위 두 경우 모두 `(4,2)`.
  - `blockersOf` — 나가는 길 위에 조각 B가 있으면 `[B]`, B가 `alive`에서 빠지면 `[]`.
  - `canExit` — 위 두 경우에 각각 `false`, `true`.
  - `validateLevel` — (Review Focus 1) 판 밖 셀, 두 조각이 같은 셀, 비인접 셀, 길이 1짜리 조각이 각각 오류를 돌려주고, 정상 레벨은 `[]`. `straightOnly`일 때 ㄱ자 조각은 오류. `minLength: 2, maxLength: 5` 밖 길이는 오류.
- [ ] **Step 2: 실패 확인.** Run: `npm test -- rules` / Expected: FAIL
- [ ] **Step 3: `rules.ts` 구현.** 위 시그니처를 그대로 구현한다. 방향은 `cells[0] - cells[1]`의 단위 벡터에서 구한다.
- [ ] **Step 4: 통과 확인.** Run: `npm test -- rules` / Expected: PASS
- [ ] **Step 5: 커밋.** `git add src/core && git commit -m "feat(core): exit ray, blockers and level validation"`

---

### Task 3: 탭 시뮬레이션

**Files:**
- Create: `src/core/game.ts`
- Test: `src/core/game.test.ts`

**Interfaces:**
- Consumes: Task 2의 `canExit`, `blockersOf`.
- Produces:
  - `interface GameState { readonly level: Level; readonly alive: ReadonlySet<number>; readonly taps: number; readonly blockedTaps: number }`
  - `type TapEvent = { type: 'exited'; id: number } | { type: 'blocked'; id: number; blockers: number[] } | { type: 'ignored'; id: number }`
  - `createGame(level: Level): GameState`
  - `tap(state: GameState, id: number): { state: GameState; event: TapEvent }` (상태는 불변. `exited`와 `blocked`만 `taps`에 센다)
  - `isCleared(state: GameState): boolean`

- [ ] **Step 1: 실패하는 테스트 작성.** 5×5 판, 조각 1 = `[(2,2),(1,2)]`(오른쪽 향함), 조각 2 = `[(4,2),(3,2)]`(오른쪽 향함).
  - 조각 1을 탭하면 `blocked`이고 `blockers`는 `[2]`이며, 반환된 상태의 `alive`는 그대로이고 `blockedTaps === 1`.
  - 조각 2를 먼저 탭하면 `exited`, 그다음 조각 1을 탭하면 `exited`이고 `isCleared`가 `true`, `taps === 2`.
  - (Review Focus 3) 이미 나간 조각이나 없는 id(99)를 탭하면 `ignored`이고 `alive`, `taps`가 그대로.
  - 원래 `GameState`는 탭 후에도 변하지 않는다(불변).
- [ ] **Step 2: 실패 확인.** Run: `npm test -- game` / Expected: FAIL
- [ ] **Step 3: `game.ts` 구현.** 새 `Set`을 복사해서 반환한다.
- [ ] **Step 4: 통과 확인.** Run: `npm test -- game` / Expected: PASS
- [ ] **Step 5: 커밋.** `git add src/core/game.ts src/core/game.test.ts && git commit -m "feat(core): immutable tap simulation with events"`

---

### Task 4: 솔버와 난이도 지표

**Files:**
- Create: `src/solver/solver.ts`, `src/solver/metrics.ts`
- Test: `src/solver/solver.test.ts`, `src/solver/metrics.test.ts`

**Interfaces:**
- Consumes: Task 2의 `canExit`, `blockersOf`; Task 3의 `createGame`, `tap`; Task 1의 `Rng`.
- Produces:
  - `interface SolveResult { solvable: boolean; rounds: number[][]; stuck: number[] }` (`rounds[i]`는 그 라운드 시작 시점에 나갈 수 있는 조각 id. `solvable`이 `false`면 `stuck`은 끝까지 못 나간 id)
  - `solve(level: Level): SolveResult`
  - `interface Metrics { pieceCount: number; rounds: number; roundSizes: number[]; initialFreeRatio: number; avgBlockers: number; surge: number }`
  - `computeMetrics(level: Level): Metrics` (풀 수 없으면 `Error` 발생)
  - `randomWasteRatio(level: Level, rng: Rng, trials?: number): number` (기본 `trials` 50)

**지표 정의:**
- `rounds` = `solve`의 라운드 수. 의존 그래프의 최장 사슬과 수학적으로 같은 값이라 따로 계산하지 않는다.
- `initialFreeRatio` = 처음부터 나갈 수 있는 조각 수 / 전체.
- `avgBlockers` = 모든 조각이 살아 있을 때 조각당 `blockersOf`의 평균 길이.
- `surge` = 마지막 `ceil(rounds/3)`개 라운드에서 나간 조각 수 / 전체 (해소감 지표, 분석자 제안이라 시험으로 조정).
- `randomWasteRatio` = 남은 조각 중 무작위로 하나씩 탭해 클리어할 때, 막힌 탭이 전체 탭에서 차지하는 비율의 평균.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `solve` — 7×1 판, 조각 1 = `[(5,0),(4,0)]`, 조각 2 = `[(3,0),(2,0)]`, 조각 3 = `[(1,0),(0,0)]`(모두 오른쪽 향함)이면 `rounds`가 `[[1],[2],[3]]`.
  - (Review Focus 2) 5×1 판, 조각 A = `[(1,0),(0,0)]`(오른쪽 향함)와 조각 B = `[(3,0),(4,0)]`(왼쪽 향함)는 서로를 막아서 예외 없이 `solvable: false`, `stuck`이 두 id를 담는다.
  - `computeMetrics` — 위 사슬 레벨에서 `rounds === 3`, `initialFreeRatio === 1/3`, `roundSizes` 합이 `pieceCount`. 풀 수 없는 레벨은 `toThrow`.
  - (Review Focus 5) 조각 0개 레벨은 `solve`가 `solvable: true, rounds: []`이고 `computeMetrics`가 `rounds: 0`, `initialFreeRatio: 1`, `surge: 0`, `avgBlockers: 0`을 돌려준다(0으로 나누지 않음).
  - `randomWasteRatio` — 같은 시드면 같은 값, 서로 막지 않는 조각만 있는 레벨은 `0`, 위 사슬 레벨은 `0`보다 크고 `1`보다 작다.
- [ ] **Step 2: 실패 확인.** Run: `npm test -- solver metrics` / Expected: FAIL
- [ ] **Step 3: `solver.ts` 구현.** 한 라운드마다 `alive` 전체에서 `canExit`인 조각을 모두 모아 한꺼번에 제거하고, 모을 게 없으면 멈춘다.
- [ ] **Step 4: `metrics.ts` 구현.** 위 정의를 그대로 구현한다. `randomWasteRatio`는 `createGame`과 `tap`으로 시뮬레이션하고 `trials`번의 평균을 낸다.
- [ ] **Step 5: 통과 확인.** Run: `npm test -- solver metrics` / Expected: PASS
- [ ] **Step 6: 커밋.** `git add src/solver && git commit -m "feat(solver): peeling solver and difficulty metrics"`

---

### Task 5: A 단계 레벨 생성기

**Files:**
- Create: `src/generator/generate.ts`
- Test: `src/generator/generate.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Rng`, `Level`, `Piece`; Task 2의 `blockersOf`, `exitRay`, `validateLevel`, `directionVector`; Task 4의 `solve`, `computeMetrics`, `Metrics`.
- Produces:
  - `interface GenParams { width: number; height: number; pieceCount: number; minLength: number; maxLength: number }`
  - `interface DifficultyTarget { rounds?: [number, number]; initialFreeRatio?: [number, number]; avgBlockers?: [number, number]; surge?: [number, number] }` (각 구간은 양끝 포함, 생략하면 제한 없음)
  - `generateLevel(params: GenParams, rng: Rng, maxAttempts?: number): Level | null` (기본 `maxAttempts` 200)
  - `generateMatching(params: GenParams, target: DifficultyTarget, rng: Rng, maxCandidates?: number): { level: Level; metrics: Metrics } | null` (기본 `maxCandidates` 200)

**배치 규칙 (시그니처로 정해지지 않는 알고리즘):** 역방향 배치다. 조각을 하나씩 놓고, **놓는 조각의 나가는 길에 이미 놓인 어느 조각의 셀도 없어야 한다.** 이 조건만 지키면 먼저 놓인 조각이 나중에 놓인 조각에 막히는 방향으로만 의존이 생겨 항상 풀 수 있다(제거 순서 = 놓은 순서의 역). 조각마다 무작위 후보 몇 개(예: 8개)를 뽑아 이미 놓인 조각의 나가는 길을 가장 많이 가로막는 후보를 고른다. 놓을 곳이 없어 `maxAttempts`번 실패하면 `null`이다. 마지막에 조각 id를 무작위로 섞어서 배치 순서가 id에 드러나지 않게 한다. 조각은 직선이고 길이는 `minLength`~`maxLength`.

- [ ] **Step 1: 실패하는 테스트 작성**
  - 결정성: 같은 시드, 같은 `params`로 만든 두 레벨이 깊은 비교로 같다. 다른 시드는 다르다.
  - 유효성(수락 시험): 시드 0~49에 `{width:10,height:10,pieceCount:12,minLength:2,maxLength:4}`를 돌려, `null`이 아닌 결과는 모두 `validateLevel(level,{straightOnly:true,minLength:2,maxLength:4})`가 `[]`이고 `solve(level).solvable`이 `true`이며 조각 수가 12. 50개 중 적어도 하나는 `null`이 아니다.
  - (Review Focus 4) `{width:3,height:3,pieceCount:20,minLength:2,maxLength:4}`는 `null`을 돌려주고 시간 안에 끝난다.
  - `generateMatching` — `target = { rounds: [2, 6] }`로 돌려 결과가 있으면 `metrics.rounds`가 2~6이다. 만족할 수 없는 목표(`rounds: [100, 200]`)는 `null`.
- [ ] **Step 2: 실패 확인.** Run: `npm test -- generate` / Expected: FAIL
- [ ] **Step 3: `generateLevel` 구현.** 위 배치 규칙을 따른다.
- [ ] **Step 4: `generateMatching` 구현.** 후보를 `generateLevel`로 만들고 `computeMetrics`로 지표를 계산해 `target` 안에 들면 반환한다.
- [ ] **Step 5: 통과 확인.** Run: `npm test -- generate` / Expected: PASS
- [ ] **Step 6: 커밋.** `git add src/generator && git commit -m "feat(generator): reverse-placement stage A generator with difficulty filter"`

---

### Task 6: 광고 목업

**Files:**
- Create: `src/ads/AdService.ts`
- Test: `src/ads/AdService.test.ts`

**Interfaces:**
- Produces:
  - `type RewardedResult = 'completed' | 'skipped' | 'failed'`
  - `interface AdService { showRewarded(placement: string): Promise<RewardedResult>; showInterstitial(placement: string): Promise<void> }`
  - `class MockAdService implements AdService` (생성자 `(options?: { rewardedResult?: RewardedResult; delayMs?: number })`, 기본 `'completed'`와 0ms. `calls: ReadonlyArray<{ kind: 'rewarded' | 'interstitial'; placement: string }>`에 호출을 기록)

- [ ] **Step 1: 실패하는 테스트 작성.** 기본 목업은 `showRewarded('clear')`가 `'completed'`를 돌려주고 `calls`에 `{kind:'rewarded',placement:'clear'}`가 남는다. `rewardedResult: 'skipped'` 옵션이 반영된다. `showInterstitial('level-end')`는 `undefined`로 끝나고 기록된다.
- [ ] **Step 2: 실패 확인.** Run: `npm test -- AdService` / Expected: FAIL
- [ ] **Step 3: 구현.** 실제 광고나 확인창 없이 `delayMs`만 기다린 뒤 결과를 돌려준다.
- [ ] **Step 4: 통과 확인.** Run: `npm test -- AdService` / Expected: PASS
- [ ] **Step 5: 커밋.** `git add src/ads && git commit -m "feat(ads): ad service interface and mock"`

---

### Task 7: 확인용 뷰어

**Files:**
- Create: `viewer/index.html`, `viewer/main.ts`, `viewer/render.ts`

**Interfaces:**
- Consumes: Task 2의 `exitCell`, `headDirection`; Task 3의 `createGame`, `tap`, `GameState`; Task 4의 `computeMetrics`; Task 5의 `generateMatching`, `GenParams`; Task 1의 `createRng`.
- Produces: `render(canvas: HTMLCanvasElement, state: GameState, flash?: { id: number; kind: 'blocked' | 'exited' }): void`와 페이지 UI (시드 입력, 판 크기·조각 수·길이 입력, 생성 버튼, 지표 표시).

**뷰어가 보여야 하는 것 (설계 문서 3.8, 3.9):** 격자, 조각마다 서로 다른 색(`id`로 결정), 머리 칸의 방향 화살표, 조각마다 `exitCell`에 같은 색의 문 표식, 조각을 클릭하면 `tap`을 호출해 `exited`면 사라지고 `blocked`면 해당 조각과 `blockers`를 잠시 강조, 오른쪽에 `computeMetrics` 결과(`rounds`, `initialFreeRatio`, `avgBlockers`, `surge`)와 `taps`, `blockedTaps` 표시. 확인용이라 스타일은 최소로 한다.

- [ ] **Step 1: 뷰어 작성.** 2D canvas만 쓴다. `main.ts`는 입력값으로 `generateMatching`(목표 없음 `{}`)을 호출해 레벨을 만들고, 실패하면 "생성 실패" 문구를 띄운다.
- [ ] **Step 2: 빌드 확인.** Run: `npm run build` / Expected: 오류 없이 `viewer/dist` 생성
- [ ] **Step 3: 수동 확인.** Run: `npm run dev`로 열고 다음을 눈으로 확인한다. (a) 10×10, 조각 12개로 생성하면 레벨이 그려지고 지표가 나온다. (b) 막히지 않은 조각을 클릭하면 사라진다. (c) 막힌 조각을 클릭하면 사라지지 않고 막는 조각이 강조된다. (d) 모두 없애면 클리어 표시가 뜬다. (e) 같은 시드로 다시 생성하면 같은 판이 나온다.
- [ ] **Step 4: 전체 검증.** Run: `npm test && npm run build` / Expected: 모든 테스트 PASS, 빌드 성공
- [ ] **Step 5: 커밋.** `git add viewer && git commit -m "feat(viewer): minimal level viewer with gates and tap feedback"`

---

## Self-Review

- **설계 문서 6절의 첫 결과물 5가지:** 코어와 테스트(Task 2, 3), 솔버와 지표(Task 4), A 단계 생성기(Task 5), 뷰어(Task 7), 광고 목업(Task 6)에 각각 대응한다.
- **설계 문서 3.9절(문은 자동 계산):** `exitCell`(Task 2)을 뷰어(Task 7)가 쓴다.
- **설계 문서 5.3절 지표:** 라운드 수와 최장 의존 사슬은 같은 값이라 `rounds` 하나로 합쳤다(설계 문서도 같이 고친다). 시뮬레이션 클리어율은 `randomWasteRatio`로 구체화했다(정의는 분석자 제안).
- **의도적으로 뺀 것:** 레벨 JSON 직렬화, 되돌리기(Undo, 불변 `GameState`로 이후에 쉽게 얹을 수 있음), 곡선 모듈, B/C 단계, 부딪힘 변주, 고정 장애물.
- **타입 일관성:** `Level`, `Piece`, `Cell`, `Direction`, `Rng`는 Task 1에서만 정의하고 이후 태스크는 같은 이름으로 쓴다. `canExit(level, id, alive)`와 `blockersOf(level, piece, alive)`는 Task 2의 시그니처를 Task 3, 4가 그대로 쓴다.
- **분량:** 코드 본문은 시그니처와 단언만 두고 알고리즘이 정해지지 않는 곳(배치 규칙)에만 설명을 적었다.
