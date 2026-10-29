# 효과음 출처와 라이선스

효과음은 `game/public/assets/sounds/`에 있고, 이름·볼륨·중복 방지 규칙은 `game/sound.ts`의 `MANIFEST`에서 관리한다.

| 이벤트 | 파일 | 원 제목 | 출처 | 상태 |
|---|---|---|---|---|
| 동물 선택 (`select`) | (없음) | Pop Cartoon | Pixabay | **미확보**. Pixabay가 자동 다운로드를 막아서(403) 파일을 받지 못했고, 대체 음원은 쓰지 않는다. 직접 받아 `select.mp3`로 두고 `MANIFEST.select.file`을 채운다 |
| 동물 이동 (`move`) | `move.mp3` | Explainer video pops whoosh light pop | Mixkit (sfx 3005) | 확보 |
| 이동 완료 (`arrive`) | `arrive.mp3` | Select click | Mixkit (sfx 1109) | 확보 (게임에서 이 이벤트가 일어나는 곳이 없음, 아래 참고) |
| 개별 탈출 (`rescued`) | `rescued.mp3` | Positive notification | Mixkit (sfx 951) | 확보 |
| 스테이지 클리어 (`clear`) | `clear.mp3` | Magic marimba | Mixkit (sfx 2820) | 확보 |
| 게임 오버 (`gameover`) | `gameover.mp3` | Funny game over | Mixkit (sfx 2878) | 확보 |

## 파일 위치
- https://mixkit.co/free-sound-effects/pop/ (Explainer video pops whoosh light pop)
- https://mixkit.co/free-sound-effects/click/ (Select click)
- https://mixkit.co/free-sound-effects/notification/ (Positive notification, Magic marimba)
- https://mixkit.co/free-sound-effects/game-over/ (Funny game over)
- https://pixabay.com/sound-effects/ ("Pop Cartoon", 미확보)

받은 파일은 Mixkit 사이트가 미리듣기용으로 제공하는 MP3(128kbps)이다. 고음질 원본이 필요하면 각 페이지의 Download 버튼으로 받아 교체한다.

## 라이선스
- Mixkit 효과음은 사이트에 "Lifetime commercial licence / Mixkit License"로 표시된다.
- 라이선스 본문은 자바스크립트로 렌더링되어 자동으로 읽지 못했다. **출시 전에 https://mixkit.co/license/ 의 Sound Effects Free License를 직접 읽고** 상업 사용, 출처 표기 필요 여부, 음원 단독 재배포 금지 조항을 확인한다.
- Pixabay 음원을 추가하면 Pixabay Content License를 같은 방식으로 확인한다.
