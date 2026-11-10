import { store } from './local';
import { gfLog } from './sdk';
import type { ApplyResult, Currency, Wallet, WalletOp } from './types';

export interface Scope { deviceId: string; gameId: string; env: string }
export interface Econ {
  boot(): Promise<any>;
  recover(): Promise<any>;
  buy(input: { sku: string; quantity: number; currency: string | null }): Promise<any>;
  applyWallet(input: WalletOp): Promise<{ ok: boolean; status: string; balance: number }>;
  getSnapshot(): any;
  close(): void;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const PERMANENT = /^(HTTP_400|HTTP_409|INVALID_MUTATION|idempotency input changed)$/;

/**
 * 서버 지갑 표시 = 서버 스냅샷 + 진행 중 변경분(delta).
 *  - 소비: 낙관적 차감 → 같은 id 로 최대 3회 재시도 → INSUFFICIENT 면 롤백. 끝내 실패하면(불확실) 유저에게 유리하게 포기.
 *  - 지급(광고/상자/코인구매 2번째 다리): 요청 전 localStorage 에 scope 와 함께 기록 → 성공까지 재시도,
 *    다음 부트에서 같은 scope 일 때만 같은 id 로 재시도. 영구 거절만 삭제. 상한 100(기존 축출 금지).
 */
export class ServerWallet implements Wallet {
  private snap: Record<string, number> | null = null;
  private delta: Record<string, number> = {};
  private subs: (() => void)[] = [];
  private running = new Set<string>();
  static KEY = 'animal-rescue:toss:pending-grants';
  readonly server = true;

  private econ: Econ;
  private backoff: number[];
  constructor(econ: Econ, backoff = [2000, 5000, 10000, 30000, 60000]) {
    this.econ = econ;
    this.backoff = backoff;
  }

  refresh() {
    const s = this.econ.getSnapshot();
    if (s?.wallet) this.snap = s.wallet;
    this.subs.forEach(f => f());
  }
  get(c: Currency): number | null {
    if (!this.snap) return null;
    return Math.max(0, (this.snap[c] ?? 0) + (this.delta[c] ?? 0));
  }
  onChange(cb: () => void) { this.subs.push(cb); }
  private bump(c: string, n: number) { this.delta[c] = (this.delta[c] ?? 0) + n; }

  private async call(op: WalletOp): Promise<'ok' | 'insufficient' | 'permanent' | 'retry'> {
    try {
      const r = await this.econ.applyWallet(op);
      if (r.ok) return 'ok';
      return r.status === 'INSUFFICIENT' ? 'insufficient' : 'permanent';
    } catch (e: any) {
      const code = String(e?.code ?? e?.message ?? '');
      gfLog('wallet-error', { currency: op.currency, reason: op.reason, code });
      return PERMANENT.test(code) ? 'permanent' : 'retry';
    }
  }

  async apply(op: WalletOp, strict = false): Promise<ApplyResult> {
    return op.amount > 0 ? this.grant(op) : this.spend(op, strict);
  }

  private async spend(op: WalletOp, strict: boolean): Promise<ApplyResult> {
    const cur = this.get(op.currency);
    if (cur === null) return 'error';
    if (cur < -op.amount) return 'insufficient';
    this.bump(op.currency, op.amount);
    this.subs.forEach(f => f());
    for (let attempt = 0; attempt <= 3; attempt++) {
      const r = await this.call(op);
      if (r === 'ok') { this.snapThen(() => this.bump(op.currency, -op.amount)); return 'ok'; }
      if (r === 'insufficient' || r === 'permanent') {
        this.snapThen(() => this.bump(op.currency, -op.amount));
        return r === 'insufficient' ? 'insufficient' : 'error';
      }
      if (attempt < 3) { await sleep(this.backoff[attempt]); await this.econ.recover().catch(() => {}); }
    }
    this.snapThen(() => this.bump(op.currency, -op.amount));
    return strict ? 'error' : 'ok';
  }

  /** 스냅샷 갱신과 delta 정리를 같은 틱에 — 표시 수량이 튀지 않도록. */
  private snapThen(f: () => void) {
    const s = this.econ.getSnapshot();
    if (s?.wallet) this.snap = s.wallet;
    f();
    this.subs.forEach(g => g());
  }

  private pending(): { op: WalletOp; scope: Scope }[] { return store.get(ServerWallet.KEY, []); }
  private setPending(list: { op: WalletOp; scope: Scope }[]) { store.set(ServerWallet.KEY, list); }

