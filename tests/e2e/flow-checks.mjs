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
  /** Close the chick's first-time tutorial if it is showing (건너뛰기, or the bubble of a look-only one). */
  const closeTips = async (p) => {
    await p.evaluate(() => { const t = document.getElementById('tutorial'); if (t && !t.hidden) [...t.querySelectorAll('.tutSkip, #tutorial.info .tutBubble')].find((b) => !b.hidden)?.click(); });
    await sleep(100);
  };
  /** Send out every animal (rules decide at once); returns the number of taps. */
  const clearFree = (p) => p.evaluate(() => { let n = 0; for (let k = 0; k < 200; k++) { const f = window.__game.free(); if (!f.length) break; window.__game.tap(f[0]); n++; } return n; });
  // taps what the hint suggests until the level is over: free animals, and at a knot the push that untangles it (a
  // push is held back while an animal still runs, so it is tried again after a moment)
  const clearAll = async (p) => {
    let n = 0;
    for (let k = 0; k < 300; k++) {
      const r = await p.evaluate(() => { const g = window.__game; const s = g.state(); if (!s || s.cleared || s.failed) return null; const id = g.hint(); return id === null ? null : g.tap(id); });
      if (r === null) break;
      n++;
      if (r === 'repeat (R1)') await sleep(250);
    }
    return n;
  };
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

  await scenario('stuck board -> undo and home', '10', async (p) => {
    // (settle is defined with the tutorial checks further down; this one waits the same way)
    const settle = async (p) => { for (let t = 0; t < 80 && await p.evaluate(() => [...window.__game.views().values()].some((v) => v.running)); t++) await sleep(100); await sleep(150); };
    await p.click('#tContinue');
    await sleep(400);
    await closeTips(p);
    const undos0 = await p.evaluate(() => ({ undos: window.__game.undos(), label: document.querySelector('#undo span').textContent }));
    check('flow: a level starts with three undos, shown on the button', undos0.undos === 3 && undos0.label === '되돌리기 3', JSON.stringify(undos0));
    // level 10 (baked 2026-11-07): once every free animal is out, pushing animal 3 and taking out whatever that frees
    // leaves a board where nothing can leave or move (scratchpad stuckpath.ts over levels.json; re-check after a rebake)
    await clearFree(p);
    await settle(p);
    const pushed = await p.evaluate(() => window.__game.tap(3));
    await settle(p);
    await clearFree(p);
    await settle(p);
    const stuck = await p.evaluate(() => ({ stuck: window.__game.stuck(), msg: document.getElementById('msg').textContent, nudge: document.getElementById('undo').classList.contains('nudge'), undos: window.__game.undos() }));
    check('flow: a board where nothing can move says 길이 막혔어요 with the undos left, and the undo button nudges', pushed === 'blocked' && stuck.stuck && stuck.nudge && stuck.msg.includes('막혔') && stuck.msg.includes('3번'), `${pushed} ${JSON.stringify(stuck)}`);
    await p.click('#undo');
    await settle(p);
    const back = await p.evaluate(() => ({ stuck: window.__game.stuck(), msg: document.getElementById('msg').textContent, nudge: document.getElementById('undo').classList.contains('nudge'), undos: window.__game.undos(), hearts: window.__game.state().hearts }));
    check('flow: 되돌리기 takes the last push back (board no longer stuck), costs one undo; no hearts anywhere', !back.stuck && !back.nudge && back.undos === 2 && back.hearts == null, JSON.stringify(back));
    await p.click('#home');
    await sleep(400);
    const c = await ui(p);
    check('flow: 홈으로 in play -> title, save still 10', c.title && c.popup === null && c.saved === '10', JSON.stringify(c));
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
    check('retry: 다시 하기 in the question restarts level 7 (no hearts)', !(await modalUi(p)).open && reset.taps === 0 && reset.hearts == null && (await ui(p)).label === '레벨 7', JSON.stringify(reset));
  });

  // UI v0.2: the sound switch (#mute) lives in the settings card, opened from the settings button on the title and in play
  await scenario('sound switch in the settings, on the title and in play', null, async (p) => {
    const onTitle = await p.evaluate(() => { const s = document.getElementById('settings'); return !document.getElementById('title').hidden && getComputedStyle(s).display !== 'none'; });
    await p.click('#settings');
    await sleep(100);
    await p.click('#mute');
    await sleep(100);
    const off = await p.evaluate(() => ({ stored: localStorage.getItem('animal-rescue-muted'), muted: document.getElementById('mute').classList.contains('muted') }));
    check('sound: the title has the settings button and its sound switch turns the sound off (saved)', onTitle && off.stored === '1' && off.muted, JSON.stringify(off));
    await p.click('#settingsClose');
    await p.click('#tStart');
    await sleep(500);
    await closeTips(p);
    await p.click('#settings');
    await sleep(100);
    const inPlay = await p.evaluate(() => getComputedStyle(document.getElementById('mute')).display !== 'none' && document.getElementById('mute').classList.contains('muted'));
    await p.click('#mute');
    await sleep(100);
    const on = await p.evaluate(() => localStorage.getItem('animal-rescue-muted'));
    await p.click('#settingsClose');
    check('sound: in play the settings show the same switch, still off, and it turns the sound back on', inPlay && on === '0', `inPlay ${inPlay}, stored ${on}`);
  });

  await scenario('bomb fail', null, async (p) => {
    // the demo's two pushers: each push burns the fuse (2) once
    for (const id of [5, 6]) {
      await p.evaluate((i) => window.__game.tap(i), id);
      for (let k = 0; k < 60 && await p.evaluate(() => [...window.__game.views().values()].some((v) => v.running)); k++) await sleep(50);
      await sleep(150);
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

  // the chick's first-time tutorials: done only by the real thing (a touch in the spotlight) or by 건너뛰기, one per
  // level, the level's own new rule first, never while an animal runs, and the result popup always wins
  const ALL_TIPS = ['basic', 'blocked', 'arrow', 'key', 'sleep', 'bomb', 'crate', 'crate2', 'cratePush'];
  /** Nothing of a tutorial is left: no focus veil, the HUD not dimmed, nothing on screen. */
  const restored = (p) => p.evaluate(() => window.__game.focus() === 0 && !document.body.classList.contains('tut-on') && window.__game.tutorial() === null);
  /** Open a level with this save of learnt tips (the page keeps its storage across the reload). */
  const withSeen = async (p, seen, query) => {
    await p.evaluate((s) => localStorage.setItem('animal-rescue-seen', JSON.stringify(s)), seen);
    await p.goto(new URL(query, base).href, { waitUntil: 'networkidle0' });
    await sleep(900);
  };
  const tut = (p) => p.evaluate(() => window.__game.tutorial());
  const seenNow = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('animal-rescue-seen') ?? '[]'));
  const settle = async (p) => { for (let t = 0; t < 80 && await p.evaluate(() => [...window.__game.views().values()].some((v) => v.running)); t++) await sleep(100); await sleep(150); };

  await scenario('tutorial: level 1 is learnt by a real touch in the spotlight', null, async (p) => {
    await p.click('#tStart');
    await sleep(700);
    const t = await tut(p);
    const free = await p.evaluate(() => window.__game.free());
    check('tutorial: level 1 opens with the first rule on an animal that can leave', t?.id === 'basic' && free.includes(t.target) && t.spot !== null, JSON.stringify(t));
    // a touch on another animal, outside the spotlight, does nothing
    const other = await p.evaluate((t) => { for (const id of window.__game.ids()) { if (id === t.target) continue; const q = window.__game.screenOf(id); if (q && Math.hypot(q.x - t.spot.x, q.y - t.spot.y) > t.spot.r + 10) return q; } return null; }, t);
    if (other) await p.touchscreen.tap(other.x, other.y);
    await sleep(300);
    const held = await p.evaluate(() => window.__game.state().taps);
    await p.touchscreen.tap(t.spot.x, t.spot.y);
    await sleep(400);
    const after = await p.evaluate((id) => ({ s: window.__game.state(), gone: !window.__game.state().alive.includes(id) }), t.target);
    const seen = await seenNow(p);
    check('tutorial: a touch outside the spotlight is held back', other !== null && held === 0, `other ${JSON.stringify(other)}, taps ${held}`);
    check('tutorial: the touch in the spotlight is the game tap on that animal only, and the rule is learnt', after.gone && after.s.taps === 1 && after.s.blocked === 0 && (await restored(p)) && seen.includes('basic'), `${JSON.stringify(after.s)}, seen ${JSON.stringify(seen)}`);
  });

  await scenario('tutorial: 건너뛰기 counts as learnt and taps nothing', null, async (p) => {
    // no level has locks since 2026-11-06: the sleep tutorial on level 91 stands in
    await withSeen(p, ALL_TIPS.filter((id) => id !== 'sleep'), '?level=91');
    const t = await tut(p);
    await p.click('#tutorial .tutSkip');
    await sleep(200);
    const s = await p.evaluate(() => window.__game.state());
    check('tutorial: level 91 opens with the sleep tutorial on a free neighbour, and 건너뛰기 learns it without a tap', t?.id === 'sleep' && (await restored(p)) && (await seenNow(p)).includes('sleep') && s.taps === 0, `${JSON.stringify(t)}, taps ${s.taps}`);
  });

  await scenario('tutorial: a blocked tap teaches itself in play (no tutorial on 7)', null, async (p) => {
    // level 7 (hand-made): a blocked tap costs nothing and moves the animal when it has room; level 11 opens on the
    // crate lesson since 2026-11-07 (its own scenario below)
    await withSeen(p, ['basic', 'blocked', 'arrow', 'bump'], '?level=7');
    const moved = await p.evaluate(() => { const g = window.__game; const f = new Set(g.free()); const id = g.ids().find((i) => !f.has(i)); const before = JSON.stringify(g.state().cells[id]); const r = g.tap(id); return { r, moved: JSON.stringify(g.state().cells[id]) !== before, hearts: g.state().hearts }; });
    await settle(p);
    const seven = await tut(p);
    check('tutorial: no tutorial on level 7; the blocked tap there is blocked, takes no heart', seven === null && moved.r === 'blocked' && moved.hearts == null, `7 ${JSON.stringify(seven)}, blocked tap ${JSON.stringify(moved)}`);
  });

  await scenario('tutorial: after the sleep tap the woken animal is lit for a moment, then play goes on', null, async (p) => {
    await withSeen(p, ALL_TIPS.filter((id) => id !== 'sleep'), '?level=91');
    const t = await tut(p);
    await p.touchscreen.tap(t.spot.x, t.spot.y);
    await sleep(250);
    const during = await p.evaluate(() => ({ t: window.__game.tutorial(), focus: window.__game.focus() }));
    await sleep(1100);
    check('tutorial: the sleep tap lights up the woken animal briefly, then everything is back and the rule is learnt', during.t?.phase === 'result' && during.focus > 0 && (await restored(p)) && (await seenNow(p)).includes('sleep'), JSON.stringify(during));
  });

  await scenario('tutorial: dev ?level=11 on an empty save opens on level 11\u2019s own lesson, not the first rule', null, async (p) => {
    await p.evaluate(() => localStorage.removeItem('animal-rescue-seen'));
    await p.goto(new URL('?level=11', base).href, { waitUntil: 'networkidle0' });
    await sleep(900);
    const t = await tut(p);
    const seen = await seenNow(p);
    check('tutorial: an empty save opened on 11 counts the lessons before it and shows the crate lesson', t?.id === 'crate' && JSON.stringify(seen) === JSON.stringify(['basic', 'blocked', 'arrow', 'bump']), `${JSON.stringify(t)} seen ${JSON.stringify(seen)}`);
  });

  await scenario('tutorial: level 11 teaches the one-crack crate by the neighbour\u2019s real exit; the held animal lights up', null, async (p) => {
    await withSeen(p, ['basic', 'blocked', 'arrow', 'bump'], '?level=11');
    const shown = await tut(p);
    check('tutorial: level 11 opens on crate, pointing at the crate\u2019s free neighbour (2)', shown?.id === 'crate' && shown.target === 2, JSON.stringify(shown));
    if (shown) await p.touchscreen.tap(shown.spot.x, shown.spot.y);
    await sleep(400);
    const during = await tut(p);
    const said = await p.evaluate(() => document.querySelector('#tutorial .tutBubble')?.textContent ?? '');
    const crates = await p.evaluate(() => window.__game.state().cells && window.__game.ids().length);
    await settle(p);
    await sleep(2000); // the result says why, for two seconds
    const seen = await seenNow(p);
    check('tutorial: after the exit the crate is gone, the animal it held (1) is the result with the words why, and crate is learnt', during?.phase === 'result' && during.target === 2 && said.includes('길이 열렸어') && seen.includes('crate') && (await restored(p)), `${JSON.stringify(during)} alive ${crates} seen ${seen}`);
    const free1 = await p.evaluate(() => window.__game.free().includes(1));
    check('tutorial: animal 1 can leave once the crate broke', free1, String(free1));
  });

  await scenario('tutorial: level 12 (hand-made) teaches the two-crack crate by free play: words on the crate, no cell marked, learnt on the break', null, async (p) => {
    await withSeen(p, ['basic', 'blocked', 'arrow', 'bump', 'crate'], '?level=12');
    const shown = await tut(p);
    const lesson = await p.evaluate(() => window.__game.crateLesson());
    check('tutorial: level 12 opens on crate2 with the lesson on the crate (3,4), the held animal 4 known, no animal to tap', shown?.id === 'crate2' && shown.target === 0 && lesson?.x === 3 && lesson.y === 4 && JSON.stringify(lesson.held) === '[4]', `${JSON.stringify(shown)} ${JSON.stringify(lesson)}`);
    // no orange tile on any cell (the neighbour tiles were removed, 2026-11-08 request)
    const orange = await p.evaluate(() => { let n = 0; window.__game.scene().traverse((o) => { const m = o.material; if (o.visible && m && !Array.isArray(m) && m.color && m.color.getHex() === 0xff8a1c && Math.abs(m.opacity - 0.45) < 0.01) n++; }); return n; });
    check('tutorial: level 12 marks no cell on the board', orange === 0, `orange meshes ${orange}`);
    // a discovery lesson (2026-11-08): a touch on the crate's spot is held, the bubble is what closes the words, and
    // neither taps an animal
    const before = await p.evaluate(() => window.__game.ids().length);
    if (shown) await p.touchscreen.tap(shown.spot.x, shown.spot.y);
    await sleep(300);
    const held = await p.evaluate(() => window.__game.tutorial()?.id ?? null);
    check('tutorial: a touch on the crate itself is held by the discovery lesson', held === 'crate2', String(held));
    const bubble = await p.evaluate(() => { const b = document.querySelector('#tutorial .tutBubble').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await p.touchscreen.tap(bubble.x, bubble.y);
    await sleep(400);
    const closed = await p.evaluate(() => ({ tut: window.__game.tutorial(), alive: window.__game.ids().length, lesson: !!window.__game.crateLesson(), seen: JSON.parse(localStorage.getItem('animal-rescue-seen')) }));
    check('tutorial: closing the words removes nothing from the board, keeps the lesson on and does not learn it', closed.tut === null && closed.alive === before && closed.lesson && !closed.seen.includes('crate2'), JSON.stringify(closed));
    // the far animal (3) first: the crate stays and the game says so once
    await p.evaluate(() => window.__game.tap(3)); await sleep(300);
    const far = await p.evaluate(() => ({ msg: document.getElementById('msg').textContent, told: window.__game.crateLesson()?.toldElsewhere }));
    await settle(p);
    check('tutorial: an exit from elsewhere leaves the crate whole and says 옆이 아니라서 그대로 (once)', far.msg.includes('옆이 아니라서') && far.told === true, JSON.stringify(far));
    // a neighbour (1): one crack; the other (2): the break, the lesson learnt, 4 free
    await p.evaluate(() => window.__game.tap(1)); await sleep(300);
    const one = await p.evaluate(() => document.getElementById('msg').textContent);
    const crackSaid = await p.evaluate(() => (document.getElementById('tutorial').hidden ? '' : document.querySelector('#tutorial .tutBubble')?.textContent ?? ''));
    await settle(p); await sleep(1800);
    await p.evaluate(() => window.__game.tap(2)); await sleep(400);
    const broke = await p.evaluate(() => ({ said: document.getElementById('tutorial').hidden ? '' : document.querySelector('#tutorial .tutBubble')?.textContent ?? '', msg: document.getElementById('msg').textContent, lesson: window.__game.crateLesson(), seen: JSON.parse(localStorage.getItem('animal-rescue-seen')), free4: window.__game.free().includes(4) }));
    await settle(p);
    check('tutorial: a neighbour\u2019s exit says a dot went (the chick too); the second breaks the crate (the chick says so), learns crate2 and frees 4', one.includes('점이 하나') && crackSaid.includes('하나 더') && broke.said.includes('부서졌어') && broke.msg.includes('부서졌') && broke.lesson === null && broke.seen.includes('crate2') && broke.free4, `${one} | ${JSON.stringify(broke)}`);
  });

  await scenario('tutorial: on level 12 the neighbours first, the far animal last also completes the lesson', null, async (p) => {
    await withSeen(p, ['basic', 'blocked', 'arrow', 'bump', 'crate'], '?level=12');
    await p.evaluate(() => window.__game.tap(1)); await settle(p);
    await p.evaluate(() => window.__game.tap(2)); await sleep(400);
    const learnt = await p.evaluate(() => JSON.parse(localStorage.getItem('animal-rescue-seen')).includes('crate2'));
    await settle(p);
    await p.evaluate(() => window.__game.tap(3)); await settle(p);
    const after = await p.evaluate(() => ({ msg: document.getElementById('msg').textContent, lesson: window.__game.crateLesson(), free4: window.__game.free().includes(4) || !window.__game.ids().includes(4) }));
    check('tutorial: any order works: learnt on the break, no hanging lesson, 4 free', learnt && after.lesson === null && after.free4, JSON.stringify(after));
  });

  await scenario('tutorial: level 13 teaches the push beside a crate: the push, the crate lit with it, learnt when the crate breaks', null, async (p) => {
    await withSeen(p, ['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2'], '?level=13');
    const shown = await tut(p);
    check('tutorial: level 13 opens on cratePush, pointing at the one push (animal 1)', shown?.id === 'cratePush' && shown.target === 1 && shown.spot !== null, JSON.stringify(shown));
    if (shown) await p.touchscreen.tap(shown.spot.x, shown.spot.y);
    await sleep(1300); // the push runs up beside the crate
    const arrived = await p.evaluate(() => ({ t: window.__game.tutorial(), focus: window.__game.focus(), bubble: document.querySelector('#tutorial .tutBubble')?.textContent, msg: document.getElementById('msg').textContent, seen: JSON.parse(localStorage.getItem('animal-rescue-seen')) }));
    check('tutorial: once it stands beside the crate, it and the crate stay lit and the chick says leaving there breaks it; not learnt yet', arrived.t?.phase === 'result' && arrived.focus >= 2 && arrived.bubble?.includes('부서져') && arrived.msg.includes('상자 옆에서 나가면') && !arrived.seen.includes('cratePush'), JSON.stringify(arrived));
    await sleep(2300);
    const between = await restored(p);
    // the chain clears (4, 3, 2), then 1 leaves from beside the crate
    for (const id of [4, 3, 2]) { await p.evaluate((i) => window.__game.tap(i), id); await settle(p); }
    await p.evaluate(() => window.__game.tap(1)); await sleep(400);
    const broke = await p.evaluate(() => ({ msg: document.getElementById('msg').textContent, focus: window.__game.focus(), seen: JSON.parse(localStorage.getItem('animal-rescue-seen')) }));
    await settle(p);
    const free5 = await p.evaluate(() => window.__game.free().includes(5));
    check('tutorial: the words go by themselves; when 1 leaves from beside the crate it breaks, cratePush is learnt and the held animal (5) lights up and is free', between && broke.msg.includes('부서졌') && broke.focus > 0 && broke.seen.includes('cratePush') && free5, `${between} ${JSON.stringify(broke)} free5 ${free5}`);
  });

  await scenario('tutorial: the result popup comes before a tutorial', null, async (p) => {
    // level 40 (the first dynamite) opens on the bomb tutorial; pushes made around it (the test hook, not a finger) set it off
    await withSeen(p, ALL_TIPS.filter((id) => id !== 'bomb'), '?level=40');
    const t = await tut(p);
    // the dynamite counts its own collisions: push an animal that collides with it (the dev hook lists them) until it goes off
    for (let k = 0; k < 24 && await p.evaluate(() => document.getElementById('popup').hidden); k++) {
      // the lesson on 40 sits on the dynamite itself (no tap leads to it), so the dynamite is a push like any other here
      await p.evaluate((k) => { const g = window.__game; const free = g.free(); const ids = g.bombTouches(); const rest = g.ids().filter((i) => !free.includes(i)); const pool = ids.length ? ids : rest; if (pool.length) g.tap(pool[k % pool.length]); }, k);
      await settle(p);
    }
    await sleep(600);
    const popup = await p.evaluate(() => document.getElementById('popup').hidden ? null : document.getElementById('popupTitle').textContent);
    check('tutorial: when the bomb goes off the fail popup shows, the tutorial is gone and not learnt', t?.id === 'bomb' && popup === '펑! 폭탄이 터졌어요' && (await restored(p)) && !(await seenNow(p)).includes('bomb'), `${JSON.stringify(t)}, popup ${popup}`);
  });

  await scenario('tutorial: level 2 points at a blocked animal; its touch only shakes it, then the one in front lights up', null, async (p) => {
    await withSeen(p, ['basic'], '?level=2');
    const shown = await tut(p);
    if (shown) await p.touchscreen.tap(shown.spot.x, shown.spot.y);
    await sleep(150);
    const during = await tut(p);
    const s = await p.evaluate(() => window.__game.state());
    await sleep(1200);
    const stays = shown ? s.alive.includes(shown.target) : false;
    check('tutorial: level 2 opens on a blocked animal, its touch shakes it with no heart, the animal in front lights up, and the rule is learnt', shown?.id === 'blocked' && stays && s.blocked === 1 && s.hearts == null && during?.phase === 'result' && (await restored(p)) && (await seenNow(p)).includes('blocked'), `shown ${JSON.stringify(shown)}, during ${JSON.stringify(during)}, state ${JSON.stringify(s)}`);
  });

  await scenario('tutorial: the arrow tutorial opens level 6 on its animal and is learnt by tapping it', null, async (p) => {
    await withSeen(p, ['basic', 'blocked'], '?level=6');
    const shown = await tut(p);
    if (shown) await p.touchscreen.tap(shown.spot.x, shown.spot.y);
    await sleep(400);
    const gone = shown ? await p.evaluate((id) => !window.__game.state().alive.includes(id), shown.target) : false;
    await settle(p);
    const bounced = await p.evaluate(() => window.__game.arrowBounces());
    check('tutorial: level 6 shows the arrow tutorial at the start on an animal that can leave, and its touch lets that animal out', shown?.id === 'arrow' && gone && bounced > 0 && (await restored(p)) && (await seenNow(p)).includes('arrow'), `shown ${JSON.stringify(shown)}, gone ${gone}, tile bounces ${bounced}`);
  });

  await scenario('dev entry', null, async (p) => {
    const a = await ui(p);
    check('flow: dev URL ?level=3 still goes straight into play', !a.title && a.label === '레벨 3' && a.playing, JSON.stringify(a));
  }, '?level=3');
}
