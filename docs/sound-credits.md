# 효과음 출처와 라이선스

효과음은 `game/public/assets/sounds/`에 있고, 이름·볼륨·중복 방지 규칙은 `game/sound.ts`의 `MANIFEST`에서 관리한다.

| 이벤트 | 파일 | 원 제목 | 출처 | 상태 |
|---|---|---|---|---|
| 동물 선택 (`select`) | `pop-cartoon.mp3` | Pop Cartoon | Pixabay (357572) | 확보 (사용자가 직접 받음). 파일 앞에 0.5초 무음이 있어 0.49초부터 0.15초만 재생한다(`MANIFEST.select.trim`), 파일은 원본 그대로 |
| 동물 이동 (`move`) | `move.mp3` | Explainer video pops whoosh light pop | Mixkit (sfx 3005) | 확보 |
| 이동 완료 (`arrive`) | `arrive.mp3` | Select click | Mixkit (sfx 1109) | 확보 (게임에서 이 이벤트가 일어나는 곳이 없음, 아래 참고) |
| 벽·장애물에 막힘 (`wall`) | `wall.mp3` | Small hit in a game | Mixkit (sfx 2072) | 확보 (Mixkit 미리듣기 파일과 MD5 일치 확인) |
| 동물 간 충돌 (`collision`) | `collision.mp3` | Soft quick punch | Mixkit (sfx 2151) | 확보 (Mixkit 미리듣기 파일과 MD5 일치 확인) |
| 개별 탈출 (`rescued`) | `rescued.mp3` | Positive notification | Mixkit (sfx 951) | 확보 |
| 스테이지 클리어 (`clear`) | `clear.mp3` | Magic marimba | Mixkit (sfx 2820) | 확보 |
| 게임 오버 (`gameover`) | `gameover.mp3` | Funny game over | Mixkit (sfx 2878) | 확보 |

## 파일 위치
- https://mixkit.co/free-sound-effects/pop/ (Explainer video pops whoosh light pop)
- https://mixkit.co/free-sound-effects/click/ (Select click)
- https://mixkit.co/free-sound-effects/hit/ (Small hit in a game, Soft quick punch)
- https://mixkit.co/free-sound-effects/notification/ (Positive notification, Magic marimba)
- https://mixkit.co/free-sound-effects/game-over/ (Funny game over)
- https://pixabay.com/sound-effects/film-special-effects-pop-cartoon-357572/ (Pop Cartoon)

받은 파일은 Mixkit 사이트가 미리듣기용으로 제공하는 MP3(128kbps)이다. 고음질 원본이 필요하면 각 페이지의 Download 버튼으로 받아 교체한다.

## 라이선스
- Mixkit 효과음은 사이트에 "Lifetime commercial licence / Mixkit License"로 표시된다.
- 라이선스 본문은 자바스크립트로 렌더링되어 자동으로 읽지 못했다. **출시 전에 https://mixkit.co/license/ 의 Sound Effects Free License를 직접 읽고** 상업 사용, 출처 표기 필요 여부, 음원 단독 재배포 금지 조항을 확인한다.
- Pixabay 음원을 추가하면 Pixabay Content License를 같은 방식으로 확인한다.
