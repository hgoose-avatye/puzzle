/**
 * One modal card over everything (title, board, popups), used for the retry question and the settings. It only covers
 * the screen, so taps cannot reach the board while it is open; the level in play, its hearts and the save are not
 * touched by it.
 */

/** A GameButton role (ui.css): green goes on, blue tries again, yellow is the hint, cream steps back. */
export type ButtonRole = 'primary' | 'retry' | 'special' | 'secondary';

export interface ModalButton {
  id: string;
  label: string;
  kind: ButtonRole;
  onClick: () => void;
}

/** GameButton classes for a dialog button: the main action large, a step back medium. */
export const dialogButton = (role: ButtonRole): string =>
  role === 'secondary' ? 'gb gb-m gb-secondary' : role === 'retry' ? 'gb gb-l gb-primary retry' : `gb gb-l gb-${role}`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export class Modal {
  /** What the modal shows now ('retry', 'settings'), or null when closed. */
  kind: string | null = null;

  /** `head`: something to show in the header, just left of the red close (the shop's coin balance). */
  open(kind: string, title: string, body: Node[], buttons: ModalButton[], head?: Node): void {
    this.kind = kind;
    $('modalTitle').textContent = title;
    document.getElementById('modalHead')?.remove();
    if (head) {
      const box = document.createElement('div');
      box.id = 'modalHead';
      box.append(head);
      $('modalX').before(box);
    }
    $('modalBody').replaceChildren(...body);
    $('modalBtns').replaceChildren(...buttons.map((b) => {
      const el = document.createElement('button');
      el.id = b.id;
      el.className = dialogButton(b.kind);
      el.textContent = b.label;
      el.onclick = b.onClick;
      return el;
    }));
    // the header's red close steps back like the quiet button (취소 / 닫기)
    $('modalX').onclick = () => this.close();
    $('modal').hidden = false;
  }

  close(): void {
    this.kind = null;
    $('modal').hidden = true;
  }
}

/** A rule as the first-time tip shows it: a short name and one or two sentences. */
export interface RuleText {
  title: string;
  text: string;
}

/** One rule row of the first-time tip popup: the rule's name on its own line, then its text. */
export function ruleRow(rule: RuleText): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tip';
  const name = document.createElement('b');
  name.textContent = rule.title;
  row.append(name, rule.text);
  return row;
}

/** A line of plain text for the modal body. */
export const para = (text: string, className = 'modalNote'): HTMLElement => {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
};
