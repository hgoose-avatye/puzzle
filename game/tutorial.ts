/**
 * The chick's first-time tutorial over the board. The scene darkens and only the animal to tap stays lit (stage.ts
 * setFocus, set by main.ts); this layer is see-through and catches every tap: one on the animal's spot is the action
 * (main.ts sends it on as the game's tap on that animal, so no neighbour can be picked), any other is held back. The
 * chick sits next to the animal with a small round bubble (a few words), a finger taps the animal on a loop, and
 * 건너뛰기 is small but finger-sized. In the result moment (after the tap) only the chick stays and taps are held, with
 * the bubble back when the result has words of its own (result(spot, text)). An info lesson (show({info: true}), the
 * dynamite on level 40) has nothing to tap: no finger, every touch on the board is held, and only its 알겠어요 button
 * closes it (2026-11-08: the finger over the dynamite read as "tap it", and the second tap was a real push).
 */

export interface TutorialSpot {
  x: number;
  y: number;
  r: number;
}

export interface TutorialShow {
  text: string;
  /** the animal's spot on screen, in CSS pixels; asked again every frame (null: unknown) */
  spot: () => TutorialSpot | null;
  /** a tap on the spot */
  onAction: () => void;
  onSkip: () => void;
  /** nothing to tap: no finger, touches held, closed by 알겠어요 (onAction) */
  info?: boolean;
}

/** Room kept between the animal and the chick (CSS pixels). */
const GAP = 58;

export class Tutorial {
  private readonly root: HTMLDivElement;
  private readonly guide: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private readonly finger: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private current: TutorialShow | null = null;
  private resultOnly = false;
  private downInside = false;
  private frame = 0;

  constructor(chickSrc: string) {
    this.root = document.createElement('div');
    this.root.id = 'tutorial';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="tutGuide"><img class="tutChick" alt="" src="${chickSrc}"><div class="tutBubble"></div><button class="tutSkip">건너뛰기</button><button class="tutOk">알겠어요</button></div>
      <div class="tutFinger" aria-hidden="true"><svg viewBox="-14 -4 44 60"><path d="M0 0 c3 0 5 2 5 5 v14 c2-2 6-2 8 0 c2-2 6-2 8 0 c2-1 6 0 6 4 v12 c0 9-6 15-15 15 h-4 c-6 0-9-3-12-8 l-8-13 c-2-3 0-6 3-6 c2 0 3 1 4 2 l0-20 c0-3 2-5 5-5 z"/></svg></div>`;
    document.body.appendChild(this.root);
    this.guide = this.root.querySelector('.tutGuide')!;
    this.bubble = this.root.querySelector('.tutBubble')!;
    this.finger = this.root.querySelector('.tutFinger')!;
    this.skip = this.root.querySelector('.tutSkip')!;
    this.skip.addEventListener('click', (e) => { e.stopPropagation(); this.current?.onSkip(); });
    this.root.querySelector('.tutOk')!.addEventListener('click', (e) => { e.stopPropagation(); if (this.current?.info) this.current.onAction(); });
    // every tap is held back; one that starts and ends on the animal's spot is the action
    this.root.addEventListener('pointerdown', (e) => { this.downInside = this.inside(e.clientX, e.clientY); });
    this.root.addEventListener('pointerup', (e) => {
      const hit = this.downInside && this.inside(e.clientX, e.clientY);
      this.downInside = false;
      if (hit && !this.resultOnly && !this.current?.info) this.current?.onAction();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** 'tap' while waiting for the tap, 'result' in the moment after it, null when closed. */
  get phase(): 'tap' | 'result' | null {
    return this.current ? (this.resultOnly ? 'result' : 'tap') : null;
  }

  /** Where the animal's spot is now (for checks), or null. */
  spotNow(): TutorialSpot | null {
    return this.current?.spot() ?? null;
  }

  show(t: TutorialShow): void {
    this.current = t;
    this.resultOnly = false;
    this.bubble.textContent = t.text;
    this.root.classList.remove('result', 'say');
    this.root.classList.toggle('info', !!t.info);
    this.root.hidden = false;
    document.body.classList.add('tut-on');
    cancelAnimationFrame(this.frame);
    this.place();
  }

  /**
   * The moment after the tap: the chick stays, the bubble, finger and 건너뛰기 go, taps are held. With `text` the bubble
   * stays up with those words (what the tap did).
   */
  result(spot: () => TutorialSpot | null, text?: string): void {
    if (!this.current) return;
    this.current = { ...this.current, spot };
    this.resultOnly = true;
    this.root.classList.add('result');
    if (text !== undefined) this.bubble.textContent = text;
    this.root.classList.toggle('say', text !== undefined);
  }

  hide(): void {
    this.current = null;
    this.resultOnly = false;
    this.root.hidden = true;
    this.root.classList.remove('result', 'say', 'info');
    document.body.classList.remove('tut-on');
    cancelAnimationFrame(this.frame);
  }

  private inside(x: number, y: number): boolean {
    const s = this.current?.spot();
    return !!s && Math.hypot(x - s.x, y - s.y) <= s.r;
  }

  /** Follow the animal every frame: the finger on it, the chick above or below it (whichever side has room). */
  private place(): void {
    if (!this.current) return;
    const s = this.current.spot();
    if (s) {
      this.finger.style.left = `${s.x + s.r * 0.3}px`;
      this.finger.style.top = `${s.y + s.r * 0.45}px`;
      const h = this.guide.offsetHeight, w = this.guide.offsetWidth;
      const above = s.y > innerHeight * 0.5;
      const top = above ? s.y - s.r - GAP - h : s.y + s.r + GAP;
      this.guide.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, top))}px`;
      this.guide.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, s.x - w / 2))}px`;
    }
    this.frame = requestAnimationFrame(() => this.place());
  }
}
