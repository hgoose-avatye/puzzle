// Browser checks in the real game: npm run test:e2e (see tests/e2e/README.md).
// Starts the game's Vite server, runs the checks in headless Chrome, prints PASS / FAIL / SKIP and always shuts both
// down. Exit code: 0 all passed (SKIP allowed), 1 a check failed, 2 the run could not start or timed out.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { runP0Checks } from './p0-checks.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5299);
/** Whole run, in ms: a hung page must not keep the job (or a CI runner) alive. */
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 300_000);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

let server;
let browser;
let cleaning;
const counts = { pass: 0, fail: 0, skip: 0 };
const failures = [];
// once the run is being shut down, scenarios still in flight only report the closed browser: keep that out of the output
const line = (tag, name, info) => { if (!cleaning) console.log(`${tag} ${name}${info ? ` — ${info}` : ''}`); };
const report = {
  pass: (name, info) => { counts.pass++; line('PASS', name, info); },
  fail: (name, info) => { counts.fail++; failures.push(`${name}${info ? ` — ${info}` : ''}`); line('FAIL', name, info); },
  skip: (name, info) => { counts.skip++; line('SKIP', name, info); },
  info: (text) => console.log(`INFO ${text}`),
};

/** Close the browser, then the server (so no page request hits a closing server), once, whatever happened. */
function cleanup() {
  cleaning ??= (async () => {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  })();
  return cleaning;
}
async function finish(code, message) {
  if (message) console.error(message);
  await cleanup();
  process.exit(code);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void finish(2, `stopped by ${sig}`));
const timer = setTimeout(() => void finish(2, `timed out after ${TIMEOUT} ms`), TIMEOUT);

try {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) await finish(2, `Chrome not found. Set CHROME_PATH. Looked at:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  server = await createServer({ configFile: 'vite.game.config.ts', logLevel: 'error', server: { port: PORT, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    // our own handlers close the browser and the server together and set the exit code
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    // CI containers usually run as root without a user namespace sandbox
    args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  });
  console.log(`game ${base} · chrome ${await browser.version()}`);
  await runP0Checks(browser, base, report);
} catch (e) {
  clearTimeout(timer);
  await finish(2, `run failed: ${e?.stack ?? e}`);
}
// after a timeout or a signal, finish() is already shutting down with exit code 2
if (!cleaning) {
  clearTimeout(timer);
  console.log(`\n${counts.pass} PASS · ${counts.fail} FAIL · ${counts.skip} SKIP`);
  if (failures.length) console.log(`failed:\n  ${failures.join('\n  ')}`);
  await finish(counts.fail ? 1 : 0);
}
