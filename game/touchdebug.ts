/**
 * Touch diagnostics for real phones, dev server only (?touchdebug). Every touch leaves a ring where the finger landed
 * and a line in a panel: which finger, where, what it picked and what became of it, including taps that never reach
 * the board because a button or banner caught them. Loaded with a dynamic import, so builds never contain it.
 */

export interface TouchEntry {
  kind: 'down' | 'up' | 'cancel';
  e: PointerEvent;
  /** animal under the finger (or the one released, on cancel) */
  picked: number | null;
  result: string;
}

const LINES = 9;
const RING_MS = 1200;

/** Green when the tap did something, red when it was refused, grey for everything else. */
function tone(result: string): string {
  if (result === 'exited' || result === 'pressed') return '#2e9e44';
  if (result === 'blocked' || result.startsWith('ignored') || result.startsWith('repeat') || result.startsWith('caught')) return '#d0322a';
  return '#6b6558';
}

export class TouchDebug {
  private readonly panel = document.createElement('div');
  private readonly lines: string[] = [];

  constructor() {
    Object.assign(this.panel.style, {
      position: 'fixed', left: '8px', right: '8px', bottom: '88px', zIndex: '20', pointerEvents: 'none',
      font: '12px/1.35 ui-monospace, Menlo, monospace', color: '#fff', background: 'rgba(0,0,0,.62)',
      borderRadius: '8px', padding: '6px 8px', whiteSpace: 'pre-wrap',
    });
    document.body.appendChild(this.panel);
    const canvas = document.querySelector('#app canvas');
    // a touch that lands on a button, banner or popup never reaches the board: say who caught it
    window.addEventListener('pointerdown', (e) => {
      if (e.target === canvas) return;
      const t = e.target as HTMLElement;
      this.log({ kind: 'down', e, picked: null, result: `caught by ${t.id ? `#${t.id}` : t.tagName.toLowerCase()}` });
    }, { capture: true });
    this.render();
  }

  log({ kind, e, picked, result }: TouchEntry): void {
    const arrow = kind === 'down' ? '↓' : kind === 'up' ? '↑' : '×';
    this.lines.unshift(`${arrow} f${e.pointerId % 100} ${e.pointerType[0]} (${Math.round(e.clientX)},${Math.round(e.clientY)}) → ${picked ?? '-'} · ${result}`);
    this.lines.length = Math.min(this.lines.length, LINES);
    this.render();
    this.ring(e.clientX, e.clientY, tone(result), kind === 'down' ? 22 : 14);
  }

  private render(): void {
    const head = `touchdebug · ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`;
    this.panel.textContent = [head, ...this.lines].join('\n');
  }

  private ring(x: number, y: number, color: string, r: number): void {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: `${x - r}px`, top: `${y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, zIndex: '21',
      border: `3px solid ${color}`, borderRadius: '50%', pointerEvents: 'none', boxSizing: 'border-box',
      transition: `opacity ${RING_MS}ms ease-out`,
    });
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.opacity = '0'; });
    setTimeout(() => dot.remove(), RING_MS);
  }
}
