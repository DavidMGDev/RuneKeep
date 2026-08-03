/**
 * CPU-profile the web build while it is being used, and print where the time actually goes.
 * node profile.mjs <url> <steps...>   steps: tap:LABEL xy:X,Y swipe:x1,y1,x2,y2 wait:MS text shot:N
 * Profiling starts after the steps prefixed with `!` ... simpler: everything after `PROFILE` is profiled.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const { existsSync } = await import('node:fs');
const exe = CHROME.find((p) => existsSync(p));
if (!exe) throw new Error('no chrome');

const [, , url, ...steps] = process.argv;
const THROTTLE = Number(process.env.THROTTLE || 4);

// MOBILE=1 emulates a phone: a 412x892 viewport at 3x device pixels, which is what actually makes a
// browser slow. Desktop paints the same tree into a quarter of the pixels.
const MOBILE = !!process.env.MOBILE;
const viewport = MOBILE
  ? { width: 412, height: 892, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { width: 1280, height: 900 };
const browser = await puppeteer.launch({ executablePath: exe, headless: false, defaultViewport: viewport, args: [MOBILE ? '--window-size=440,980' : '--window-size=1300,960'] });
const page = (await browser.pages())[0];
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

const client = await page.target().createCDPSession();
await client.send('Profiler.enable');
await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

// SEED=1 puts one level-5 character straight into the browser store, so the sheet (the screen worth
// measuring) is one tap away instead of a twenty-step creation walk.
if (process.env.SEED) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => new Promise((res, rej) => {
    const file = {
      schemaVersion: 1, id: 'probe-1', createdAt: '2026-01-01T00:00:00.000Z', name: 'Probe',
      portraitUri: null, className: 'warrior',
      subclassCardId: 'subclass-stalwart-1-foundation', ancestryCardId: 'ancestry-human',
      communityCardId: 'community-highborne',
      domainCardIds: ['blade-01-1', 'blade-01-2', 'bone-01-1', 'blade-02-1', 'bone-02-1'],
      enabledCardIds: ['blade-01-1', 'blade-01-2', 'bone-01-1', 'blade-02-1', 'bone-02-1'],
      weaponPrimaryId: 'wpn-broadsword', armorId: 'arm-gambeson', level: 5,
      inventoryItemIds: ['consumable-minor-health-potion', 'inv-opt-a-sharpening-stone'],
      experiences: [{ id: 'exp-1', title: 'Sailor for a decade', text: '', imageUri: null, color: '#3A6E8F', modifier: 2 }],
    };
    const req = indexedDB.open('runekeep', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(JSON.stringify([file]), 'runekeep.characters');
      tx.objectStore('kv').put(JSON.stringify({ seen: ['welcome', 'menu', 'characters', 'create', 'sheet'] }), 'runekeep.onboarding');
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    };
  }));
}

await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));

async function tap(label, nth = 1) {
  const found = await page.evaluate((label, nth) => {
    const all = [...document.querySelectorAll('*')].filter((e) => {
      if (e.children.length) return false;
      const t = (e.textContent || '').trim().toUpperCase();
      if (t !== label.toUpperCase()) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const el = all[nth - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label, nth);
  if (!found) { console.log(`  ! no "${label}"`); return; }
  await page.mouse.click(found.x, found.y);
  await new Promise((r) => setTimeout(r, 900));
}

async function swipe(x1, y1, x2, y2) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(x1 + ((x2 - x1) * i) / 20, y1 + ((y2 - y1) * i) / 20);
    await new Promise((r) => setTimeout(r, 12));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 600));
}

let profiling = false;
for (const s of steps) {
  if (s === 'PROFILE') { await client.send('Profiler.start'); profiling = true; console.log('--- profiling ---'); continue; }
  const [cmd, arg] = [s.slice(0, s.indexOf(':')) || s, s.slice(s.indexOf(':') + 1)];
  console.log('step', s);
  if (cmd === 'tap') { const [l, n] = arg.split('@'); await tap(l, Number(n || 1)); }
  else if (cmd === 'xy') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); await new Promise((r) => setTimeout(r, 900)); }
  else if (cmd === 'xy2') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y, { delay: 25 }); await new Promise((r) => setTimeout(r, 90)); await page.mouse.click(x, y, { delay: 25 }); await new Promise((r) => setTimeout(r, 900)); }
  else if (cmd === 'swipe') { const [a, b, c, d] = arg.split(',').map(Number); await swipe(a, b, c, d); }
  else if (cmd === 'wait') await new Promise((r) => setTimeout(r, Number(arg)));
  else if (cmd === 'hold') { const [x, y, ms] = arg.split(',').map(Number); await page.mouse.move(x, y); await page.mouse.down(); await new Promise((r) => setTimeout(r, ms || 800)); await page.mouse.up(); await new Promise((r) => setTimeout(r, 600)); }
  else if (cmd === 'key') {
    const [spec, n] = arg.split('@');
    const shift = spec.startsWith('Shift+');
    const k = shift ? spec.slice(6) : spec;
    for (let i = 0; i < Number(n || 1); i++) {
      if (shift) await page.keyboard.down('Shift');
      await page.keyboard.press(k);
      if (shift) await page.keyboard.up('Shift');
      await new Promise((r) => setTimeout(r, 320));
    }
  }
  else if (cmd === 'fps') {
    const out = await page.evaluate((ms) => new Promise((res) => {
      const t = []; let last = performance.now(); const end = last + ms;
      (function loop(now) { t.push(now - last); last = now; if (now < end) requestAnimationFrame(loop); else res(t.slice(1)); })(last);
    }), Number(arg));
    const sorted = [...out].sort((a, b) => a - b);
    const worst = sorted.slice(-5).map((n) => n.toFixed(0)).join(',');
    console.log(`  fps: ${(1000 / (out.reduce((a, b) => a + b, 0) / out.length)).toFixed(1)} avg, median frame ${sorted[Math.floor(sorted.length / 2)].toFixed(0)}ms, worst ${worst}ms, frames ${out.length}`);
  }
  else if (cmd === 'shot') await page.screenshot({ path: `${arg}.png` });
  else if (cmd === 'text') console.log((await page.evaluate(() => document.body.textContent.replace(/s+/g," "))).slice(0, 1500));
  else if (cmd === 'eval') console.log(await page.evaluate(arg));
}

if (profiling) {
  const { profile } = await client.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = profile.samples?.length || 0;
  for (const id of profile.samples || []) {
    const n = byId.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'}  ${f.url.split('/').pop()}:${f.lineNumber}`;
    self.set(key, (self.get(key) || 0) + 1);
  }
  const dur = (profile.endTime - profile.startTime) / 1000;
  console.log(`\n=== ${total} samples over ${dur.toFixed(0)}ms (cpu x${THROTTLE}) ===`);
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, v]) => console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`));
  writeFileSync('profile.cpuprofile', JSON.stringify(profile));
}
console.log('\nerrors:', errs.length ? errs.slice(0, 10) : 'none');
await browser.close();
