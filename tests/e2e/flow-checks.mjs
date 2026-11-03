// The title -> play -> success / fail -> next / retry / home flow, opened without dev parameters (as a build opens).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROGRESS = 'animal-rescue-progress';

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} base game URL
 * @param {{ pass: Function, fail: Function, skip: Function, info: Function }} report
 */
export async function runFlowChecks(browser, base, report) {
  const check = (name, ok, info = '') => (ok ? report.pass(name, info) : report.fail(name, info));

  /** Open the game with this saved progress (null: none) and an empty rule-tip history. */
  async function open(saved, query = '') {
    const p = await browser.newPage();
    await p.evaluateOnNewDocument((key, s) => {
      if (sessionStorage.getItem('e2e-ready')) return; // keep storage across reloads within one scenario
      localStorage.clear();
      if (s !== null) localStorage.setItem(key, s);
      sessionStorage.setItem('e2e-ready', '1');
    }, PROGRESS, saved);
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto(new URL(query, base).href, { waitUntil: 'networkidle0' });
    await sleep(400);
    return p;
  }
  const ui = (p) => p.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    return {
      title: vis('title'), start: vis('tStart'), resume: vis('tContinue'), restart: vis('tRestart'), where: document.getElementById('tWhere').textContent,
      hud: vis('hud'), popup: vis('popup') ? document.getElementById('popupTitle').textContent : null, popupHome: vis('popupHome'),
      label: document.getElementById('levelLabel').textContent, saved: localStorage.getItem('animal-rescue-progress'),
      // a level is in play (the title runs its own little board, which does not count)
      playing: window.__game.state() !== null && document.getElementById('title').hidden,
    };
  });
  /** Close the first-time rule tips if they are showing. */
  const closeTips = async (p) => {
    if (await p.evaluate(() => !document.getElementById('popup').hidden && document.getElementById('popupBtn').textContent === '알겠어요')) await p.click('#popupBtn');
    await sleep(100);
  };
  /** Send out every animal (rules decide at once); returns the number of taps. */
  const clearAll = (p) => p.evaluate(() => { let n = 0; for (let k = 0; k < 200; k++) { const f = window.__game.free(); if (!f.length) break; window.__game.tap(f[0]); n++; } return n; });
  const waitPopup = async (p, ms = 15000) => { for (let t = 0; t < ms; t += 100) { const s = await ui(p); if (s.popup) return s; await sleep(100); } return ui(p); };

  async function scenario(name, saved, body, query = '') {
    let p;
    try {
      p = await open(saved, query);
      await body(p);
      if (p.errs.length) report.fail(`${name}: page errors`, p.errs.join(' | '));
    } catch (e) {
      report.fail(`${name} (scenario crashed)`, String(e?.message ?? e));
    } finally {
      await p?.close().catch(() => {});
    }
  }

  await scenario('first run', null, async (p) => {
    const a = await ui(p);
    check('flow: first run opens on the title with one "게임 시작" button', a.title && a.start && !a.resume && !a.restart && !a.hud && !a.playing, JSON.stringify(a));
    await p.click('#tStart');
    await sleep(500);
    const b = await ui(p);
    check('flow: 게임 시작 -> level 1, title gone, HUD back', !b.title && b.hud && b.playing && b.label === '레벨 1', JSON.stringify(b));
  });

  await scenario('continue', '7', async (p) => {
    const a = await ui(p);
    check('flow: with a save the title offers 이어하기 (level 7) and 처음부터', a.title && !a.start && a.resume && a.restart && a.where.startsWith('레벨 7'), JSON.stringify(a));
    await p.click('#tContinue');
    await sleep(500);
    const b = await ui(p);
    check('flow: 이어하기 -> the saved level 7', !b.title && b.label === '레벨 7', JSON.stringify(b));
  });

  await scenario('from the start', '7', async (p) => {
    await p.click('#tRestart');
    await sleep(500);
    const b = await ui(p);
    check('flow: 처음부터 -> level 1, the save (7) kept', !b.title && b.label === '레벨 1' && b.saved === '7', JSON.stringify(b));
  });

  await scenario('home while playing, then start again', '7', async (p) => {
    await p.click('#tContinue');
    await sleep(400);
    await closeTips(p);
    await p.click('#home');
    await sleep(300);
    const a = await ui(p);
    check('flow: home button -> title, nothing in play, no popup, save kept', a.title && !a.hud && !a.playing && a.popup === null && a.saved === '7', JSON.stringify(a));
    await p.click('#tContinue');
    await sleep(400);
    await closeTips(p);
    const exited = await p.evaluate(() => { const f = window.__game.free(); if (!f.length) return null; window.__game.tap(f[0]); return !window.__game.state().alive.includes(f[0]); });
    const b = await ui(p);
    check('flow: after going home, 이어하기 starts level 7 again and taps work', !b.title && b.label === '레벨 7' && exited === true, `${JSON.stringify(b)}, exited ${exited}`);
  });

  await scenario('home while animals run', null, async (p) => {
    await p.click('#tStart');
    await sleep(400);
    await closeTips(p);
    await p.evaluate(() => { window.__runSpeed = 0.6; });
    const taps = await clearAll(p);
    const cleared = await p.evaluate(() => window.__game.state().cleared);
    const running = await p.evaluate(() => [...window.__game.views().values()].filter((v) => v.running).length);
    await p.click('#home');
    const seen = [];
    for (let t = 0; t < 40; t++) { seen.push((await ui(p)).popup); await sleep(150); }
    const a = await ui(p);
    check('flow: home while the last animals still run -> no late result popup on the title', cleared && running > 0 && a.title && seen.every((x) => x === null), `taps ${taps}, cleared ${cleared}, running at home ${running}, popups seen ${[...new Set(seen)].join('/')}`);
  });

  await scenario('success -> next level', null, async (p) => {
    await p.click('#tStart');
    await sleep(400);
    await closeTips(p);
    await clearAll(p);
    const a = await waitPopup(p);
    check('flow: success popup with 다음 레벨 and 홈으로; level 2 saved', a.popup === '구출 성공!' && a.popupHome && a.saved === '2', JSON.stringify(a));
    await p.click('#popupBtn');
    await sleep(600);
    const b = await ui(p);
    check('flow: 다음 레벨 -> level 2', b.label === '레벨 2' && !b.title, JSON.stringify(b));
  });

  await scenario('success -> home', null, async (p) => {
    await p.click('#tStart');
    await sleep(400);
    await closeTips(p);
    await clearAll(p);
    await waitPopup(p);
    await p.click('#popupHome');
    await sleep(400);
    const a = await ui(p);
    check('flow: 홈으로 on the success popup -> title offering 이어하기 at level 2', a.title && a.popup === null && a.resume && a.where.startsWith('레벨 2'), JSON.stringify(a));
  });

  await scenario('fail -> retry and home', '7', async (p) => {
    await p.click('#tContinue');
    await sleep(400);
    await closeTips(p);
    // three blocked taps (another animal each time, or the same one after its 0.4 s shake)
    for (let k = 0; k < 3; k++) {
      await p.evaluate(() => { const g = window.__game; const free = g.free(); const blocked = g.ids().filter((i) => !free.includes(i)); g.tap(blocked[0]); });
      await sleep(450);
    }
    const a = await ui(p);
    check('flow: fail popup with 다시 하기 and 홈으로', a.popup === '하트가 모두 떨어졌어요' && a.popupHome, JSON.stringify(a));
    const shown = await p.evaluate(() => document.querySelectorAll('#popupHearts .heart.empty').length);
    check('flow: hearts-out popup shows the used (empty) hearts', shown === 3, `empty hearts ${shown}`);
    // the fail popup's 다시 하기 retries at once: the retry question is only for the bottom bar
    await p.click('#popupBtn');
    await sleep(500);
    const b = await ui(p);
    const hearts = await p.evaluate(() => window.__game.state().hearts);
    const asked = await p.evaluate(() => !document.getElementById('modal').hidden);
    check('flow: 다시 하기 -> the same level 7, three hearts, no retry question', b.label === '레벨 7' && b.popup === null && hearts === 3 && !asked, `${JSON.stringify(b)}, hearts ${hearts}, asked ${asked}`);
    for (let k = 0; k < 3; k++) {
      await p.evaluate(() => { const g = window.__game; const free = g.free(); const blocked = g.ids().filter((i) => !free.includes(i)); g.tap(blocked[0]); });
      await sleep(450);
    }
    await waitPopup(p, 2000);
    await p.click('#popupHome');
    await sleep(400);
    const c = await ui(p);
    check('flow: 홈으로 on the fail popup -> title, save still 7', c.title && c.popup === null && c.saved === '7', JSON.stringify(c));
  });

  // the last level: clearing it starts the journey over (the save goes back to 1, as the game always did)
  await scenario('last level', '180', async (p) => {
    await p.click('#tContinue');
    await sleep(500);
    await closeTips(p);
    const at = (await ui(p)).label;
    await clearAll(p);
    const a = await waitPopup(p, 30000);
    check('flow: clearing level 180 saves level 1 (journey starts over)', at === '레벨 180' && a.popup === '구출 성공!' && a.saved === '1', `${at}, ${JSON.stringify(a)}`);
    await p.click('#popupHome');
    await sleep(400);
    const b = await ui(p);
    check('flow: after the last level the title offers only 게임 시작 (level 1), no 이어하기', b.title && b.start && !b.resume, JSON.stringify(b));
    await p.click('#tStart');
    await sleep(500);
    check('flow: 게임 시작 after the last level -> level 1', (await ui(p)).label === '레벨 1');
  });

  const modalUi = (p) => p.evaluate(() => ({
    open: !document.getElementById('modal').hidden, title: document.getElementById('modalTitle').textContent,
    state: JSON.stringify(window.__game.state()),
  }));

  await scenario('retry asks once something was tapped', '7', async (p) => {
    await p.click('#tContinue');
    await sleep(400);
    await closeTips(p);
    await p.click('#retry');
    await sleep(200);
    const fresh = await modalUi(p);
    check('retry: nothing tapped yet -> restarts at once, no question', !fresh.open, JSON.stringify(fresh));
    await p.evaluate(() => { const g = window.__game; g.tap(g.free()[0]); });
    const before = await p.evaluate(() => JSON.stringify(window.__game.state()));
    await p.click('#retry');
    await sleep(200);
    const asked = await modalUi(p);
    check('retry: after a tap the bottom 다시 하기 asks first', asked.open && asked.title === '다시 할까요?', JSON.stringify(asked));
    await p.click('#retryNo');
    await sleep(300);
    const kept = await modalUi(p);
    check('retry: 취소 closes the question and keeps the board as it was', !kept.open && kept.state === before, `${before} -> ${kept.state}`);
    await p.click('#retry');
    await sleep(200);
    await p.click('#retryYes');
    await sleep(400);
    const reset = await p.evaluate(() => window.__game.state());
    check('retry: 다시 하기 in the question restarts level 7', !(await modalUi(p)).open && reset.taps === 0 && reset.hearts === 3 && (await ui(p)).label === '레벨 7', JSON.stringify(reset));
  });

  await scenario('sound button on the title and in play', null, async (p) => {
    const onTitle = await p.evaluate(() => { const m = document.getElementById('mute'); return !document.getElementById('title').hidden && getComputedStyle(m).display !== 'none'; });
    await p.click('#mute');
    await sleep(100);
    const off = await p.evaluate(() => ({ stored: localStorage.getItem('animal-rescue-muted'), muted: document.getElementById('mute').classList.contains('muted') }));
    check('sound: the title shows the sound button and one tap switches the sound off (saved)', onTitle && off.stored === '1' && off.muted, JSON.stringify(off));
    await p.click('#tStart');
    await sleep(500);
    await closeTips(p);
    const inPlay = await p.evaluate(() => getComputedStyle(document.getElementById('mute')).display !== 'none' && document.getElementById('mute').classList.contains('muted'));
    await p.click('#mute');
    await sleep(100);
    const on = await p.evaluate(() => localStorage.getItem('animal-rescue-muted'));
    check('sound: in play the same button shows the setting and switches it back on', inPlay && on === '0', `inPlay ${inPlay}, stored ${on}`);
  });

  await scenario('bomb fail', null, async (p) => {
    for (let k = 0; k < 40 && !(await ui(p)).popup; k++) {
      const id = await p.evaluate(() => { const g = window.__game; const s = g.state(); return g.free().find((i) => s.fuses[i] === undefined) ?? null; });
      if (id === null) break;
      await p.evaluate((i) => window.__game.tap(i), id);
      await sleep(300);
    }
    const a = await waitPopup(p, 4000);
    const hearts = await p.evaluate(() => document.querySelectorAll('#popupHearts .heart').length);
    check('bomb fail: the popup names the bomb and shows no hearts', a.popup === '펑! 폭탄이 터졌어요' && hearts === 0, `${JSON.stringify(a)}, hearts ${hearts}`);
  }, '?demo=bomb');

  // the title's front animal runs out on a loop; nothing of that loop may reach the game
  await scenario('title loop', null, async (p) => {
    const alive = () => p.evaluate(() => window.__game.ids().length);
    const start = await alive();
    let left = start;
    for (let t = 0; t < 40 && left === start; t++) { await sleep(100); left = await alive(); }
    let back = left;
    for (let t = 0; t < 50 && back !== start; t++) { await sleep(100); back = await alive(); }
    const band = await p.evaluate(() => getComputedStyle(document.getElementById('title')).getPropertyValue('--board-top'));
    check('title: one animal runs out, then the board starts over', start === 5 && left === 4 && back === 5 && band !== '', `start ${start}, after the run ${left}, again ${back}, board top ${band}`);
    await p.click('#tStart');
    await sleep(600);
    await closeTips(p);
    const s = await p.evaluate(() => window.__game.state());
    await sleep(3000); // longer than a title round: no title timer may touch the level
    const later = await p.evaluate(() => window.__game.state());
    check('title: 게임 시작 -> level 1 untouched by the title loop', (await ui(p)).label === '레벨 1' && s.taps === 0 && later.taps === 0 && later.alive.length === s.alive.length, `${JSON.stringify(s)} -> ${JSON.stringify(later)}`);
  });

  await scenario('title keeps the logo and board in place with a save', '7', async (p) => {
    const withSave = await p.evaluate(() => getComputedStyle(document.getElementById('title')).getPropertyValue('--board-top'));
    const q = await browser.newPage();
    await q.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await q.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch { /* about:blank */ } });
    await q.goto(base, { waitUntil: 'networkidle0' });
    await sleep(400);
    const fresh = await q.evaluate(() => getComputedStyle(document.getElementById('title')).getPropertyValue('--board-top'));
    await q.close();
    check('title: the board sits at the same height with one button or two', withSave !== '' && withSave === fresh, `with a save ${withSave}, fresh ${fresh}`);
  });

  await scenario('dev entry', null, async (p) => {
    const a = await ui(p);
    check('flow: dev URL ?level=3 still goes straight into play', !a.title && a.label === '레벨 3' && a.playing, JSON.stringify(a));
  }, '?level=3');
}