  private scope(): Scope | null {
    const s = this.econ.getSnapshot()?.scope;
    return s ? { deviceId: s.deviceId, gameId: s.gameId, env: s.env } : null;
  }

  private async grant(op: WalletOp): Promise<ApplyResult> {
    const scope = this.scope();
    if (!scope) return 'error';
    if (op.reason === 'play') {
      // 시작/튜토리얼 지급은 부트마다 재요청(대부분 DUPLICATE)되므로 표시를 미리 올리지 않는다.
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await this.call(op);
        if (r === 'ok') { this.snapThen(() => {}); return 'ok'; }
        if (r !== 'retry') return 'error';
        await sleep(this.backoff[attempt]);
        await this.econ.recover().catch(() => {});
      }
      return 'error';
    }
    const list = this.pending();
    // 같은 작업(scope·id·통화)이 이미 큐에 있으면 다시 넣지도, 표시 잔고를 다시 올리지도 않는다 — 보너스 정산처럼 같은 id 로
    // 재전송하는 호출자가 있어도 표시 = 서버(레벨 개편 §8.2 지갑 큐 멱등)
    const key = `${op.id}:${op.currency}`;
    if (list.some(p => `${p.op.id}:${p.op.currency}` === key && p.scope.deviceId === scope.deviceId && p.scope.gameId === scope.gameId && p.scope.env === scope.env)) {
      void this.process(op);
      return 'ok';
    }
    if (list.length >= 100) { gfLog('wallet-queue-full', { size: list.length }); return 'error'; }
    list.push({ op, scope });
    this.setPending(list);
    this.bump(op.currency, op.amount);
    this.subs.forEach(f => f());
    void this.process(op);
    return 'ok';
  }

  private async process(op: WalletOp) {
    const key = `${op.id}:${op.currency}`;
    if (this.running.has(key)) return;
    this.running.add(key);
    try {
      for (let attempt = 0; ; attempt++) {
        const r = await this.call(op);
        if (r !== 'retry') {
          this.setPending(this.pending().filter(p => `${p.op.id}:${p.op.currency}` !== key));
          if (r !== 'ok') gfLog('wallet-grant-dropped', { currency: op.currency, reason: op.reason, result: r });
          this.snapThen(() => this.bump(op.currency, -op.amount));
          return;
        }
        if (attempt >= this.backoff.length) return; // 다음 부트에서 같은 scope 로 재시도
        await sleep(this.backoff[attempt]);
        await this.econ.recover().catch(() => {});
      }
    } finally { this.running.delete(key); }
  }

  /** 부트 직후: 같은 scope 의 미확정 지급을 같은 id 로 재시도, 다른 scope 는 폐기. */
  resumePending() {
    const scope = this.scope();
    if (!scope) return;
    const list = this.pending();
    const keep = list.filter(p => p.scope.deviceId === scope.deviceId && p.scope.gameId === scope.gameId && p.scope.env === scope.env);
    if (keep.length !== list.length) gfLog('wallet-pending-scope-drop', { dropped: list.length - keep.length });
    this.setPending(keep);
    for (const p of keep) { this.bump(p.op.currency, p.op.amount); void this.process(p.op); }
    this.subs.forEach(f => f());
  }
}

/** 미션/웰컴 지급 핸들러 — 저널 → 지급 → 저널 기록 → ackItem (정본 §8 아이템 보상 계약). */
export function makeDeliver(ready: Promise<unknown>, econ: Econ, wallet: ServerWallet, ack: (idem: string) => void) {
  const JKEY = 'animal-rescue:grant-journal';
  return async (g: { missionType?: string; currency: string; amount: number; idem: string }) => {
    await ready;
    const journal = store.get<string[]>(JKEY, []);
    if (journal.includes(g.idem)) { ack(g.idem); return true; }
    const [currency, amount]: [Currency, number] = g.currency === 'coin'
      ? ['coin', g.amount]
      : ['powerup_hint', Math.max(1, Math.min(g.amount, 5))]; // 코인이 아닌 보상(아이템·하트)은 사천팝처럼 힌트로 — 하트로 받을지는 결정 필요
    if (!Number.isSafeInteger(amount) || amount <= 0) { ack(g.idem); return true; }
    try {
      const r = await econ.applyWallet({ id: g.idem, currency, amount, reason: 'mission', ref: 'mission:' + (g.missionType ?? 'item') });
      if (!r.ok) return false;
    } catch {
      await econ.recover().catch(() => {});
      return false;
    }
    wallet.refresh();
    journal.push(g.idem);
    store.set(JKEY, journal.slice(-200));
    ack(g.idem);
    return true;
  };
}

export { sleep };
