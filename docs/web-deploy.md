# Putting RuneKeep online

RuneKeep already builds for the browser. This is how to get it onto a URL your table can open, and
what will and will not work once it is there.

For a home game of seven or so players, **Cloudflare Pages** is the right answer: free, no bandwidth
cap, no card required, and it serves the 63 MB of card art without complaint.

---

## Before you start: read this bit

Three things are true of the web build. The first is the one that will surprise your players.

**Everything is stored in the browser, on that device.** There is no server and no account. A
character made on your laptop does not appear on a player's phone. Sharing happens the way it already
does: export a `.rune`, send it, import it. That is not a limitation of the hosting, it is how the app
works, and it stays true wherever you put it.

**Storage is IndexedDB, so portraits are fine** (since v0.24.2). It used to be `localStorage`, capped
around 5 MB, which a handful of inline portraits would fill, and it threw rather than degrading, so a
save silently did not happen. IndexedDB has no practical cap: browsers grant a share of free disk,
typically hundreds of MB. A browser that blocks IndexedDB entirely (private mode in some engines)
falls back to `localStorage` and its old limit, which is the worst case rather than the normal one.

Existing browser data migrates on first load, and the old `localStorage` copy is deliberately left in
place so rolling back a deploy does not strand anyone.

**NFC card sharing does not exist in a browser**, and neither does the `.rune` file association. Sharing a
card from a browser exports it as a file instead (v0.30.0). Import
becomes a file picker, export becomes a download. Everything else, including sound, works.

---

## Checking the web build before you ship it

The web target is the platform nobody plays on day to day, so it rots quietly. In v0.24.3 it was
broken in four separate ways at once, and `tsc`, `eslint` and `jest` all passed the whole time:

- every sound threw an uncaught error, because `createBufferSource` takes an options object on native
  and a bare boolean on web;
- no list scrolled, because a browser does not scroll an `overflow` container from a press-and-drag,
  and dragging card art started an HTML5 image drag instead;
- every class banner painted with the wrong gradient, because SVGO minifies ids per file and all the
  inline `<svg>`s share one document;
- the sheet's loading veil never lifted on its own, because nothing is ever forged on web, so it hung
  opaque for its 7.5 second fallback while swallowing every tap.

None of those are visible to a type checker, so run the browser instead. It uses the Chrome you
already have, and exits non-zero if the page logs anything:

```bash
npx expo start --web
node scripts/web-probe.mjs http://localhost:8081 ./out tap:SKIP tap:CHARACTERS shot:roster
```

Read the header of `scripts/web-probe.mjs` for the full step vocabulary. Worth doing before any
release that touches web, and worth doing on the exported `dist/` too, since the dev server and the
static export do not bundle identically.

---

## 1. Build it

```bash
npx expo export --platform web
```

That writes a `dist/` folder: 16 static HTML routes, one 4.7 MB JS bundle, and about 59 MB of card
art. It takes roughly 90 seconds. `dist/` is gitignored, which is correct, you do not want it in the
repo.

Check it locally before uploading:

```bash
npx serve dist
```

Open the URL it prints. You should get the main menu. If you get a blank page, look at the browser
console rather than guessing.

---

## 2. Put it on Cloudflare Pages

### The quick way (no repo connection, good for a first try)

1. Make a free account at <https://dash.cloudflare.com>.
2. **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
3. Name the project `runekeep`. Drag the **contents of `dist/`** onto the upload box, not the folder
   itself. It is ~900 files, so give it a minute.
4. **Deploy**. You get `https://runekeep.pages.dev`.

To update later, repeat step 2 with **Create new deployment**.

### The better way (deploys itself when you push)

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, and pick the RuneKeep repo.
2. Settings:
   - Framework preset: **None**
   - Build command: `npx expo export --platform web`
   - Build output directory: `dist`
   - Node version: add an environment variable `NODE_VERSION` = `22`
3. **Save and Deploy.**

Every push to `main` now rebuilds and republishes. Cloudflare's free build minutes are generous and a
90 second build will not trouble them.

