---
name: runekeep_rune_ext_sharing
description: "v0.30.0 renamed the file extension to .rune but the JSON envelope tag stays \"rkp\" on purpose (cross-version opening); sharing/export now works on web via Blob download, and the card-menu share wedge is unconditional"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-08-01T02:40:20.930Z
---

v0.30.0 (2026-07-31).

**Extension:** files are written `.rune` (`RUNE_EXT` in `src/lib/rkp.ts`). The envelope's
`format` field still serializes as `'rkp'` deliberately, and `parseRkp` accepts both, so a v0.30
export still opens on a phone running v0.29. Do not "finish the rename" by writing `'rune'` without a
reason. `app.json` keeps BOTH `.rkp` and `.rune` intent filters (and both MIME pairs);
`isFilePayload` accepts both extensions.

**Web export/import now work.** `exportRkp` branches: native = OS share sheet, web = Blob +
`<a download>`. `pickRkp` reads `res.assets[0].file.text()` on web (falling back to `fetch(uri)`).
`pickCards()` returns `LibraryCard[]` from either a `card` or an `expansion` file.

**The share wedge is unconditional.** `cardMenuOptions(isFavorites, nfcAvailable)` always returns the
5th `nfc` option; `nfcAvailable` only picks the LABEL ("Share" vs "Export"). This keeps the wedge
count constant across platforms, which the radial hit-test depends on. `NfcSendModal` renders
`ExportOnlyPanel` when `nfcModulesPresent()` is false.

**How to apply:** never gate a share entry point on `nfcModulesPresent()` again; gate the panel's
contents instead.
