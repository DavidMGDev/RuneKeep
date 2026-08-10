---
name: runekeep-v0240-gotchas
description: "v0.24.0 - Expo Router 404s on shared file URLs (+native-intent), only the MODERN expo-file-system reads content:// , forged cache must key on app version"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-28T01:59:23.012Z
---

RuneKeep v0.24.0. Four things that cost real time to find:

**Expo Router treats every launch URL as a route.** A `.rkp` shared from WhatsApp arrives as
`content://com.whatsapp.provider.media/item/<uuid>`; the router failed to resolve it and showed
"Unmatched Route" before any app code ran. The fix is `src/app/+native-intent.ts` exporting
`redirectSystemPath({ path })`, which parks file URLs and returns `/`. **Any future non-route launch URL
goes through there.**

**Only the MODERN `expo-file-system` can read a `content://` URI.** `new File(uri).textSync()` routes
content URIs to `ContentResolver.openInputStream` and its permission check passes them unconditionally.
The **legacy** module cannot: `isSAFUri` only matches `com.android.externalstorage`, so WhatsApp, Gmail
and Drive all throw "Unsupported scheme". Do not "fix" a content-URI read by reaching for legacy.

**Never filter incoming file URLs by extension.** A provider URI is an opaque row id with no filename.
v0.23.0's `/\.rkp$/` test silently dropped the exact case the file association exists to serve. The
intent filter already selected the file; trust it (`src/lib/incoming-url.ts`, `isFilePayload`).

**Forged card bitmaps key on the APP VERSION**, not just `FORGE_LAYOUT_V`
(`features/create/components/forged-snapshots.tsx`). Hand-bumping was forgotten and the failure is
invisible to whoever forgot it: their device has no cache so it forges fresh and looks correct, while
every existing install serves the stale bitmap forever. That is why Hope and Fear cards still showed
text-only faces after the art shipped. Stale keys are pruned once per launch.

**Data caution:** the six Hope and Fear ancestries in `src/data/void-ancestries.ts` were transcribed
from a PRE-RELEASE sheet and two had the wrong second feature entirely. They were retranscribed from
the printed faces (DH HF 025-030/063) in v0.24.0. Treat any other pre-release-sourced text as suspect.

See also [[runekeep-tablet-phone-frame]], [[runekeep-v0230-gotchas]].