### Routing

Expo Router's static export writes a real `.html` for every route, so Cloudflare serves them without
any redirect rules. Nothing extra to configure.

---

## 2b. Cache headers, and the stale-build trap

`public/_headers` ships with the build and both Cloudflare Pages and Netlify read it. Do not remove
it. It says: never cache HTML, cache the content-hashed assets forever.

This matters more than it sounds. `index.html` names the JS bundle, and that name changes on every
export. A browser holding an old `index.html` therefore runs an old build, forever, with nothing on
screen to say so. That is exactly what happened right after v0.24.3 shipped: Chrome fetched the new
page and showed the fixed card banners, Firefox served its cached copy and showed the broken ones,
from the same URL at the same moment. It looked like a Firefox rendering bug and it was not.

If you ever suspect it: hard reload (Ctrl+Shift+R), or compare the bundle filename in the network
tab against the one in your `dist/index.html`.

---

## 3. Installing it as an app

The site installs on Android, iPhone and desktop, and this is wired up as of v0.24.4:

- `public/manifest.json` names it, points at `icon-192.png` and `icon-512.png`, and asks for
  `display: standalone`.
- `public/sw.js` is a service worker. **Android will not install a real app without one.** Chrome
  only builds a WebAPK (its own icon, its own window, no address bar) for a site that registers a
  service worker with a `fetch` handler. With a manifest alone, "Add to Home screen" makes a plain
  bookmark that still opens in a browser tab, which is what it did before.
- `src/app/+html.tsx` registers the worker, adds the `apple-mobile-web-app-*` tags iOS needs (it
  ignores the manifest's display mode), and catches `beforeinstallprompt` before React mounts, since
  the event is only usable if it was captured when it fired.
- The welcome tour's FIRST page offers the install, on mobile web only: the real dialog on Android,
  Share then Add to Home Screen on iOS, and the browser menu anywhere else. It never blocks; the
  button reads "Not now". See `src/lib/pwa-install.ts`.

The worker also makes the app work offline once it has been opened, which is the point at a table
with bad wifi. Its rule: navigations and code are **network first** (so a deploy is picked up the
moment it is reachable), art and fonts are **cache first** (they are content-hashed). `CACHE` carries
the app version, so a release drops every old cache.

Anything in `public/` is copied into `dist/` untouched.

On a desktop, Chrome and Edge offer **Install app** in the address bar. It gets its own window, its
own icon and no browser chrome.

The tablet frame does the rest. A desktop reports well over 600dp, so the app draws itself as a
phone-shaped column in the middle of the window with the margins filled, exactly as it does on a
tablet. No desktop-specific layout work is needed.

---

## Other hosts

All free, all fine for this:

| Host | Notes |
|---|---|
| **Cloudflare Pages** | Recommended. No bandwidth cap, which matters with 59 MB of art. |
| **Netlify** | Same drag-and-drop flow. Free tier caps at 100 GB/month, still plenty. |
| **Vercel** | Same again. Its free tier is meant for personal use, which this is. |
| **GitHub Pages** | Free and already where the repo lives, but it serves from `/RuneKeep/`, so you must set `experiments.baseUrl` to `/RuneKeep` in `app.json` and rebuild, or every asset 404s. Also a soft 1 GB limit. |

---

## If you want a real `.exe` instead

Once `dist/` exists, [Tauri 2](https://v2.tauri.app) turns it into a Windows executable. It uses the
WebView2 that already ships with Windows 10 and 11, so it adds about 3 MB of its own on top of the
app's assets, around 66 MB total. Electron would add roughly 120 MB of Chromium for the same result.

```bash
npm create tauri-app@latest
```

Point `frontendDist` at `../dist` in `src-tauri/tauri.conf.json` and build. It needs a Rust toolchain
on the build machine, which is the only real cost.

Worth being honest about the trade: a Tauri build is a file you have to hand to each player and
rebuild for each update. A Cloudflare URL is a link you send once. For a home game, the link wins.
