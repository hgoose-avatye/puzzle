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
      playing: window.__game.state() !== null,
    };
  });
  /** Close the first-time rule tips if they are showing. */
  const closeTips = async (p) => {
    if (await p.evaluate(() => !document.getElementById('popup').hidden && document.getElementById('popupBtn').textContent === '시작!')) await p.click('#popupBtn');
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
    check('flow: success popup with 다음 레벨 and 처음으로; level 2 saved', a.popup === '구출 성공!' && a.popupHome && a.saved === '2', JSON.stringify(a));
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
    check('flow: 처음으로 on the success popup -> title offering 이어하기 at level 2', a.title && a.popup === null && a.resume && a.where.startsWith('레벨 2'), JSON.stringify(a));
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
    check('flow: fail popup with 다시 하기 and 처음으로', a.popup === '하트가 모두 떨어졌어요' && a.popupHome, JSON.stringify(a));
    await p.click('#popupBtn');
    await sleep(500);
    const b = await ui(p);
    const hearts = await p.evaluate(() => window.__game.state().hearts);
    check('flow: 다시 하기 -> the same level 7, three hearts', b.label === '레벨 7' && b.popup === null && hearts === 3, `${JSON.stringify(b)}, hearts ${hearts}`);
    for (let k = 0; k < 3; k++) {
      await p.evaluate(() => { const g = window.__game; const free = g.free(); const blocked = g.ids().filter((i) => !free.includes(i)); g.tap(blocked[0]); });
      await sleep(450);
    }
    await waitPopup(p, 2000);
    await p.click('#popupHome');
    await sleep(400);
    const c = await ui(p);
    check('flow: 처음으로 on the fail popup -> title, save still 7', c.title && c.popup === null && c.saved === '7', JSON.stringify(c));
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

  await scenario('dev entry', null, async (p) => {
    const a = await ui(p);
    check('flow: dev URL ?level=3 still goes straight into play', !a.title && a.label === '레벨 3' && a.playing, JSON.stringify(a));
  }, '?level=3');
}
