import type { Level } from '../src/core/types';

/**
 * The title screen: an overlay over the 3D board, which shows a few of the game's own animals facing the camera.
 * main.ts builds that board and starts levels; this file only owns the overlay and its buttons.
 */

/** Animals on the title board, all facing the camera so their faces show; species pinned per id. */
export function titleBoard(): { level: Level; species: Map<number, string> } {
  const rows: Array<[number, string, Array<[number, number]>]> = [
    [1, 'penguin', [[0, 1]]], [2, 'chick', [[2, 1]]], [3, 'parrot', [[4, 1]]],
    [4, 'fox', [[1, 3], [1, 2]]], [5, 'pig', [[3, 3], [3, 2]]],
  ];
  const species = new Map<number, string>();
  const pieces: Level['pieces'] = rows.map(([id, name, cells]) => {
    species.set(id, name);
    return { id, cells: cells.map(([x, y]) => ({ x, y })), ...(cells.length === 1 ? { dir: 'down' as const } : {}) };
  });
  return { level: { width: 5, height: 4, pieces }, species };
}

export interface TitleChoice {
  /** no save beyond level 1: one button, level 1 */
  start: () => void;
  /** go back to the saved level */
  resume: () => void;
  /** play from level 1, keeping the save */
  restart: () => void;
}

const HOP_MS = 1400;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class TitleScreen {
  private hopTimer: number | undefined;

  constructor(choice: TitleChoice, private readonly hop: () => void) {
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
    window.clearInterval(this.hopTimer);
    this.hopTimer = window.setInterval(this.hop, HOP_MS);
  }

  hide(): void {
    document.body.classList.remove('on-title');
    $('title').hidden = true;
    window.clearInterval(this.hopTimer);
  }

  get visible(): boolean {
    return !$('title').hidden;
  }
}
