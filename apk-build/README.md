# apk-build

Builds a small **offline Android APK** from the asset-optimized `apk-optimize` branch and uploads it
as a GitHub release. All card data is bundled (no server/DB).

## Run

```powershell
powershell -ExecutionPolicy Bypass -File ".\apk-build\build-apk.ps1"
```

Stay on the `apk-optimize` branch (it holds the compressed assets; `main` keeps the originals).

## What it does

1. Cleans any half-installed NDK + `sdkmanager` staging.
2. Installs the small SDK packages (platform-35, build-tools 35, platform-tools, cmake) via `sdkmanager`.
3. Installs **NDK r27b** by **direct download + 7-Zip extract** — `sdkmanager`'s own NDK install stalls
   badly on Windows (Defender scanning ~50k files), so it is bypassed.
4. Builds a release APK for **arm64-v8a only** (covers modern phones incl. the Samsung A54; smaller and
   far faster than a 4-ABI universal build). Minify + resource-shrink on; debug-signed so it installs.
5. Uploads `gh release create v1.0.0-android`.

First run is ~15-25 min (Gradle + native compile). Re-runs are fast (everything cached/idempotent).

## Notes

- Requires JDK 21 (present) + Android cmdline-tools (installed under `%LOCALAPPDATA%\Android\Sdk`).
- The build output (`android/`) is gitignored; only this folder is committed.
- To revert the image compression entirely: `git checkout main`.
