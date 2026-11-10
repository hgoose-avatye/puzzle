import type { Level } from '../src/core/types';

/**
 * The title screen: the launch intro clip, then its last frame (the empty board) as the backdrop with the logo and buttons over it.
 * main.ts builds that board, runs its loop and starts levels; this file only owns the overlay and its buttons.
 */

/**
 * The title board: 3 x 3, where only the chick at the front can leave; everyone else is blocked by another animal.
 * Any edge lets a friend out (there are no doors); main.ts sends the chick out over the front edge on a loop.
 *   . . P      P pig (head below, facing down)
 *   F F P      F fox (head right, facing right)
 *   r c n      r parrot (right), c chick (down, the one that runs out), n penguin (left)
 */
export function titleBoard(): { level: Level; species: Map<number, string>; runner: number } {
  const rows: Array<[number, string, Array<[number, number]>, 'down' | 'left' | 'right' | undefined]> = [
    [1, 'chick', [[1, 2]], 'down'], [2, 'fox', [[1, 1], [0, 1]], undefined], [3, 'pig', [[2, 1], [2, 0]], undefined],
    [4, 'penguin', [[2, 2]], 'left'], [5, 'parrot', [[0, 2]], 'right'],
  ];
  const species = new Map<number, string>();
  const pieces: Level['pieces'] = rows.map(([id, name, cells, dir]) => {
    species.set(id, name);
    return { id, cells: cells.map(([x, y]) => ({ x, y })), ...(dir ? { dir } : {}) };
  });
  return { level: { width: 3, height: 3, pieces }, species, runner: 1 };
}

/** Where the title board is drawn on screen, in CSS pixels: the top of its animals and just past its front edge. */
export interface BoardBand {
  top: number;
  bottom: number;
}

export interface TitleChoice {
  /** no save beyond level 1: one button, level 1 */
  start: () => void;
  /** go back to the saved level */
  resume: () => void;
  /** play from level 1, keeping the save */
  restart: () => void;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Longest the intro may hold the title back once playing when its length is unknown. */
const INTRO_MAX_MS = 6000;
/** How long the intro may take to start (download, decode) before the title shows without it. */
const INTRO_START_MS = 5000;
/** From the still fading in to the logo and buttons arriving. */
const INTRO_REVEAL_MS = 350;

export class TitleScreen {
  /** The intro clip plays once per launch, on the first title. */
  private introPlayed = false;

  constructor(choice: TitleChoice) {
    $('tStart').onclick = choice.start;
    $('tContinue').onclick = choice.resume;
    $('tRestart').onclick = choice.restart;
    $('title').classList.add('has-intro');
  }

  /**
   * The launch intro: the clip full screen with the logo, buttons and top row hidden; when it ends (or 건너뛰기 at the top right skips it,
   * or it cannot play) its last frame stays (a skip fades it in) and the logo pops out in the middle, then the buttons. Skipped under reduced motion and in
   * automated browsers (the e2e checks click the buttons right away).
   */
  private playIntro(): void {
    const t = $('title');
    const video = $<HTMLVideoElement>('tIntro');
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.clearTimeout(guard);
      video.onplaying = null;
      skipBtn.hidden = true;
      t.classList.add('still');
      window.setTimeout(() => {
        t.classList.remove('playing');
        document.body.classList.remove('intro-playing');
        video.pause();
      }, INTRO_REVEAL_MS);
    };
    const skipBtn = $('tSkip');
    // a clip that never starts (slow first download, blocked autoplay) gives up after INTRO_START_MS; once it plays it
    // has its own length plus a little to end
    let guard = window.setTimeout(finish, INTRO_START_MS);
    video.onplaying = () => {
      window.clearTimeout(guard);
      const left = Number.isFinite(video.duration) ? (video.duration - video.currentTime) * 1000 : INTRO_MAX_MS;
      guard = window.setTimeout(finish, left + 1500);
    };
    const skip = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || navigator.webdriver;
    if (skip) { finish(); return; }
    t.classList.add('playing');
    document.body.classList.add('intro-playing');
    skipBtn.hidden = false;
    skipBtn.onclick = finish;
    video.onended = finish;
    video.onerror = finish;
    video.currentTime = 0;
    void video.play().catch(finish);
  }

  /** Show the title. `saved` is the level to continue at, or null when there is nothing to continue. */
  show(saved: { level: number; place: string } | null): void {
    document.body.classList.add('on-title');
    $('title').hidden = false;
    $('tStart').hidden = saved !== null;
    $('tContinue').hidden = saved === null;
    $('tRestart').hidden = saved === null;
    $('tWhere').textContent = saved ? `레벨 ${saved.level} · ${saved.place}` : '';
    if (!this.introPlayed) { this.introPlayed = true; this.playIntro(); } else $('title').classList.add('still');
  }

  /** Hang the logo above and the buttons below where the board is drawn. */
  layout(band: BoardBand): void {
    const t = $('title');
    t.style.setProperty('--board-top', `${Math.round(band.top)}px`);
    t.style.setProperty('--board-bottom', `${Math.round(band.bottom)}px`);
  }

  hide(): void {
    document.body.classList.remove('on-title');
    $('title').hidden = true;
  }

  get visible(): boolean {
    return !$('title').hidden;
  }
}
