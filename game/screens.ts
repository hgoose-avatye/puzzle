import type { Level } from '../src/core/types';

/**
 * The title screen: an overlay over the 3D board, the logo above it and the buttons below it.
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

export class TitleScreen {
  constructor(choice: TitleChoice) {
    $('tStart').onclick = choice.start;
    $('tContinue').onclick = choice.resume;
    $('tRestart').onclick = choice.restart;
  }

  /** Show the title. `saved` is the level to continue at, or null when there is nothing to continue. */
  show(saved: { level: number; place: string } | null): void {
    document.body.classList.add('on-title');
    $('title').hidden = false;
    $('tStart').hidden = saved !== null;
    $('tContinue').hidden = saved === null;
    $('tRestart').hidden = saved === null;
    $('tWhere').textContent = saved ? `레벨 ${saved.level} · ${saved.place}` : '';
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
