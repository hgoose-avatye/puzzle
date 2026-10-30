// P0 checks in the real game (docs/rules.md R1, R3, R5, traffic, clear timing, retry and fail cleanup).
// Each scenario opens its own page; a scenario that throws counts as one FAIL and the run goes on.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} base game URL, e.g. http://localhost:5299/
 * @param {{ pass: (name: string, info?: string) => void, fail: (name: string, info?: string) => void,
 *           skip: (name: string, info?: string) => void, info: (text: string) => void }} report
 */
export async function runP0Checks(browser, base, report) {
  const url = (query) => new URL(query, base).href;
  const CROSS = url('?demo=cross');
  const check = (name, ok, info = '') => (ok ? report.pass(name, info) : report.fail(name, info));

  async function open(address) {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(address, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => window.__game?.ids().length > 0, { timeout: 15000 });
    await sleep(500);
    await p.evaluate(() => { const pop = document.getElementById('popup'); if (!pop.hidden) document.getElementById('popupBtn').click(); });
    // per-frame monitor: closest gap between different animals' blocks while any runs, and the win shown while animals still run
    await p.evaluate(() => {
      const g = window.__game; window.__mon = { min: 9, earlyPopup: 0, waits: {}, resumes: {}, startS: {} };
      (function s() {
        const m = window.__mon;
        const vs = [...g.views().values()].filter((v) => v.group.visible);
        for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
          if (!(vs[i].running || vs[j].running)) continue;
          for (const a of vs[i].segments) for (const c of vs[j].segments) m.min = Math.min(m.min, Math.hypot(a.position.x - c.position.x, a.position.z - c.position.z));
        }
        for (const r of g.traffic?.runners ?? []) {
          m.startS[r.id] ??= r.s;
          if (r.state === 'waiting') m.waits[r.id] = Math.max(m.waits[r.id] ?? -1, r.s);
          else if (m.waits[r.id] !== undefined) m.resumes[r.id] = true;
        }
        const pop = document.getElementById('popup');
        if (!pop.hidden && document.getElementById('popupTitle').textContent === '구출 성공!' && [...g.views().values()].some((v) => v.running)) m.earlyPopup++;
        requestAnimationFrame(s);
      })();
    });
    return p;
  }
  const st = (p) => p.evaluate(() => window.__game.state());
  const pos = (p, id) => p.evaluate((i) => window.__game.screenOf(i), id);
  const tap = async (p, id) => { const q = await pos(p, id); await p.touchscreen.tap(q.x, q.y); };
  const popup = (p) => p.evaluate(() => (document.getElementById('popup').hidden ? null : document.getElementById('popupTitle').textContent));
  const settled = (p) => p.evaluate(() => { const g = window.__game; return { runners: g.traffic.runners.length, running: [...g.views().values()].filter((v) => v.running).length, visible: [...g.views().entries()].filter(([, v]) => v.group.visible).map(([k]) => k).sort() }; });

  /** Run one scenario on a fresh page; an exception is reported as a failure of that scenario. */
  async function scenario(name, address, body) {
    let p;
    try {
      p = await open(address);
      await body(p);
    } catch (e) {
      report.fail(`${name} (scenario crashed)`, String(e?.message ?? e));
    } finally {
      await p?.close().catch(() => {});
    }
  }

  await scenario('R1 touch double tap', CROSS, async (p) => {
    await p.evaluate(() => { window.__ups = []; document.querySelector('canvas').addEventListener('pointerup', () => window.__ups.push(performance.now())); });
    await tap(p, 4); await sleep(80); await tap(p, 4);
    const a = await st(p);
    const gap = await p.evaluate(() => Math.round(window.__ups[1] - window.__ups[0]));
    // the guard is 400 ms by design: when a slow headless frame spreads the two taps further apart, there is nothing to judge
    if (gap >= 400) { report.skip('R1 touch double tap', `the taps reached the page ${gap} ms apart`); return; }
    await sleep(500); await tap(p, 4);
    const c = await st(p);
    check('R1 quick double tap on blocked animal: one heart', a.hearts === 2 && a.blocked === 1, `${gap} ms apart, hearts ${a.hearts}, blocked ${a.blocked}`);
    check('R1 tap again after 0.4 s counts', c.hearts === 1 && c.blocked === 2, `hearts ${c.hearts}`);
  });

  await scenario('R1 same moment', CROSS, async (p) => {
    const a = await p.evaluate(() => { window.__game.tap(4); window.__game.tap(4); return window.__game.state(); });
    check('R1 two taps at the same moment on a blocked animal: one heart', a.hearts === 2 && a.blocked === 1, `hearts ${a.hearts}, blocked ${a.blocked}`);
  });

  await scenario('R1 way opened', CROSS, async (p) => {
    await tap(p, 4); await sleep(60); await tap(p, 2); await sleep(60); await tap(p, 4);
    const a = await st(p);
    check('R1 repeat after the way opened still exits', !a.alive.includes(4) && a.hearts === 2, `alive ${a.alive}, hearts ${a.hearts}`);
  });

  await scenario('R1+R3 bomb level', url('?level=124'), async (p) => {
    const blocked = await p.evaluate(() => { const g = window.__game; const free = g.free(); return g.ids().find((i) => !free.includes(i)); });
    const f0 = await st(p);
    await tap(p, blocked); await sleep(80); await tap(p, blocked);
    const f1 = await st(p);
    const drop = Object.keys(f0.fuses).map((k) => f0.fuses[k] - f1.fuses[k]);
    check('R1+R3 bomb level: double tap on a blocked animal costs one heart and no fuse', drop.every((d) => d === 0) && f1.blocked === 1 && f1.hearts === f0.hearts - 1, `fuse drops ${drop}, blocked ${f1.blocked}, hearts ${f0.hearts}->${f1.hearts}`);
    const free = await p.evaluate(() => { const g = window.__game; const s = g.state(); return g.free().find((i) => s.fuses[i] === undefined); });
    await tap(p, free); await sleep(80); await tap(p, free);
    const f2 = await st(p);
    const drop2 = Object.keys(f1.fuses).map((k) => f1.fuses[k] - (f2.fuses[k] ?? NaN));
    check('R3 bomb level: one exit (tapped twice) lowers every fuse exactly once', drop2.every((d) => d === 1) && !f2.alive.includes(free), `fuse drops ${drop2}`);
    await sleep(2500);
    const f3 = await st(p);
    check('R3 bomb level: fuses unchanged while the runner finishes', JSON.stringify(f3.fuses) === JSON.stringify(f2.fuses), JSON.stringify(f3.fuses));
    report.info(`bomb bar: ${await p.evaluate(() => document.getElementById('bombBar').textContent)}`);
  });

  await scenario('R5 two fingers', CROSS, async (p) => {
    const cdp = await p.createCDPSession();
    const A = await pos(p, 1), B = await pos(p, 3);
    const pt = (q, id) => ({ x: q.x, y: q.y, id });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(A, 0)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(A, 0), pt(B, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(A, 0)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    const a = await st(p);
    check('R5 paths hidden after both fingers lift', (await p.evaluate(() => [...window.__game.views().values()].filter((v) => v.chevrons.visible).length)) === 0);
    check('R5 second finger does not cancel the first', !a.alive.includes(1) && !a.alive.includes(3) && a.taps === 2, `alive ${a.alive}, taps ${a.taps}`);
    // two fingers on one blocked animal: one tap
    const C = await pos(p, 4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(C, 0)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(C, 0), pt({ x: C.x + 3, y: C.y + 3 }, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(C, 0)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    const c = await st(p);
    const paths = await p.evaluate(() => [...window.__game.views().values()].filter((v) => v.chevrons.visible).length);
    check('R5 two fingers on one blocked animal: one heart', c.hearts === 2 && c.blocked === 1, `hearts ${c.hearts}`);
    check('R5 no path left showing after fingers lift', paths === 0, `paths showing ${paths}`);
  });

  await scenario('traffic and clear', CROSS, async (p) => {
    await tap(p, 1); await sleep(30); await tap(p, 2); await sleep(150); await tap(p, 4); await sleep(400); await tap(p, 3);
    const logical = await st(p);
    const early = await popup(p);
    await sleep(4000);
    const m = await p.evaluate(() => window.__mon);
    const s = await settled(p);
    check('logic: clear decided at the last tap', logical.cleared === true);
    check('screen: clear popup not shown while animals still run', early === null && m.earlyPopup === 0, `popup right after last tap: ${early}, frames with early popup ${m.earlyPopup}`);
    check('no pass-through: different animals never closer than one cell', m.min >= 0.98, `closest ${m.min.toFixed(3)}`);
    check('follower moved up before waiting', m.waits[2] !== undefined && m.waits[2] > m.startS[2] + 0.2, `2 waited at s=${m.waits[2]?.toFixed(2)} from ${m.startS[2]?.toFixed(2)}`);
    check('waiting animals resume by themselves', Object.keys(m.waits).every((id) => m.resumes[id]), `waits ${JSON.stringify(m.waits)} resumes ${JSON.stringify(m.resumes)}`);
    check('screen matches logic: every exited animal left the screen', s.runners === 0 && s.running === 0 && s.visible.length === 0, JSON.stringify(s));
    check('clear popup shows once all are off', (await popup(p)) === '구출 성공!');
    check('no page errors', p.errs.length === 0, p.errs.join(' | '));
  });

  await scenario('retry during a wait', CROSS, async (p) => {
    await tap(p, 1); await sleep(30); await tap(p, 2);
    for (let k = 0; k < 300 && (await p.evaluate(() => window.__game.traffic?.get(2)?.state)) !== 'waiting'; k++) await sleep(10);
    const waiting = await p.evaluate(() => window.__game.traffic.get(2)?.state);
    await p.click('#retry');
    await sleep(50);
    const s0 = await settled(p), a = await st(p);
    await sleep(3000);
    const s1 = await settled(p);
    check('retry during a wait clears the queue', waiting === 'waiting' && s0.runners === 0 && s0.running === 0 && s0.visible.length === 4, `was ${waiting}, after ${JSON.stringify(s0)}`);
    check('retry restores the start state', a.hearts === 3 && a.taps === 0 && a.alive.length === 4);
    check('nothing from the old run fires after retry', (await popup(p)) === null && s1.visible.length === 4 && s1.runners === 0, JSON.stringify(s1));
    check('no page errors', p.errs.length === 0, p.errs.join(' | '));
  });

  await scenario('fail and retry', CROSS, async (p) => {
    await tap(p, 1); await sleep(20);
    for (let k = 0; k < 3; k++) { await tap(p, 4); await sleep(420); }
    const a = await st(p), title = await popup(p);
    const runningAtFail = await p.evaluate(() => window.__game.traffic.runners.length);
    await p.click('#popupBtn');
    await sleep(2500);
    const s = await settled(p), c = await st(p);
    check('fail shows on the third blocked tap', a.failed && title === '하트가 모두 떨어졌어요', `${title}, runners then ${runningAtFail}`);
    check('retry after fail: clean board, no stray clear', s.runners === 0 && s.visible.length === 4 && c.hearts === 3 && (await popup(p)) === null, JSON.stringify(s));
    check('no page errors', p.errs.length === 0, p.errs.join(' | '));
  });

  // ?demo=bomb: the cross board with a bomb (fuse 2) on 2, which has to wait behind 1
  const BOMB = url('?demo=bomb');
  const bar = (p) => p.evaluate(() => { const b = document.getElementById('bombBar'); return b.hidden ? null : { text: b.textContent, cls: b.className }; });

  await scenario('bomb warning at 1', BOMB, async (p) => {
    const before = await bar(p);
    await tap(p, 1); await sleep(150);
    const at1 = await bar(p);
    if (process.env.E2E_SHOTS) await p.screenshot({ path: `${process.env.E2E_SHOTS}/bomb-bar-at-1.png` });
    check('bomb bar counts 2 at the start', before?.text.startsWith('💣 2번 남았어요'), JSON.stringify(before));
    check('bomb bar warns at 1 in the danger style', at1?.text === '💣 다른 친구가 한 번 더 나가면 터져요! 폭탄 친구를 먼저!' && at1.cls === 'danger', JSON.stringify(at1));
  });

  await scenario('bomb at 1: bomb first is saved while it waits', BOMB, async (p) => {
    await tap(p, 1); await sleep(30); await tap(p, 2); await sleep(30); await tap(p, 3);
    let waited = false;
    for (let k = 0; k < 300 && (await p.evaluate(() => window.__game.traffic.runners.length)) > 0; k++) {
      if ((await p.evaluate(() => window.__game.traffic.get(2)?.state)) === 'waiting') waited = true;
      await sleep(10);
    }
    const a = await st(p);
    check('bomb at 1: tapping the bomb then another saves it, even though it waited behind a runner', waited && !a.failed && !a.alive.includes(2) && (await popup(p)) === null, `waited ${waited}, ${JSON.stringify(a)}`);
  });

  await scenario('bomb at 1: another first sets it off', BOMB, async (p) => {
    await tap(p, 1); await sleep(30); await tap(p, 3); await sleep(30); await tap(p, 2);
    const a = await st(p);
    check('bomb at 1: tapping another animal first explodes it, the bomb tap after that is ignored', a.failed && a.alive.includes(2) && (await popup(p)) === '펑! 폭탄이 터졌어요', `${JSON.stringify(a)}, popup ${await popup(p)}`);
  });

  // run speed slowed so the first animal surely still runs when the level is lost
  await scenario('fail while another animal runs', CROSS, async (p) => {
    await p.evaluate(() => { window.__runSpeed = 1.2; });
    await tap(p, 1); await sleep(20);
    for (let k = 0; k < 3; k++) { await tap(p, 4); await sleep(420); }
    const atFail = await p.evaluate(() => ({ runners: window.__game.traffic.runners.length, running: [...window.__game.views().values()].filter((v) => v.running).length }));
    const title = await popup(p);
    const titles = [];
    for (let k = 0; k < 200 && (await p.evaluate(() => window.__game.traffic.runners.length)) > 0; k++) { titles.push(await popup(p)); await sleep(100); }
    titles.push(await popup(p));
    await sleep(300);
    const after = await settled(p), a = await st(p);
    check('fail while another animal runs: it was still running at the fail', atFail.runners === 1 && atFail.running === 1, JSON.stringify(atFail));
    check('fail while another animal runs: fail popup shown at once and never replaced', title === '하트가 모두 떨어졌어요' && titles.every((t) => t === title), `${titles.length} samples, titles seen ${[...new Set(titles)].join(' / ')}`);
    check('fail while another animal runs: the runner still leaves the board', after.runners === 0 && after.running === 0 && !after.visible.includes(1), JSON.stringify(after));
    check('fail while another animal runs: rules frozen after the fail', a.failed && a.hearts === 0 && a.alive.length === 3, JSON.stringify(a));
    await p.click('#popupBtn');
    await sleep(1500);
    const r = await settled(p), c = await st(p);
    check('fail while another animal runs: retry is clean', r.runners === 0 && r.visible.length === 4 && c.hearts === 3 && (await popup(p)) === null, JSON.stringify(r));
    check('no page errors', p.errs.length === 0, p.errs.join(' | '));
  });
}
