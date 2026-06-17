# apk-build

Builds a small **offline Android APK** (arm64-v8a) and publishes it as a GitHub release. All card data is
bundled — no server, no database, no launch-time download.

## Run

From the repo root:

```bash
npm run prebuild:android      # first time only — generates the native android/ project
git checkout -- package.json  # revert expo-prebuild's package.json flip
npm run build:apk             # == powershell -File apk-build/build-apk.ps1
```

The script is idempotent: first run is ~15-25 min (Gradle + native C++ compile), re-runs are fast.

## What `build-apk.ps1` does

1. Points `ANDROID_HOME`/`ANDROID_SDK_ROOT` at the local SDK and cleans `sdkmanager` staging dirs.
2. Installs the SDK components (`platform-tools`, `build-tools;35.0.0`, `platforms;android-35`,
   `ndk;27.1.12297006`) by **direct download + 7-Zip extract** — `sdkmanager`'s own downloader stalls on
   this machine. `cmake;3.22.1` must already be present.
3. Self-heals the `react-native-audio-api` native build: installs long-path-aware **ninja 1.12.1** and
   pre-extracts the prebuilt opus/vorbis static libs (its gradle task needs `unzip`, absent in WSL here).
4. Runs `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (minify + resource-shrink on,
   debug-signed so it sideloads).
5. Renames the APK to `Runekeep <ver>.apk` and uploads it via `gh release create <ver>`.

## Bumping the release version

Edit `$ver` at the top of `build-apk.ps1` (drives the tag, the APK filename, and the release title), bump
`expo.version` in `app.json`, and rewrite the `$notes` prose for the release. Requires `gh auth login`.

## Notes

- Requires JDK 21 + Android cmdline-tools under `%LOCALAPPDATA%\Android\Sdk`.
- The generated `android/` project is gitignored; only this `apk-build/` folder is committed.
