# Putting RuneKeep online

RuneKeep already builds for the browser. This is how to get it onto a URL your table can open, and
what will and will not work once it is there.

For a home game of seven or so players, **Cloudflare Pages** is the right answer: free, no bandwidth
cap, no card required, and it serves the 63 MB of card art without complaint.

---

## Before you start: read this bit

Three things are true of the web build, and one of them will bite you.

**Everything is stored in the browser, on that device.** There is no server and no account. A
character made on your laptop does not appear on a player's phone. Sharing happens the way it already
does: export a `.rkp`, send it, import it. That is not a limitation of the hosting, it is how the app
works, and it stays true wherever you put it.

**Browser storage is about 5 MB per site, and RuneKeep uses `localStorage`.** Characters are small
(a few KB each) so a roster of a dozen is fine. **Portraits and custom card images are not.** Picked
in a browser they are stored inline, and a handful of them will fill the quota. When it fills,
`localStorage` throws rather than degrading, so a save fails rather than getting smaller. If your
players want portraits on the web version, the stores need moving to IndexedDB first (they are
already isolated behind `Platform.OS === 'web'` branches, so it is a contained change). Without
portraits you will not come near the limit.

**NFC card sharing does not exist in a browser**, and neither does the `.rkp` file association. Import
becomes a file picker, export becomes a download. Everything else, including sound, works.

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

## 3. Make it an app on the desktop

The site is one step from being installable. Add `public/manifest.json`:

```json
{
  "name": "RuneKeep",
  "short_name": "RuneKeep",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0B0E13",
  "theme_color": "#0B0E13",
  "icons": [{ "src": "/favicon.ico", "sizes": "48x48", "type": "image/x-icon" }]
}
```

Anything in `public/` is copied into `dist/` untouched. Link it from the page head via
`expo-router`'s root HTML (`src/app/+html.tsx`, create it if it does not exist).

Chrome and Edge then offer **Install app** in the address bar. It gets its own window, its own icon
and no browser chrome, which is as close to a desktop app as this needs to be. Add a service worker
later if you want it to work with the wifi off; without one it needs a connection to start, though
the browser cache will make it fast.

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
