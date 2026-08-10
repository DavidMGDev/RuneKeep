---
name: runekeep-pwa-install
description: "v0.24.4 PWA: Android needs a SERVICE WORKER to install as a real app; the install offer leads the welcome tour on mobile web; and a 'Firefox rendering bug' was really a stale cached build"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-30T14:35:51.790Z
---

**Android will not install a PWA without a service worker.** Chrome only builds a WebAPK (own icon,
own window, no address bar) for a site registering a service worker WITH a `fetch` handler. With a
manifest alone, "Add to Home screen" makes a bookmark that still opens in a tab. That was the whole
reason RuneKeep "didn't open as an app". Fixed in v0.24.4 by `public/sw.js`.

The pieces, all web-only:
- `public/sw.js` — navigations + code **network first** (a deploy lands as soon as it is reachable,
  nobody is stranded on an old build), art/fonts **cache first** (content-hashed). Cache name carries
  the app version, so a release drops old caches. Also gives real offline: verified booting with the
  network fully cut.
- `public/manifest.json` — icons must be **192 and 512** and the declared `sizes` must match the file
  (it declared 512 while shipping a 1024).
- `src/app/+html.tsx` — registers the worker, adds `apple-mobile-web-app-*` (iOS IGNORES the
  manifest's display mode), and catches `beforeinstallprompt` into `window.__rkInstall` BEFORE React
  mounts. That event is only usable if captured when it fired, so it cannot live in a component.
- `src/lib/pwa-install.ts` — pure `installMode()` (tested) + `useInstallMode()`. Modes: `prompt`
  (Android dialog), `ios` (Share, then Add to Home Screen; Safari has no dialog), `manual` (browser
  menu), `none` (desktop, native, or already installed).
- The offer is the FIRST page of the welcome tour, mobile web only, never blocking ("Not now"), and
  removes itself once installed.

**"The banners look wrong in Firefox" was NOT a Firefox bug.** Driving real Firefox and real Chrome
against the same build showed them rendering identically, both standalone and in the app, so the
v0.24.3 `prefixIds` fix is sound in Gecko. What was being served was the PREVIOUS build out of cache:
`index.html` names the JS bundle, that name changes every export, so a cached `index.html` runs an old
build forever with nothing on screen to say so. `public/_headers` (Cloudflare Pages + Netlify read it
verbatim) now says never cache HTML, cache hashed assets forever. **Before diagnosing any "browser X
renders wrong" report, check the served bundle hash.**

Puppeteer can drive **Firefox** too: `{ browser: 'firefox', protocol: 'webDriverBiDi',
executablePath: 'C:/Program Files/Mozilla Firefox/firefox.exe' }`. Comparing engines on the same
build is what settled this in minutes.

See also [[runekeep-web-platform-gotchas]], [[runekeep-web-deploy]].
