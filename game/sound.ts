/**
 * Sound effects synthesized with Web Audio: no asset files. The context is created on the first user gesture
 * (browser autoplay rules), and a mute flag is persisted. Every method is safe to call before that and when muted.
 */
const MUTE_KEY = 'animal-rescue-muted';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = ((): boolean => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
  /** Successive rescues without a blocked tap raise the pitch, like a combo. */
  private combo = 0;

  /** Call from a pointer/click handler. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, from: number, to: number): void {
    if (this.muted || !this.ctx || !this.master) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    const t = this.ctx.currentTime;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** An animal starts running out. */
  run(): void {
    this.tone(520, 0.09, 'triangle', 0.18, 0, 880);
    this.noise(0.28, 0.22, 500, 2200);
  }

  /** The animal passed its gate: a pop that climbs with the combo. */
  rescued(): void {
    const f = 660 * 2 ** (Math.min(this.combo, 8) / 12 * 2);
    this.combo++;
    this.tone(f, 0.16, 'sine', 0.3);
    this.tone(f * 1.5, 0.2, 'triangle', 0.16, 0.05);
    this.tone(f * 2, 0.22, 'sine', 0.1, 0.1);
  }

  /** A blocked tap. */
  bump(): void {
    this.combo = 0;
    this.tone(220, 0.22, 'square', 0.14, 0, 110);
    this.tone(160, 0.2, 'sine', 0.22, 0.02, 80);
  }

  heartLost(): void {
    this.tone(392, 0.18, 'triangle', 0.2, 0.12, 262);
  }

  boom(): void {
    this.noise(0.5, 0.5, 900, 80);
    this.tone(90, 0.45, 'sawtooth', 0.25, 0, 40);
  }

  clear(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.24, i * 0.1));
    this.tone(1047, 0.7, 'sine', 0.14, 0.5);
  }

  fail(): void {
    [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.16));
  }

  resetCombo(): void { this.combo = 0; }
}

export const sound = new Sound();
