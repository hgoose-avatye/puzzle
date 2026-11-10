/**
 * The settings popup (Figma Theme Dialog P03, as in the other pop games): a card of switches (효과음, 배경음, 진동), a
 * card of links (이용약관, 개인정보 처리방침) and the version under them. The red close in the header is the only way
 * out; a legal page opens in the same popup and its 확인 goes back to the settings.
 *
 * The 효과음 switch keeps the old sound button's id (`#mute`) and its `muted` class, so the saved setting and the
 * browser checks read it as before.
 */
import termsHtml from './content/terms.html?raw';
import privacyHtml from './content/privacy.html?raw';
import { para, type Modal } from './modal';
import type { Sound } from './sound';

const MUSIC_KEY = 'animal-rescue-music-off';
const VIBRATE_KEY = 'animal-rescue-vibrate-off';
const VERSION = '1.0.0';

const read = (key: string): boolean => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const write = (key: string, off: boolean): void => { try { localStorage.setItem(key, off ? '1' : '0'); } catch { /* ignore */ } };

/**
 * The background music: one looping track (game/public/assets/sounds/bgm.m4a). It starts on the first gesture the
 * browser counts (autoplay rules), stops while the page is hidden and when switched off.
 */
class Music {
  off = read(MUSIC_KEY);
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;

  unlock(): void {
    this.unlocked = true;
    this.sync();
  }

  setOff(off: boolean): void {
    this.off = off;
    write(MUSIC_KEY, off);
    this.sync();
  }

  sync(): void {
    const play = this.unlocked && !this.off && document.visibilityState === 'visible';
    if (play && !this.audio) {
      this.audio = new Audio('/assets/sounds/bgm.m4a');
      this.audio.loop = true;
      this.audio.volume = 0.35;
    }
    if (!this.audio) return;
    if (play && this.audio.paused) void this.audio.play().catch(() => { /* tried again on the next gesture */ });
    if (!play && !this.audio.paused) this.audio.pause();
  }
}
export const music = new Music();
document.addEventListener('visibilitychange', () => music.sync());

/** Short buzzes on phones that have them (Android browsers; iOS Safari has no vibration). */
export const haptics = {
  off: read(VIBRATE_KEY),
  setOff(off: boolean): void { this.off = off; write(VIBRATE_KEY, off); },
  buzz(pattern: number | number[]): void {
    if (this.off) return;
    try { navigator.vibrate?.(pattern); } catch { /* not allowed here */ }
  },
};

/** One switch row: the label on the left, the Theme Toggle on the right (`muted` class = off). */
function switchRow(id: string, label: string, isOff: () => boolean, setOff: (off: boolean) => void): HTMLButtonElement {
  const row = document.createElement('button');
  row.id = id;
  row.className = 'toggle';
  row.setAttribute('role', 'switch');
  row.innerHTML = `<span class="tName">${label}</span><span class="tWord"></span><span class="tTrack"><span class="tKnob"></span></span>`;
  const paint = (): void => {
    const off = isOff();
    row.classList.toggle('muted', off);
    row.setAttribute('aria-checked', String(!off));
    row.setAttribute('aria-label', `${label} ${off ? '꺼짐, 누르면 켜져요' : '켜짐, 누르면 꺼져요'}`);
    row.querySelector('.tWord')!.textContent = off ? '꺼짐' : '켜짐';
  };
  paint();
  row.addEventListener('click', () => { setOff(!isOff()); paint(); });
  return row;
}

function linkRow(label: string, open: () => void): HTMLButtonElement {
  const row = document.createElement('button');
  row.className = 'linkRow';
  row.innerHTML = `<span>${label}</span>`;
  row.onclick = open;
  return row;
}

/** Wire the settings popup; returns the function that opens it. */
export function setupSettings(modal: Modal, sound: Sound): () => void {
  const sfx = switchRow('mute', '효과음', () => sound.muted, (off) => { sound.unlock(); sound.setMuted(off); });
  const bgm = switchRow('music', '배경음', () => music.off, (off) => { music.setOff(off); music.unlock(); });
  const vib = switchRow('vibrate', '진동', () => haptics.off, (off) => { haptics.setOff(off); if (!off) haptics.buzz(30); });
  const switches = document.createElement('div');
  switches.className = 'setCard';
  switches.append(sfx, bgm, vib);

  const legal = (title: string, html: string): void => {
    const box = document.createElement('div');
    box.className = 'legal';
    box.innerHTML = html;
    modal.open('legal', title, [box], [{ id: 'legalOk', label: '확인', kind: 'primary', onClick: open }]);
    // the header's close goes back to the settings too
    document.getElementById('modalX')!.onclick = open;
  };
  const links = document.createElement('div');
  links.className = 'setCard';
  links.append(linkRow('이용약관', () => legal('이용약관', termsHtml)), linkRow('개인정보 처리방침', () => legal('개인정보 처리방침', privacyHtml)));

  function open(): void {
    sound.unlock();
    modal.open('settings', '설정', [switches, links, para(`버전 ${VERSION}`, 'setVersion')], []);
  }
  return open;
}
