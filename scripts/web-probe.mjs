/**
 * Drive the WEB build in a real browser and report what breaks (v0.24.3).
 *
 * The web target is the one platform nobody plays on day to day, so it rots quietly: it broke in four
 * separate ways at once (every sound threw, no list scrolled with a mouse, every class banner painted
 * with the wrong gradient, and the sheet's loading veil never lifted) and none of it showed up in
 * `tsc`, `eslint` or `jest`. This is the check that catches that class of bug: it opens the app in the
 * Chrome that is already installed, walks it with real mouse and keyboard input, and prints every
 * console error, failed request and uncaught exception.
 *
 * Needs a running server:
 *   npx expo start --web                 (then: node scripts/web-probe.mjs http://localhost:8081)
 *   npx expo export --platform web && npx serve dist
 *
 * Steps are given on the command line and run in order:
 *   tap:LABEL[@n]      click the nth visible element whose text is LABEL
 *   xy:X,Y             click a point
 *   hold:X,Y,MS        press and hold
 *   swipe:X1,Y1,X2,Y2  press, drag in small steps, release (a real gesture, not a jump)
 *   type:TEXT          type into whatever has focus
 *   key:Enter          press a key
 *   shot:NAME          screenshot to NAME.png
 *   text               dump the visible text
 *   eval:EXPR          evaluate EXPR in the page and log the result
 *   wait:MS            pause
 *
 * Example, a full character from an empty browser:
 *   node scripts/web-probe.mjs http://localhost:8081 ./out \
 *     tap:SKIP tap:CHARACTERS xy:600,418 tap:CONTINUE tap:SKIP tap:RANDOM shot:class
 *
 * Exits non-zero if the page logged any error, so it can gate a release.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const [url = 'http://localhost:8081', out = '.', ...steps] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const executablePath = CHROME_CANDIDATES.find((p) => {
  try {
    return require('node:fs').existsSync(p);
  } catch {
    return false;
  }
});
if (!executablePath) {
  console.error('No Chrome or Edge found. Set CHROME_PATH.');
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: process.env.RK_HEADED ? false : true,
  // A persistent profile keeps IndexedDB between runs, so a character made in one run is still there
  // in the next. Leave it unset for a first-run (onboarding) check.
  userDataDir: process.env.RK_PROFILE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1 });

const log = [];
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => errors.push(`[uncaught] ${e.message}\n    ${(e.stack ?? '').split('\n').slice(1, 4).join('\n    ')}`));
page.on('requestfailed', (r) => errors.push(`[request failed] ...${r.url().slice(-80)} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ...${r.url().slice(-80)}`); });

/** Centre of the nth visible LEAF element whose trimmed text matches, or null. */
const find = (text, nth) =>
  page.evaluate(
    (t, n) => {
      const hits = [...document.querySelectorAll('div,span,a')].filter((e) => {
        if (e.offsetParent === null || e.innerText?.trim().toUpperCase() !== t.toUpperCase()) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const el = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)))[n];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    text,
    nth,
  );

await page.goto(url, { waitUntil: 'networkidle2', timeout: 240000 });
await wait(3500);

for (const step of steps) {
  const [kind, ...rest] = step.split(':');
  const arg = rest.join(':');
  const nums = () => arg.split(',').map(Number);
  if (kind === 'tap') {
    const [label, nth] = arg.split('@');
    const p = await find(label, Number(nth ?? 0));
    if (!p) { log.push(`tap "${label}" NOT FOUND`); continue; }
    await page.mouse.click(p.x, p.y, { delay: 40 });
    log.push(`tap "${label}" at ${Math.round(p.x)},${Math.round(p.y)}`);
    await wait(900);
  } else if (kind === 'xy') {
    const [x, y] = nums();
    await page.mouse.click(x, y, { delay: 40 });
    log.push(`click ${x},${y}`);
    await wait(900);
  } else if (kind === 'hold') {
    const [x, y, ms] = nums();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await wait(ms || 1200);
    await page.mouse.up();
    log.push(`hold ${x},${y}`);
    await wait(900);
  } else if (kind === 'swipe') {
    const [x1, y1, x2, y2, n = 30] = nums();
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await wait(60);
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n);
      await wait(12);
    }
    await page.mouse.up();
    log.push(`swipe ${x1},${y1} -> ${x2},${y2}`);
    await wait(1200);
  } else if (kind === 'type') {
    await page.keyboard.type(arg, { delay: 30 });
    log.push(`type "${arg}"`);
  } else if (kind === 'key') {
    await page.keyboard.press(arg);
    log.push(`key ${arg}`);
    await wait(600);
  } else if (kind === 'shot') {
    await wait(700);
    await page.screenshot({ path: `${out}/${arg}.png` });
    log.push(`shot ${arg}.png`);
  } else if (kind === 'text') {
    log.push(`text:\n${(await page.evaluate(() => document.body.innerText)).slice(0, 1600)}`);
  } else if (kind === 'wait') {
    await wait(Number(arg));
  } else if (kind === 'eval') {
    log.push(`eval ${arg}\n  => ${JSON.stringify(await page.evaluate(arg))}`);
  } else {
    log.push(`unknown step "${step}"`);
  }
}

const unique = [...new Set(errors)];
writeFileSync(`${out}/web-probe.log`, `${log.join('\n')}\n\n== errors (${unique.length}) ==\n${unique.join('\n')}`);
console.log(log.join('\n'));
console.log(`\n== errors (${unique.length}) ==`);
console.log(unique.slice(0, 30).join('\n'));
await browser.close();
process.exit(unique.length ? 1 : 0);
